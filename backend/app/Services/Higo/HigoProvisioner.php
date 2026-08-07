<?php

namespace App\Services\Higo;

use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\User;
use App\Services\FeatureFlags;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Împinge entitățile noastre în HIGO: creează resursa la prima sincronizare și o
 * actualizează la următoarele, ținând minte id-ul primit de la ei.
 *
 * Nu aruncă niciodată excepții. Coada rulează pe driverul `sync`, deci o
 * excepție de aici ar face să pice cererea de creare a utilizatorului din admin
 * — iar o pană la HIGO nu trebuie să blocheze înscrierile în platformă. Eșecul
 * se scrie în starea profilului și poate fi reluat din admin.
 */
class HigoProvisioner
{
    public const STATUS_SYNCED = 'synced';

    public const STATUS_FAILED = 'failed';

    public const STATUS_SKIPPED = 'skipped';

    public function __construct(
        private readonly HigoClient $client,
        private readonly HigoResourceBuilder $builder,
        private readonly FeatureFlags $features,
    ) {}

    /**
     * Sincronizarea e activă doar dacă avem credențiale, flagul de modul e pornit
     * și nu a fost oprită explicit din configurare.
     */
    public function enabled(): bool
    {
        return (bool) config('higo.sync.enabled')
            && (bool) config('higo.base_url')
            && $this->features->enabled('higo_devices');
    }

    /**
     * Sincronizează toate profilurile unui utilizator care au corespondent în HIGO.
     *
     * @return array<string, bool> kind => succes
     */
    public function syncUser(User $user): array
    {
        $user->loadMissing(['patientProfile', 'doctorProfile', 'operatorProfile']);

        $results = [];

        foreach ([$user->patientProfile, $user->doctorProfile, $user->operatorProfile] as $profile) {
            if ($profile) {
                $results[$this->builder->kindFor($profile)] = $this->sync($profile);
            }
        }

        return $results;
    }

    /**
     * @param  PatientProfile|DoctorProfile|OperatorProfile  $entity
     */
    public function sync(Model $entity): bool
    {
        if (! $this->enabled()) {
            return false;
        }

        try {
            $kind = $this->builder->kindFor($entity);
        } catch (Throwable $exception) {
            Log::warning('HIGO sync: model nesuportat', ['error' => $exception->getMessage()]);

            return false;
        }

        $resource = config("higo.sync.resources.{$kind}");

        if (! is_array($resource) || empty($resource['path'])) {
            // Rolul nu are corespondent configurat în HIGO (ex. admin).
            $this->recordState($entity, self::STATUS_SKIPPED, 'Fără resursă HIGO configurată pentru „'.$kind.'”.');

            return false;
        }

        $entity->loadMissing('user');

        if ($reason = $this->notReadyReason($entity, $kind)) {
            $this->recordState($entity, self::STATUS_SKIPPED, $reason);

            return false;
        }

        $idColumn = $this->builder->idColumnFor($entity);
        $higoId = $entity->{$idColumn};

        // Unele resurse ale lor acceptă doar `create` (ex. DoctorResource). Odată
        // trimis, un astfel de profil nu se mai poate actualiza: îl considerăm
        // sincronizat fără să mai construim sau să trimitem ceva.
        if ($higoId && ($resource['supports_update'] ?? true) === false) {
            $entity->forceFill([
                'higo_sync_status' => self::STATUS_SYNCED,
                'higo_synced_at' => now(),
                'higo_sync_error' => null,
            ])->save();

            return true;
        }

        // Parola contului din HIGO se generează aici, ca s-o putem păstra: fără
        // ea, operatorul nu se poate autentifica în aplicația lor mobilă.
        $password = $kind === 'patient' ? null : HigoResourceBuilder::generatePassword();

        try {
            $payload = $this->builder->build($entity, $password);
            $logContext = [
                'operation' => "higo.{$kind}.".($higoId ? 'update' : 'create'),
                'resource_type' => $resource['resource_type'] ?? null,
                'local_model_type' => $entity::class,
                'local_model_id' => $entity->getKey(),
                'higo_id' => $higoId,
            ];

            if ($higoId) {
                $path = rtrim($resource['path'], '/').'/'.$higoId;
                $method = strtoupper((string) ($resource['update_method'] ?? 'PUT'));
                // HAPI refuză un PUT fără `id` în corpul resursei (HAPI-0419).
                $payload['id'] = (string) $higoId;

                $response = $method === 'POST'
                    ? $this->client->post($path, $payload, $logContext)
                    : $this->client->put($path, $payload, $logContext);
            } else {
                $response = $this->client->post($resource['path'], $payload, $logContext);
            }
        } catch (Throwable $exception) {
            return $this->fail($entity, $exception->getMessage());
        }

        if (! $response->successful()) {
            return $this->fail($entity, $this->describeFailure($response->status(), (string) $response->body()));
        }

        $returnedId = $this->extractId($response);

        $entity->forceFill(array_filter([
            $idColumn => $higoId ?: $returnedId,
            'higo_password' => $password,
            'higo_sync_status' => self::STATUS_SYNCED,
            'higo_synced_at' => now(),
            'higo_sync_error' => null,
        ], fn ($value, $key) => $value !== null || $key === 'higo_sync_error', ARRAY_FILTER_USE_BOTH))->save();

        return true;
    }

