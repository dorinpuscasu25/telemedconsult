<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DoctorProfile;
use App\Models\HigoExamMedia;
use App\Models\HigoExamPayload;
use App\Models\HigoSyncLog;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Services\Higo\ExamMapping;
use App\Services\Higo\HigoExamIngestor;
use App\Services\Higo\HigoProvisioner;
use App\Services\ObjectiveDataSchema;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;

class AdminHigoController extends Controller
{
    private const MODELS = [
        'patient' => PatientProfile::class,
        'doctor' => DoctorProfile::class,
        'operator' => OperatorProfile::class,
    ];

    public function __construct(
        private readonly HigoProvisioner $provisioner,
        private readonly ExamMapping $mapping,
    ) {}

    /**
     * Panoul de sincronizare: starea integrării plus profilurile care nu au ajuns
     * (încă) în HIGO, ca adminul să vadă imediat ce e de reluat.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $entities = collect(self::MODELS)
            ->flatMap(fn (string $model, string $kind) => $model::query()
                ->with('user:id,name,email')
                ->latest('id')
                ->limit(200)
                ->get()
                ->map(fn (Model $profile) => [
                    'kind' => $kind,
                    'id' => $profile->getKey(),
                    'name' => $profile->user?->name ?? '—',
                    'email' => $profile->user?->email,
                    'higo_id' => $profile->{$this->idColumn($kind)},
                    'status' => $profile->higo_sync_status ?? 'never',
                    'synced_at' => $profile->higo_synced_at,
                    'error' => $profile->higo_sync_error,
                    // Credențialele contului din HIGO. Operatorul are nevoie de
                    // ele ca să intre în aplicația lor mobilă cu aparatul.
                    'higo_username' => $kind === 'patient' ? null : $profile->user?->email,
                    'higo_password' => $kind === 'patient' ? null : $profile->higo_password,
                    'can_reset_password' => $kind !== 'patient'
                        && filled($profile->{$this->idColumn($kind)})
                        && (config("higo.sync.resources.{$kind}.supports_update") ?? true),
                ]))
            ->sortBy(fn (array $row) => match ($row['status']) {
                HigoProvisioner::STATUS_FAILED => 0,
                'never' => 1,
                HigoProvisioner::STATUS_SKIPPED => 2,
                default => 3,
            })
            ->values();

        return response()->json([
            'data' => $entities,
            'summary' => [
                'enabled' => $this->provisioner->enabled(),
                'base_url_configured' => (bool) config('higo.base_url'),
                'credentials_configured' => (bool) config('higo.client_id') && (bool) config('higo.username'),
                'synced' => $entities->where('status', HigoProvisioner::STATUS_SYNCED)->count(),
                'failed' => $entities->where('status', HigoProvisioner::STATUS_FAILED)->count(),
                'never' => $entities->where('status', 'never')->count(),
            ],
            // Examinările primite din aparat: cele nelegate sunt cazurile care
            // cer atenție (pacient neprovizionat, mapare greșită a câmpurilor).
            'exams' => HigoExamPayload::withCount('media')
                ->latest()
                ->limit(50)
                ->get()
                ->map(fn (HigoExamPayload $exam) => [
                    'id' => (string) $exam->id,
                    'external_id' => $exam->external_id,
                    'higo_patient_id' => $exam->higo_patient_id,
                    'device_serial' => $exam->device_serial,
                    'consultation_request_id' => $exam->consultation_request_id ? (string) $exam->consultation_request_id : null,
                    'status' => $exam->status,
                    'error' => $exam->error,
                    'measurement_keys' => array_keys($exam->objectiveData?->payload ?? []),
                    'media_count' => (int) ($exam->media_count ?? 0),
                    'received_at' => $exam->received_at,
                ]),
            'exam_summary' => [
                'mapped' => HigoExamPayload::where('status', HigoExamPayload::STATUS_MAPPED)->count(),
                'unmatched' => HigoExamPayload::where('status', HigoExamPayload::STATUS_UNMATCHED)->count(),
                'failed' => HigoExamPayload::where('status', HigoExamPayload::STATUS_FAILED)->count(),
            ],
            'recent_logs' => HigoSyncLog::latest()->limit(30)->get([
                'id', 'operation', 'resource_type', 'status', 'method', 'endpoint', 'http_status', 'error_message', 'created_at',
            ]),
        ]);
    }

    /**
     * Ce a trimis aparatul și ce am înțeles noi din ce a trimis.
     *
     * Panoul arată payload-ul brut lângă rezultatul mapării, observație cu
     * observație: cod LOINC, denumirea lor de examinare, valoarea și unitatea
     * primite, câmpul în care au intrat și regula care a decis. Fără asta, o
     * mapare greșită se vede abia în fișa medicului, unde arată ca o
     * măsurătoare lipsă — nu ca o regulă de corectat.
     */
    public function showExam(Request $request, HigoExamPayload $exam): JsonResponse
    {
        $this->authorizeAdmin($request);

        $exam->load(['objectiveData', 'consultationRequest', 'patientProfile']);
        $raw = $exam->raw ?? [];

        return response()->json([
            'data' => [
                'id' => (string) $exam->id,
                'external_id' => $exam->external_id,
                'status' => $exam->status,
                'error' => $exam->error,
                'higo_patient_id' => $exam->higo_patient_id,
                'device_serial' => $exam->device_serial,
                'received_at' => $exam->received_at,
                'mapped_at' => $exam->mapped_at,
                'consultation_request_id' => $exam->consultation_request_id ? (string) $exam->consultation_request_id : null,
                'patient_profile' => $exam->patientProfile?->display_name,
                // Ce a ajuns efectiv în fișa medicului.
                'measurements' => $exam->objectiveData?->payload ?? [],
                // Cum s-a ajuns acolo, rând cu rând.
                'mapping' => app(HigoExamIngestor::class)->explain($raw),
                'media' => $this->serializeMedia($exam),
                'raw' => $raw,
            ],
        ]);
    }

