<?php

namespace App\Services\Higo;

use App\Models\HigoExamMedia;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Aduce din HIGO datele unei examinări, pornind de la notificare.
 *
 * Notificarea lor nu conține măsurătorile — doar `diagnosticReportId`. De acolo
 * se citește raportul (care spune pacientul și ce observații are), iar apoi
 * observațiile propriu-zise, care poartă valorile.
 */
class HigoExamFetcher
{
    public function __construct(private readonly HigoClient $client) {}

    /**
     * Construiește payload-ul complet al unei examinări: notificarea primită,
     * raportul și observațiile. Rezultatul e stocat brut, deci orice câmp pe
     * care nu-l înțelegem încă rămâne disponibil pentru o remapare ulterioară.
     *
     * @param  array<string, mixed>  $notification
     * @return array<string, mixed>
     */
    public function assemble(array $notification): array
    {
        $reportId = $this->reportId($notification);

        // Ce nu e o notificare de-a lor trece mai departe neatins: acceptăm și
        // payload-uri care poartă direct măsurătorile, ca integrarea să nu depindă
        // de o singură formă.
        if (! $reportId) {
            return $notification;
        }

        $raw = ['notification' => $notification];
        $report = $this->fetchDiagnosticReport($reportId);

        if (! $report) {
            return $raw;
        }

        $raw['diagnosticReport'] = $report;

        // Denumirile lor de examinare („TEMPERATURE_EXAM”) sunt mai lizibile
        // decât codurile LOINC, deci le păstrăm pe id-ul observației. Tot ele
        // sunt și cheia de căutare: fără tip, observația nu se poate citi.
        $typesById = collect(Arr::get($report, 'result', []))
            ->mapWithKeys(fn ($entry) => [
                (string) $this->idFromReference(Arr::get($entry, 'reference')) => Arr::get($entry, 'display'),
            ])
            ->filter(fn ($display, $id) => $id !== '' && filled($display))
            ->all();

        if ($typesById !== []) {
            $raw['observations'] = $this->fetchObservations($typesById);
            // Otoscopia, dermatoscopul, gâtul și auscultațiile nu au nicio
            // valoare numerică: tot ce a măsurat operatorul e în `Media`.
            $raw['media'] = $this->fetchMedia($raw['observations'], $typesById);
        }

        $raw['observationTypes'] = $typesById;

        return $raw;
    }

