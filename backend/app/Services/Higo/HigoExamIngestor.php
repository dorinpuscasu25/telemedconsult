<?php

namespace App\Services\Higo;

use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\HigoDevice;
use App\Models\HigoExamMedia;
use App\Models\HigoExamPayload;
use App\Models\PatientProfile;
use App\Services\ObjectiveDataSchema;
use Carbon\CarbonInterface;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Primește o examinare din aparatul HIGO și o transformă în date obiective
 * atașate consultației potrivite.
 *
 * Lucrează în doi timpi, deliberat separați:
 *   1. stocarea brută — nu interpretează nimic, nu poate eșua din cauza formei;
 *   2. rezolvarea + maparea — poate eșua fără să piardă datele, iar rezultatul
 *      se recalculează oricând cu `higo:remap`.
 */
class HigoExamIngestor
{
    public function __construct(
        private readonly HigoExamFetcher $fetcher,
        private readonly HigoMediaStore $mediaStore,
        private readonly ExamMapping $mapping,
    ) {}

    /**
     * Câmpurile de structură ale resurselor FHIR. Nu sunt măsurători și nu au
     * ce căuta în fișa medicului, dar apar în orice payload al lor.
     *
     * @var list<string>
     */
    private const FHIR_ENVELOPE_KEYS = [
        'resourceType', 'id', 'meta', 'implicitRules', 'language', 'text',
        'contained', 'extension', 'modifierExtension', 'identifier', 'status',
        'subject', 'patient', 'encounter', 'partOf', 'basedOn', 'performer',
        'device', 'issued', 'class', 'type', 'serviceProvider', 'participant',
        'period', 'link', 'entry', 'total',
    ];

    /**
     * Punctul de intrare al notificărilor lor.
     *
     * Notificarea nu poartă măsurătorile — doar `diagnosticReportId`. Aducem
     * raportul și observațiile, apoi stocăm totul brut și mapăm.
     *
     * @param  array<string, mixed>  $notification
     */
    public function ingestNotification(array $notification): HigoExamPayload
    {
        return $this->ingest($this->fetcher->assemble($notification));
    }

    /**
     * Stochează payload-ul brut, apoi încearcă să-l lege și să-l mapeze.
     *
     * @param  array<string, mixed>  $raw
     */
    public function ingest(array $raw): HigoExamPayload
    {
        $externalId = $this->firstPath($raw, config('higo.exams.external_id_paths', []));

        // Livrarea repetată a aceluiași webhook nu trebuie să dubleze datele.
        $existing = $externalId
            ? HigoExamPayload::where('external_id', $externalId)->first()
            : null;

        $payload = $existing ?? new HigoExamPayload;

        $payload->fill([
            'external_id' => $externalId,
            'higo_patient_id' => $this->stripFhirReference(
                $this->firstPath($raw, config('higo.exams.patient_id_paths', []))
            ),
            'device_serial' => $this->firstPath($raw, config('higo.exams.device_serial_paths', [])),
            'raw' => $raw,
            'received_at' => $payload->received_at ?? now(),
            'status' => HigoExamPayload::STATUS_RECEIVED,
        ])->save();

        return $this->map($payload);
    }