    /**
     * Regulile de mapare în vigoare, cu implicit vs. suprascriere, plus
     * vocabularul canonic în care se poate mapa.
     */
    public function mapping(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => [
                'loinc' => $this->mapping->rules('loinc'),
                'exam_type' => $this->mapping->rules('exam_type'),
                'field' => $this->mapping->rules('field'),
            ],
            'fields' => ObjectiveDataSchema::allFields(),
            // Denumirile văzute în examinările primite, dar care nu au regulă:
            // exact lista pe care adminul trebuie s-o rezolve.
            'unmapped' => $this->unmappedSources(),
        ]);
    }

    /**
     * Salvează suprascrierile adminului și, la cerere, reaplică maparea peste
     * examinările deja primite — corectarea unei reguli nu are valoare dacă nu
     * repară și fișele existente.
     */
    public function updateMapping(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'kind' => ['required', Rule::in(array_keys(ExamMapping::SETTINGS))],
            'rules' => ['present', 'array'],
            'rules.*' => ['nullable', 'string', 'max:100'],
            'remap' => ['sometimes', 'boolean'],
        ]);

        $this->mapping->saveOverrides(
            $validated['kind'],
            collect($validated['rules'])->filter(fn ($value) => filled($value))->all(),
            $request->user()->id,
        );

        $remapped = ($validated['remap'] ?? false) ? $this->remapPayloads() : null;

        return response()->json([
            'message' => $remapped === null
                ? 'Regulile de mapare au fost salvate.'
                : 'Reguli salvate. Am remapat '.$remapped['total'].' examinări ('.$remapped['mapped'].' atașate).',
            'remapped' => $remapped,
        ]);
    }

    /**
     * Reaplică maparea peste toate examinările primite.
     */
    public function remapAll(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $result = $this->remapPayloads();

        return response()->json([
            'message' => 'Am remapat '.$result['total'].' examinări ('.$result['mapped'].' atașate, '.$result['unmatched'].' nelegate).',
            'remapped' => $result,
        ]);
    }

    /**
     * Reia maparea unei examinări primite (după corectarea regulilor).
     */
    public function remapExam(Request $request, HigoExamPayload $exam): JsonResponse
    {
        $this->authorizeAdmin($request);

        $exam = app(HigoExamIngestor::class)->map($exam);

        return response()->json([
            'message' => $exam->status === HigoExamPayload::STATUS_MAPPED
                ? 'Examinare mapată și atașată consultației.'
                : 'Maparea nu a reușit: '.($exam->error ?? 'motiv necunoscut'),
            'data' => ['id' => (string) $exam->id, 'status' => $exam->status, 'error' => $exam->error],
        ], $exam->status === HigoExamPayload::STATUS_MAPPED ? 200 : 422);
    }

    /**
     * Generează o parolă nouă pentru contul HIGO al unui prestator.
     */
    public function resetPassword(Request $request, string $kind, int $id): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = validator(['kind' => $kind], ['kind' => ['required', Rule::in(array_keys(self::MODELS))]])->validate();
        $profile = self::MODELS[$validated['kind']]::with('user')->findOrFail($id);

        $password = $this->provisioner->resetPractitionerPassword($profile);

        if ($password === null) {
            return response()->json([
                'message' => 'Nu am putut reseta parola. Resursa lor nu acceptă update sau contul nu e încă în HIGO.',
            ], 422);
        }

        return response()->json([
            'message' => 'Parolă nouă generată.',
            'data' => ['higo_username' => $profile->user?->email, 'higo_password' => $password],
        ]);
    }

    /**
     * Retrimite un singur profil, sincron, ca adminul să vadă imediat rezultatul.
     */
    public function retry(Request $request, string $kind, int $id): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = validator(['kind' => $kind], ['kind' => ['required', Rule::in(array_keys(self::MODELS))]])->validate();

        if (! $this->provisioner->enabled()) {
            return response()->json([
                'message' => 'Sincronizarea HIGO este oprită. Verifică HIGO_BASE_URL, HIGO_SYNC_ENABLED și modulul „Aparate & integrare HIGO”.',
            ], 422);
        }

        $model = self::MODELS[$validated['kind']];
        $profile = $model::with('user')->findOrFail($id);

        $success = $this->provisioner->sync($profile);
        $profile->refresh();

        return response()->json([
            'message' => $success
                ? 'Profil sincronizat cu HIGO.'
                : 'Sincronizarea a eșuat: '.($profile->higo_sync_error ?? 'motiv necunoscut'),
            'data' => [
                'kind' => $validated['kind'],
                'id' => $profile->getKey(),
                'higo_id' => $profile->{$this->idColumn($validated['kind'])},
                'status' => $profile->higo_sync_status,
                'synced_at' => $profile->higo_synced_at,
                'error' => $profile->higo_sync_error,
            ],
        ], $success ? 200 : 502);
    }

    /**
     * @return array{total: int, mapped: int, unmatched: int, failed: int}
     */
    private function remapPayloads(): array
    {
        $ingestor = app(HigoExamIngestor::class);
        $result = ['total' => 0, 'mapped' => 0, 'unmatched' => 0, 'failed' => 0];

        HigoExamPayload::orderBy('id')->chunkById(100, function ($payloads) use ($ingestor, &$result) {
            foreach ($payloads as $payload) {
                $mapped = $ingestor->map($payload);
                $result['total']++;

                match ($mapped->status) {
                    HigoExamPayload::STATUS_MAPPED => $result['mapped']++,
                    HigoExamPayload::STATUS_UNMATCHED => $result['unmatched']++,
                    default => $result['failed']++,
                };
            }
        });

        return $result;
    }

    /**
     * Denumirile de examinare și codurile LOINC văzute în examinările primite
     * care nu au nicio regulă. Sunt exact cazurile în care fișa medicului
     * afișează cheia brută a aparatului.
     *
     * @return array{exam_type: list<string>, loinc: list<string>}
     */
    private function unmappedSources(): array
    {
        $ingestor = app(HigoExamIngestor::class);
        $types = [];
        $codes = [];

        HigoExamPayload::latest('id')->limit(200)->get(['id', 'raw'])->each(function (HigoExamPayload $exam) use ($ingestor, &$types, &$codes) {
            foreach ($ingestor->explain($exam->raw ?? []) as $row) {
                // Doar ce a rămas efectiv fără regulă: o examinare rezolvată
                // după denumire nu e o problemă doar fiindcă n-are cod LOINC.
                if (($row['rule'] ?? null) !== 'unmapped') {
                    continue;
                }

                if (filled($row['exam_type'] ?? null)) {
                    $types[$row['exam_type']] = true;
                }

                if (filled($row['loinc'] ?? null)) {
                    $codes[$row['loinc']] = true;
                }
            }
        });

        return [
            'exam_type' => array_keys($types),
            'loinc' => array_keys($codes),
        ];
    }

    /**
     * Fișierele examinării, cu link semnat: adminul trebuie să poată deschide
     * imaginea sau înregistrarea ca să verifice că maparea e pe examinarea
     * corectă.
     *
     * @return list<array<string, mixed>>
     */
    private function serializeMedia(HigoExamPayload $exam): array
    {
        return HigoExamMedia::where('higo_exam_payload_id', $exam->id)
            ->orderBy('exam_type')
            ->orderBy('sequence')
            ->orderBy('id')
            ->get()
            ->map(fn (HigoExamMedia $media) => [
                'id' => (string) $media->id,
                'exam_type' => $media->exam_type,
                'kind' => $media->kind,
                'content_type' => $media->content_type,
                'sequence' => $media->sequence,
                'size_bytes' => $media->size_bytes,
                'error' => $media->error,
                'url' => $media->isStored()
                    ? URL::temporarySignedRoute(
                        'exam-media.show',
                        now()->addMinutes((int) config('higo.media.link_minutes', 60)),
                        ['media' => $media->id],
                    )
                    : null,
            ])
            ->values()
            ->all();
    }

    private function idColumn(string $kind): string
    {
        return match ($kind) {
            'patient' => 'higo_patient_id',
            'doctor' => 'higo_doctor_id',
            'operator' => 'higo_operator_id',
        };
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->loadMissing('roles')->hasRole('admin'), 403);
    }
}