    /**
     * Generează o parolă nouă pentru contul HIGO al unui operator și o trimite la
     * ei. Funcționează doar unde resursa acceptă update — `DoctorResource` nu.
     */
    public function resetPractitionerPassword(Model $entity): ?string
    {
        $kind = $this->builder->kindFor($entity);
        $resource = config("higo.sync.resources.{$kind}");

        if (blank($entity->{$this->builder->idColumnFor($entity)}) || ($resource['supports_update'] ?? true) === false) {
            return null;
        }

        $password = HigoResourceBuilder::generatePassword();

        $higoId = (string) $entity->{$this->builder->idColumnFor($entity)};

        try {
            $response = $this->client->put(
                rtrim((string) $resource['path'], '/').'/'.$higoId,
                [...$this->builder->build($entity, $password), 'id' => $higoId],
                ['operation' => "higo.{$kind}.reset_password"],
            );
        } catch (Throwable $exception) {
            Log::warning('HIGO: resetarea parolei a eșuat', ['error' => $exception->getMessage()]);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $entity->forceFill(['higo_password' => $password])->save();

        return $password;
    }

    /**
     * Leagă pacientul de operatorul care îl va examina.
     *
     * Pacientul se creează fără legătură, fiindcă la înregistrare nu se știe cine
     * îl va examina. Legătura se face la atribuirea operatorului, iar HIGO o cere
     * ca examinarea PRO să fie posibilă cu aparatul acelui operator.
     *
     * Nu aruncă excepții: o eroare aici nu are voie să strice crearea consultației.
     */
    public function linkPatientToOperator(PatientProfile $patient, User $operator): bool
    {
        if (! $this->enabled()) {
            return false;
        }

        $operatorHigoId = $operator->loadMissing('operatorProfile')->operatorProfile?->higo_operator_id;

        if (blank($operatorHigoId)) {
            return false;
        }

        // Pacientul poate să nu fi ajuns încă în HIGO (profil creat înainte de
        // integrare, sau o sincronizare eșuată): îl trimitem întâi.
        if (blank($patient->higo_patient_id) && ! $this->sync($patient)) {
            return false;
        }

        $patient->refresh();

        // Deja legat de acest operator — nu retrimitem aceeași legătură.
        if ((string) $patient->higo_general_practitioner_id === (string) $operatorHigoId) {
            return true;
        }

        try {
            $response = $this->client->put(
                rtrim((string) config('higo.sync.resources.patient.path'), '/').'/'.$patient->higo_patient_id,
                $this->builder->patientLinkedToOperator($patient, (string) $operatorHigoId),
                [
                    'operation' => 'higo.patient.link_operator',
                    'local_model_type' => $patient::class,
                    'local_model_id' => $patient->getKey(),
                    'higo_id' => $patient->higo_patient_id,
                ],
            );
        } catch (Throwable $exception) {
            Log::warning('HIGO: legarea pacientului de operator a eșuat', [
                'patient_profile_id' => $patient->getKey(),
                'error' => $exception->getMessage(),
            ]);

            return false;
        }

        if (! $response->successful()) {
            return false;
        }

        $patient->forceFill(['higo_general_practitioner_id' => (string) $operatorHigoId])->save();

        return true;
    }

    /**
     * Poarta care decide dacă o entitate are voie să plece spre HIGO.
     *
     * E aici, nu în controllere, ca să fie imposibil de ocolit: indiferent cine
     * declanșează sincronizarea (creare din admin, editare, aprobare, backfill
     * sau comanda de consolă), regulile de mai jos se aplică la fel.
     *
     * @return string|null motivul pentru care nu se trimite, sau null dacă e gata
     */
    private function notReadyReason(Model $entity, string $kind): ?string
    {
        if ($kind === 'patient') {
            // Contul de utilizator nu are corespondent în HIGO. Acolo se duc
            // doar pacienții pe care titularul îi adaugă după cumpărarea unui
            // pachet — iar aceia au date de identitate completate.
            return $entity->birth_date && filled($entity->patient_code)
                ? null
                : 'Profil de pacient incomplet (lipsește data nașterii) — nu se trimite în HIGO.';
        }

        // Medicii și operatorii care se înregistrează singuri pleacă spre HIGO
        // abia după ce adminul îi aprobă, niciodată la înscriere.
        $user = $entity->user;

        if ($user && $user->status !== 'active') {
            return 'Contul așteaptă aprobarea adminului — se trimite în HIGO după aprobare.';
        }

        if (($entity->is_approved ?? true) === false) {
            return 'Profilul nu este aprobat — se trimite în HIGO după aprobare.';
        }

        return null;
    }

    /**
     * Id-ul atribuit de HIGO. La `DoctorResource` și `MedicalOperatorResource`
     * corpul răspunsului e gol, iar id-ul vine doar în antetul `Content-Location`
     * (`/api/fhir/<Resursa>/<id>`); la `Patient` apare în ambele locuri.
     */
    private function extractId(Response $response): ?string
    {
        $fromBody = $response->json((string) config('higo.sync.id_field', 'id'));

        if ($fromBody !== null && $fromBody !== '') {
            return (string) $fromBody;
        }

        $location = $response->header('Content-Location') ?: $response->header('Location');

        if (! $location) {
            return null;
        }

        $id = trim(basename(parse_url($location, PHP_URL_PATH) ?: $location));

        return $id !== '' ? $id : null;
    }

    private function fail(Model $entity, string $error): bool
    {
        Log::warning('HIGO sync eșuat', [
            'model' => $entity::class,
            'id' => $entity->getKey(),
            'error' => $error,
        ]);

        $this->recordState($entity, self::STATUS_FAILED, $error);

        return false;
    }

    private function recordState(Model $entity, string $status, string $error): void
    {
        $entity->forceFill([
            'higo_sync_status' => $status,
            'higo_sync_error' => mb_substr($error, 0, 1000),
        ])->save();
    }

    /**
     * Corpul răspunsului poate conține date de pacient, așa că păstrăm doar un
     * extras scurt — suficient pentru diagnostic, fără să umplem baza cu PII.
     */
    private function describeFailure(int $status, string $body): string
    {
        return 'HTTP '.$status.($body !== '' ? ': '.mb_substr($body, 0, 300) : '');
    }
}