    /**
     * Rezolvă destinatarul și scrie datele obiective. Reia în siguranță un
     * payload deja mapat: rescrie aceeași înregistrare, nu creează alta.
     */
    public function map(HigoExamPayload $payload): HigoExamPayload
    {
        // Url-urile lor expiră într-o oră, deci fișierele se aduc înainte de
        // orice altceva — chiar dacă mai jos nu găsim nicio consultație. Ce e
        // deja descărcat nu se re-cere.
        $mediaCount = $this->mediaStore->store($payload);

        try {
            $request = $this->resolveConsultationRequest($payload);

            if (! $request) {
                return $this->flag($payload, HigoExamPayload::STATUS_UNMATCHED,
                    'Nu am găsit o consultație activă pentru acest pacient/aparat.');
            }

            $measurements = $this->measurements($payload->raw ?? []);

            // Otoscopia, dermatoscopul, gâtul și auscultațiile nu au valori
            // numerice — conținutul lor sunt fișierele. O examinare cu imagini
            // sau înregistrări e validă chiar fără nicio măsurătoare.
            if ($measurements === [] && $mediaCount === 0) {
                return $this->flag($payload, HigoExamPayload::STATUS_FAILED, $this->noMeasurementsReason($payload->raw ?? []));
            }

            DB::transaction(function () use ($payload, $request, $measurements) {
                $data = ConsultationObjectiveData::updateOrCreate(
                    ['id' => $payload->consultation_objective_data_id],
                    [
                        'consultation_request_id' => $request->id,
                        'patient_profile_id' => $request->patient_profile_id,
                        'operator_id' => $request->operator_id,
                        'source' => 'higo_device',
                        'payload' => $measurements,
                        'completed_at' => $this->performedAt($payload->raw ?? []),
                    ],
                );

                $payload->fill([
                    'consultation_request_id' => $request->id,
                    'patient_profile_id' => $request->patient_profile_id,
                    'consultation_objective_data_id' => $data->id,
                    'status' => HigoExamPayload::STATUS_MAPPED,
                    'error' => null,
                    'mapped_at' => now(),
                ])->save();

                // Fișierele trebuie să știe de ce consultație aparțin: pe ele se
                // face verificarea de acces când medicul le deschide.
                HigoExamMedia::where('higo_exam_payload_id', $payload->id)
                    ->update(['consultation_request_id' => $request->id]);

                if (! $request->objective_data_completed_at) {
                    $request->forceFill(['objective_data_completed_at' => now()])->save();
                }
            });
        } catch (Throwable $exception) {
            Log::warning('HIGO exam mapping failed', [
                'payload_id' => $payload->id,
                'error' => $exception->getMessage(),
            ]);

            return $this->flag($payload, HigoExamPayload::STATUS_FAILED, $exception->getMessage());
        }

        return $payload->refresh();
    }

    /**
     * Legătura principală e id-ul pacientului la ei (cel salvat la provizionare).
     * Ca rezervă, seria aparatului duce la operator și la consultația lui în lucru.
     */
    private function resolveConsultationRequest(HigoExamPayload $payload): ?ConsultationRequest
    {
        if ($payload->higo_patient_id) {
            $profile = PatientProfile::where('higo_patient_id', $payload->higo_patient_id)->first();

            if ($profile) {
                $request = $this->openRequestForProfile($profile);

                if ($request) {
                    return $request;
                }
            }
        }

        if ($payload->device_serial) {
            $operatorId = HigoDevice::where('serial_number', $payload->device_serial)
                ->orWhere('box_serial_number', $payload->device_serial)
                ->value('assigned_user_id');

            if ($operatorId) {
                return ConsultationRequest::where('operator_id', $operatorId)
                    ->whereIn('status', ['accepted', 'rescheduled', 'new'])
                    ->whereNull('conclusion_sent_at')
                    ->latest('accepted_at')
                    ->first();
            }
        }

        return null;
    }

    private function openRequestForProfile(PatientProfile $profile): ?ConsultationRequest
    {
        return ConsultationRequest::where('patient_profile_id', $profile->id)
            ->whereNotIn('status', ['cancelled', 'rejected', 'expired', 'no_operator_available'])
            ->whereNull('conclusion_sent_at')
            ->latest('created_at')
            ->first();
    }

    /**
     * Traduce denumirile lor în vocabularul nostru. Cheile nemapate se păstrează
     * cu numele original — o mapare incompletă nu are voie să piardă date.
     *
     * @param  array<string, mixed>  $raw
     * @return array<string, mixed>
     */
    public function measurements(array $raw): array
    {
        // Forma reală a HIGO: observații FHIR, fiecare cu cod LOINC și valoare.
        if (is_array($raw['observations'] ?? null) && $raw['observations'] !== []) {
            return $this->fromObservations($raw['observations'], $raw['observationTypes'] ?? []);
        }

        $source = null;

        foreach (config('higo.exams.measurements_paths', []) as $path) {
            $candidate = Arr::get($raw, $path);

            if (is_array($candidate) && $candidate !== []) {
                $source = $candidate;
                break;
            }
        }

        // Unele integrări trimit măsurătorile direct în rădăcină. În cazul ăsta
        // scoatem întâi câmpurile administrative, altfel „plicul” FHIR
        // (resourceType, status, subject…) ar ajunge în fișa medicului ca și cum
        // ar fi măsurători.
        $source ??= Arr::except($raw, array_merge(
            self::FHIR_ENVELOPE_KEYS,
            config('higo.exams.external_id_paths', []),
            config('higo.exams.patient_id_paths', []),
            config('higo.exams.device_serial_paths', []),
            config('higo.exams.performed_at_paths', []),
        ));

        $map = $this->mapping->fields();
        $measurements = [];

        foreach ($this->flatten($source) as $key => $value) {
            if ($value === null || $value === '' || is_array($value)) {
                continue;
            }

            $canonical = $map[$key] ?? $key;
            $measurements[$canonical] = $value;
        }

        return $measurements;
    }