    /**
     * @param  array<string, mixed>  $notification
     */
    public function reportId(array $notification): ?string
    {
        foreach (['data.diagnosticReportId', 'diagnosticReportId', 'data.id'] as $path) {
            $value = Arr::get($notification, $path);

            if (is_string($value) || is_int($value)) {
                return (string) $value;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function fetchDiagnosticReport(string $reportId): ?array
    {
        $bundle = $this->get('/api/fhir/DiagnosticReport', ['_id' => $reportId], 'higo.exam.fetch_report');

        return $bundle ? $this->firstResource($bundle) : null;
    }

    /**
     * Căutarea lor de `Observation` cere OBLIGATORIU perechea `_id` + `type`:
     * numai cu `_id` răspunde 400 „does not know how to handle GET
     * operation[Observation]”. Tipul vine din `result[].display` al raportului,
     * iar `type` nu acceptă mai multe valori, deci mergem observație cu
     * observație — sunt câteva pe examinare.
     *
     * @param  array<string, string>  $typesById  id observație => tip („SKIN_EXAM”)
     * @return list<array<string, mixed>>
     */
    public function fetchObservations(array $typesById): array
    {
        $observations = [];

        foreach ($typesById as $id => $type) {
            $bundle = $this->get(
                '/api/fhir/Observation',
                ['_id' => (string) $id, 'type' => (string) $type],
                'higo.exam.fetch_observations',
            );

            if (! $bundle) {
                continue;
            }

            foreach (Arr::get($bundle, 'entry', []) as $entry) {
                $resource = Arr::get($entry, 'resource');

                if (is_array($resource)) {
                    $observations[] = $resource;
                }
            }
        }

        return $observations;
    }

    /**
     * Imaginile și înregistrările fiecărei observații.
     *
     * `Media` se caută cu aceeași pereche obligatorie ca `Observation`: `_id` +
     * `type`, tipul fiind al examinării părinte. Url-ul primit e un blob Azure
     * semnat, valabil o oră — de aceea fișierul se descarcă imediat
     * (`HigoMediaStore`), nu se ține linkul.
     *
     * @param  list<array<string, mixed>>  $observations
     * @param  array<string, string>  $typesById
     * @return list<array<string, mixed>>
     */
    public function fetchMedia(array $observations, array $typesById): array
    {
        $media = [];

        foreach ($observations as $observation) {
            $type = $typesById[(string) Arr::get($observation, 'id')] ?? null;

            if (blank($type)) {
                continue;
            }

            foreach (Arr::get($observation, 'basedOn', []) as $entry) {
                $reference = Arr::get($entry, 'reference');

                if (! is_string($reference) || ! str_starts_with($reference, 'Media/')) {
                    continue;
                }

                $resource = $this->fetchMediaResource($this->idFromReference($reference), (string) $type);

                if ($resource !== null) {
                    $media[] = $resource;
                }
            }
        }

        return $media;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function fetchMediaResource(?string $mediaId, string $type): ?array
    {
        if (blank($mediaId)) {
            return null;
        }

        $bundle = $this->get('/api/fhir/Media', ['_id' => $mediaId, 'type' => $type], 'higo.exam.fetch_media');
        $resource = $bundle ? Arr::get($bundle, 'entry.0.resource') : null;

        if (! is_array($resource)) {
            return null;
        }

        $contentType = (string) Arr::get($resource, 'content.contentType');

        return [
            'id' => (string) $mediaId,
            'exam_type' => $type,
            'content_type' => $contentType,
            'kind' => HigoExamMedia::kindFor($contentType),
            // Nota lor e „INDEX: 3” — ordinea în care le-a făcut operatorul.
            'sequence' => $this->sequenceFromNote(Arr::get($resource, 'note')),
            'width' => Arr::get($resource, 'width'),
            'height' => Arr::get($resource, 'height'),
            'url' => Arr::get($resource, 'content.url'),
        ];
    }

    private function sequenceFromNote(mixed $note): ?int
    {
        $text = is_array($note) ? (string) Arr::get($note, '0.text') : (string) $note;

        return preg_match('/(\d+)/', $text, $matches) === 1 ? (int) $matches[1] : null;
    }

    /**
     * Examinările create de la un moment dat încoace — folosit atât ca plasă de
     * siguranță pentru notificări pierdute, cât și ca sursă principală când
     * abonarea la notificări nu e activă.
     *
     * Întoarce `null` dacă interogarea a eșuat, ca apelantul să poată distinge
     * „nu sunt examinări noi” de „nu am putut întreba”.
     *
     * @return list<string>|null id-uri de DiagnosticReport
     */
    public function reportIdsSince(\DateTimeInterface $since): ?array
    {
        $bundle = $this->get('/api/fhir/DiagnosticReport/_history', [
            '_since' => $since->format('Y-m-d\TH:i:s\Z'),
        ], 'higo.exam.history');

        if (! $bundle) {
            return null;
        }

        return collect(Arr::get($bundle, 'entry', []))
            ->map(fn ($entry) => Arr::get($entry, 'resource.id'))
            ->filter()
            ->map(fn ($id) => (string) $id)
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>|null
     */
    private function get(string $path, array $query, string $operation): ?array
    {
        try {
            $response = $this->client->get($path, $query, ['operation' => $operation]);
        } catch (Throwable $exception) {
            Log::warning('HIGO: interogare eșuată', [
                'path' => $path,
                'error' => $exception->getMessage(),
            ]);

            return null;
        }

        $body = $response->json();

        return is_array($body) ? $body : null;
    }

    /**
     * @param  array<string, mixed>  $bundle
     * @return array<string, mixed>|null
     */
    private function firstResource(array $bundle): ?array
    {
        if (($bundle['resourceType'] ?? null) !== 'Bundle') {
            return $bundle;
        }

        $resource = Arr::get($bundle, 'entry.0.resource');

        return is_array($resource) ? $resource : null;
    }

    private function idFromReference(mixed $reference): ?string
    {
        if (! is_string($reference) || $reference === '') {
            return null;
        }

        return basename($reference);
    }
}
