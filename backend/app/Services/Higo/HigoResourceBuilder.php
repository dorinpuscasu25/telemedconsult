<?php

namespace App\Services\Higo;

use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

/**
 * Traduce modelele noastre în resursele HIGO, conform documentației lor
 * („API REST HL7 FHIR”).
 *
 * Resursele lor NU sunt FHIR curat: `DoctorResource` și `MedicalOperatorResource`
 * sunt Practitioner extins cu `username`/`password`, `name` e obiect (nu listă),
 * iar telefonul are formatul propriu `(prefix)number`. Aici e singurul loc care
 * știe forma payload-ului.
 */
class HigoResourceBuilder
{
    /** Maparea genului nostru pe vocabularul cerut de ei. */
    private const GENDER = [
        'M' => 'male',
        'F' => 'female',
        'Altul' => 'other',
    ];

    /**
     * Cheia de configurare (`higo.sync.resources.*`) pentru un model dat.
     */
    public function kindFor(Model $entity): string
    {
        return match (true) {
            $entity instanceof PatientProfile => 'patient',
            $entity instanceof DoctorProfile => 'doctor',
            $entity instanceof OperatorProfile => 'operator',
            default => throw new InvalidArgumentException('Model fără corespondent în HIGO: '.$entity::class),
        };
    }

    /**
     * Coloana în care ținem id-ul atribuit de HIGO.
     */
    public function idColumnFor(Model $entity): string
    {
        return match ($this->kindFor($entity)) {
            'patient' => 'higo_patient_id',
            'doctor' => 'higo_doctor_id',
            'operator' => 'higo_operator_id',
        };
    }

    /**
     * @return array<string, mixed>
     *
     * @throws RuntimeException dacă lipsesc date pe care HIGO le cere obligatoriu
     */
    public function build(Model $entity, ?string $password = null): array
    {
        return match ($this->kindFor($entity)) {
            'patient' => $this->patient($entity),
            'doctor' => $this->practitioner($entity, 'doctor', $password),
            'operator' => $this->practitioner($entity, 'operator', $password),
        };
    }