    /**
     * Explicația mapării, pentru panoul de admin: fiecare observație primită,
     * cu ce cod a venit, în ce câmp a intrat și după ce regulă.
     *
     * Fără asta, o mapare greșită se vede abia în fișa medicului — și acolo
     * arată ca o măsurătoare lipsă, nu ca o regulă de corectat.
     *
     * @param  array<string, mixed>  $raw
     * @return list<array<string, mixed>>
     */
    public function explain(array $raw): array
    {
        $observations = is_array($raw['observations'] ?? null) ? $raw['observations'] : [];

        if ($observations === []) {
            return collect($this->measurements($raw))
                ->map(fn ($value, string $key) => [
                    'observation_id' => null,
                    'exam_type' => null,
                    'loinc' => null,
                    'raw_value' => $value,
                    'raw_unit' => null,
                    'key' => $key,
                    'label' => ObjectiveDataSchema::label($key),
                    'value' => $value,
                    'unit' => ObjectiveDataSchema::unit($key),
                    'converted' => false,
                    'rule' => ObjectiveDataSchema::knows($key) ? 'field' : 'unmapped',
                    'known' => ObjectiveDataSchema::knows($key),
                ])
                ->values()
                ->all();
        }

        $types = $raw['observationTypes'] ?? [];
        $rows = [];

        foreach ($observations as $observation) {
            $rows[] = $this->describeObservation($observation, is_array($types) ? $types : []);
        }

        return $rows;
    }

    /**
     * Traduce observațiile FHIR în vocabularul nostru.
     *
     * Fiecare observație are un cod LOINC și o valoare. Când codul nu ne e
     * cunoscut, cădem pe denumirea lor de examinare („TEMPERATURE_EXAM”), iar
     * dacă nici aceea nu e mapată, păstrăm cheia originală — nimic nu se pierde.
     *
     * @param  list<array<string, mixed>>  $observations
     * @param  array<string, string>  $types
     * @return array<string, mixed>
     */
    private function fromObservations(array $observations, array $types): array
    {
        $measurements = [];

        foreach ($observations as $observation) {
            $row = $this->describeObservation($observation, $types);

            if ($row['value'] === null || $row['value'] === '') {
                continue;
            }

            $key = $row['key'];

            // Două observații care cad pe același câmp înseamnă că maparea le
            // confundă (ureche stângă și dreaptă, de pildă). A doua NU o
            // suprascrie pe prima: primește un sufix, ca medicul să vadă ambele
            // valori și adminul să poată corecta regula.
            if (array_key_exists($key, $measurements)) {
                $key = $this->uniqueKey($measurements, $row);
            }

            $measurements[$key] = $row['value'];
        }

        return $measurements;
    }

    /**
     * O observație FHIR tradusă în vocabularul nostru, cu tot ce a stat la baza
     * traducerii. Aceeași funcție servește și maparea, și explicația din admin,
     * ca panoul să nu poată arăta altceva decât s-a scris efectiv în fișă.
     *
     * @param  array<string, mixed>  $observation
     * @param  array<string, string>  $types
     * @return array<string, mixed>
     */
    private function describeObservation(array $observation, array $types): array
    {
        $id = (string) Arr::get($observation, 'id', '');
        $code = (string) Arr::get($observation, 'code.coding.0.code', '');
        $display = (string) ($types[$id] ?? Arr::get($observation, 'code.text', ''));

        $fallback = $display ?: ($code ?: 'observation_'.$id);
        $resolved = $this->mapping->resolve($code, $display, $fallback);

        // `valueQuantity.unit` NU e o valoare de rezervă: o observație fără
        // valoare, dar cu unitate, nu are ce scrie în fișă.
        $rawValue = Arr::get($observation, 'valueQuantity.value')
            ?? Arr::get($observation, 'valueString')
            ?? Arr::get($observation, 'valueBoolean');
        $rawUnit = Arr::get($observation, 'valueQuantity.unit')
            ?? Arr::get($observation, 'valueQuantity.code');

        $normalized = ExamUnits::normalize($resolved['key'], $rawValue, is_string($rawUnit) ? $rawUnit : null);

        return [
            'observation_id' => $id ?: null,
            'exam_type' => $display ?: null,
            'loinc' => $code ?: null,
            'raw_value' => $rawValue,
            'raw_unit' => $normalized['original_unit'],
            'key' => $resolved['key'],
            'label' => ObjectiveDataSchema::label($resolved['key']),
            'value' => $normalized['value'],
            'unit' => $normalized['unit'],
            'converted' => $normalized['converted'],
            'rule' => $resolved['rule'],
            'known' => ObjectiveDataSchema::knows($resolved['key']),
        ];
    }