    /**
     * Parola contului din HIGO. Operatorul o tastează pe telefon, în aplicația
     * lor, deci evităm simbolurile și caracterele ambigue.
     */
    public static function generatePassword(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $password = '';

        for ($i = 0; $i < 14; $i++) {
            $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $password;
    }

    /**
     * HIGO cere obligatoriu data nașterii, genul și un act de identitate. Fără
     * ele nu are rost să lovim API-ul: mesajul de mai jos ajunge în panoul de
     * admin și spune exact ce lipsește din profil.
     *
     * @return array<string, mixed>
     */
    private function patient(PatientProfile $profile): array
    {
        $missing = [];

        if (! $profile->birth_date) {
            $missing[] = 'data nașterii';
        }

        if (blank($profile->patient_code)) {
            $missing[] = 'codul de pacient';
        }

        if ($missing !== []) {
            throw new RuntimeException('Profil incomplet pentru HIGO — lipsește: '.implode(', ', $missing).'.');
        }

        return [
            'resourceType' => 'Patient',
            'birthDate' => $profile->birth_date->format('Y-m-d'),
            'gender' => self::GENDER[$profile->gender] ?? 'unknown',
            'identifier' => [
                'type' => ['text' => (string) config('higo.sync.patient_identifier_type', 'PESEL')],
                // Codul nostru de 6 cifre, nu actul de identitate: platforma nu
                // colectează IDNP-ul. Îl trimitem pe poziția pe care aplicația
                // lor mobilă o caută, ca operatorul să găsească pacientul.
                'value' => (string) $profile->patient_code,
            ],
            'name' => $this->name($profile->first_name, $profile->last_name ?: $profile->user?->name),
        ];
    }

    /**
     * Payload-ul de update care leagă pacientul de operatorul care îl va examina.
     *
     * Update-ul lor e un PUT cu resursa completă, nu un patch: trimitem tot
     * pacientul plus `id`-ul din sistemul lor și legătura.
     *
     * @return array<string, mixed>
     */
    public function patientLinkedToOperator(PatientProfile $profile, string $operatorHigoId): array
    {
        return [
            ...$this->patient($profile),
            'id' => (string) $profile->higo_patient_id,
            'generalPractitioner' => [['identifier' => ['id' => $operatorHigoId]]],
        ];
    }

    /**
     * Medicul și operatorul au aceeași formă: Practitioner extins cu credențiale
     * de acces în sistemul lor.
     *
     * @param  DoctorProfile|OperatorProfile  $profile
     * @return array<string, mixed>
     */
    private function practitioner(Model $profile, string $role, ?string $password = null): array
    {
        $owner = $profile->user;
        $email = (string) ($owner?->email ?? '');

        if (blank($email)) {
            throw new RuntimeException('Contul nu are email, iar HIGO îl cere obligatoriu.');
        }

        $phone = $this->formatPhone($owner?->phone);

        if ($phone === null) {
            throw new RuntimeException('Telefonul lipsește sau nu poate fi adus la formatul cerut de HIGO.');
        }

        [$given, $family] = $this->splitName((string) ($owner?->name ?? ''));

        $resource = [
            'resourceType' => (string) config("higo.sync.resources.{$role}.resource_type"),
            'name' => $this->name($given, $family),
            // Ambele, telefon și email, sunt obligatorii la ei.
            'telecom' => [
                ['system' => 'phone', 'value' => $phone],
                ['system' => 'email', 'value' => $email],
            ],
            // Doar la creare; contul HIGO există ca examinările să poată fi
            // atribuite, nu ca oamenii noștri să se logheze în portalul lor.
            'username' => Str::limit($email, 100, ''),
            'password' => $password ?? self::generatePassword(),
        ];

        $qualification = $role === 'doctor'
            ? ($profile->specialty?->name ?? 'Medic')
            : (string) config('higo.sync.operator_job_title', 'Operator medical');

        $resource['qualification'] = [['code' => ['text' => Str::limit($qualification, 100, '')]]];

        // Licența are o formă proprie: `text` fix „LICENCE_ID”, nu un system FHIR.
        if ($role === 'doctor' && filled($profile->license_number)) {
            $resource['identifier'] = [
                'text' => 'LICENCE_ID',
                'value' => Str::limit((string) $profile->license_number, 200, ''),
            ];
        }

        return $resource;
    }

    /**
     * `name` e obiect, nu listă, iar `given` e listă cu un singur element folosit.
     *
     * @return array<string, mixed>
     */
    private function name(?string $given, ?string $family): array
    {
        return array_filter([
            'given' => filled($given) ? [Str::limit((string) $given, 50, '')] : null,
            'family' => filled($family) ? Str::limit((string) $family, 50, '') : null,
        ], fn ($value) => $value !== null);
    }

    /**
     * HIGO cere telefonul ca `(prefix)number` — de exemplu `(+373)69484967`.
     * Contul lor demo păstrează un telefon gol ca `"()"`, ceea ce confirmă forma.
     *
     * Întoarce null dacă numărul nu poate fi adus la formatul cerut.
     */
    public function formatPhone(?string $phone): ?string
    {
        $e164 = $this->normalizePhone($phone);

        if ($e164 === null) {
            return null;
        }

        $prefixes = collect([config('higo.sync.phone_country_prefix', '+373')])
            ->merge(config('higo.sync.known_country_prefixes', []))
            ->filter()
            ->unique()
            // Prefixele lungi primele, ca `+373` să nu fie confundat cu `+37`.
            ->sortByDesc(fn (string $prefix) => strlen($prefix));

        foreach ($prefixes as $prefix) {
            if (str_starts_with($e164, $prefix)) {
                return '('.$prefix.')'.substr($e164, strlen($prefix));
            }
        }

        return null;
    }

    /**
     * Aduce numărul la E.164. Numerele noastre sunt scrise local („069484967”),
     * deci le completăm cu prefixul de țară configurat.
     */
    public function normalizePhone(?string $phone): ?string
    {
        if (blank($phone)) {
            return null;
        }

        $prefix = (string) config('higo.sync.phone_country_prefix', '+373');
        $digits = preg_replace('/[^\d+]/', '', $phone) ?? '';

        $candidate = match (true) {
            str_starts_with($digits, '+') => $digits,
            str_starts_with($digits, '00') => '+'.substr($digits, 2),
            str_starts_with($digits, '0') => $prefix.substr($digits, 1),
            $digits === '' => '',
            default => str_starts_with($digits, ltrim($prefix, '+'))
                ? '+'.$digits
                : $prefix.$digits,
        };

        return preg_match('/^\+[1-9]\d{7,14}$/', $candidate) === 1 ? $candidate : null;
    }

    /**
     * Contul are un singur câmp `name`; ei vor prenume și nume separate.
     *
     * @return array{0: string, 1: string}
     */
    private function splitName(string $name): array
    {
        $parts = preg_split('/\s+/', trim($name), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        if (count($parts) <= 1) {
            return ['', $parts[0] ?? ''];
        }

        $given = array_shift($parts);

        return [$given, implode(' ', $parts)];
    }
}