    /**
     * @param  array<string, mixed>  $measurements
     * @param  array<string, mixed>  $row
     */
    private function uniqueKey(array $measurements, array $row): string
    {
        // Denumirile lor sunt integral cu majuscule („RIGHT_EAR_EXAM”), deci
        // `Str::snake` le-ar sparge literă cu literă.
        $suffix = Str::lower(preg_replace('/[^A-Za-z0-9]+/', '_', (string) ($row['exam_type'] ?? $row['observation_id'] ?? 'alt')) ?? 'alt');
        $candidate = $row['key'].'_'.$suffix;

        for ($index = 2; array_key_exists($candidate, $measurements); $index++) {
            $candidate = $row['key'].'_'.$suffix.'_'.$index;
        }

        return $candidate;
    }

    /**
     * Măsurătorile pot veni ca `{"spo2": 98}` sau ca `{"spo2": {"value": 98}}`.
     * Aplatizăm al doilea caz la valoarea propriu-zisă.
     *
     * @param  array<string, mixed>  $source
     * @return array<string, mixed>
     */
    private function flatten(array $source): array
    {
        $flat = [];

        foreach ($source as $key => $value) {
            if (is_array($value)) {
                $flat[$key] = $value['value'] ?? $value['result'] ?? $value['text'] ?? null;

                continue;
            }

            $flat[$key] = $value;
        }

        return $flat;
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    private function performedAt(array $raw): CarbonInterface
    {
        $value = $this->firstPath($raw, config('higo.exams.performed_at_paths', []));

        if (! $value) {
            return now();
        }

        try {
            return Carbon::parse($value);
        } catch (Throwable) {
            return now();
        }
    }

    /**
     * Prima cale candidată care există în payload.
     *
     * @param  array<string, mixed>  $raw
     * @param  list<string>  $paths
     */
    private function firstPath(array $raw, array $paths): ?string
    {
        foreach ($paths as $path) {
            $value = Arr::get($raw, $path);

            if (is_string($value) || is_int($value)) {
                return (string) $value;
            }
        }

        return null;
    }

    /**
     * Diagnostic util în panoul de admin. HIGO folosește `Encounter` pentru
     * notificări, iar în FHIR un Encounter nu poartă măsurătorile în el: acelea
     * sunt resurse `Observation` separate. Distingem cazul ăsta de „payload
     * necunoscut”, pentru că soluția e alta (interogăm Observation-urile).
     *
     * @param  array<string, mixed>  $raw
     */
    private function noMeasurementsReason(array $raw): string
    {
        $resourceType = $raw['resourceType'] ?? null;

        if (is_string($resourceType) && strcasecmp($resourceType, 'Encounter') === 0) {
            return 'Notificare de tip Encounter, fără măsurători incluse — trebuie interogate resursele Observation ale acestui Encounter.';
        }

        return 'Payload fără măsurători recognoscibile. Verifică `higo.exams.measurements_paths` din config/higo.php.';
    }

    /**
     * API-ul lor e HL7 FHIR, deci referințele vin ca `Patient/705`, nu ca `705`.
     * Păstrăm doar id-ul, ca să se potrivească cu `higo_patient_id`-ul salvat la
     * provizionare.
     */
    private function stripFhirReference(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return preg_replace('#^(Patient|Person|RelatedPerson)/#i', '', $value) ?: $value;
    }

    private function flag(HigoExamPayload $payload, string $status, string $error): HigoExamPayload
    {
        $payload->forceFill([
            'status' => $status,
            'error' => mb_substr($error, 0, 1000),
        ])->save();

        return $payload;
    }
}
