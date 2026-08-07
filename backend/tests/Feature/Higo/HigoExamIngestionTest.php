<?php

namespace Tests\Feature\Higo;

use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\HigoDevice;
use App\Models\HigoExamPayload;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HigoExamIngestionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'higo.exams.webhook_secret' => 'exam-secret',
            'higo.base_url' => 'https://higo.test',
            'higo.client_id' => 'cid',
            'higo.client_secret' => 'csecret',
            'higo.username' => 'u',
            'higo.password' => 'p',
            'higo.cache.store' => 'database',
            'higo.http.retry_times' => 1,
        ]);
    }

    public function test_webhook_attaches_measurements_to_the_open_consultation(): void
    {
        $scenario = $this->scenario();

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-1',
            'patientId' => 'higo-patient-9',
            'performedAt' => '2026-08-05T10:00:00Z',
            'measurements' => [
                'systolic' => 128,
                'diastolic' => 82,
                'pulse' => 88,
                'SpO2' => 96,
                'bodyTemperature' => 38.1,
            ],
        ])->assertStatus(201)->assertJsonPath('status', HigoExamPayload::STATUS_MAPPED);

        $data = ConsultationObjectiveData::firstOrFail();

        $this->assertSame('higo_device', $data->source);
        $this->assertSame($scenario['request']->id, $data->consultation_request_id);
        // Denumirile lor au fost traduse în vocabularul nostru canonic.
        $this->assertSame(128, $data->payload['blood_pressure_systolic']);
        $this->assertSame(82, $data->payload['blood_pressure_diastolic']);
        $this->assertSame(88, $data->payload['heart_rate']);
        $this->assertSame(96, $data->payload['spo2']);
        $this->assertSame(38.1, $data->payload['temperature']);

        // Consultația trece automat mai departe spre medic.
        $this->assertNotNull($scenario['request']->refresh()->objective_data_completed_at);
    }

    public function test_unknown_fields_are_kept_instead_of_dropped(): void
    {
        $this->scenario();

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-2',
            'patientId' => 'higo-patient-9',
            'measurements' => ['pulse' => 70, 'somethingBrandNew' => 'valoare'],
        ])->assertStatus(201);

        $payload = ConsultationObjectiveData::firstOrFail()->payload;

        $this->assertSame(70, $payload['heart_rate']);
        $this->assertSame('valoare', $payload['somethingBrandNew']);
    }

    public function test_nested_value_objects_are_flattened(): void
    {
        $this->scenario();

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-3',
            'patientId' => 'higo-patient-9',
            'results' => ['SpO2' => ['value' => 97, 'unit' => '%']],
        ])->assertStatus(201);

        $this->assertSame(97, ConsultationObjectiveData::firstOrFail()->payload['spo2']);
    }

    public function test_the_same_exam_delivered_twice_does_not_duplicate_data(): void
    {
        $this->scenario();

        $body = [
            'id' => 'exam-4',
            'patientId' => 'higo-patient-9',
            'measurements' => ['pulse' => 80],
        ];

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', $body)->assertStatus(201);
        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', $body)->assertStatus(201);

        $this->assertSame(1, HigoExamPayload::count());
        $this->assertSame(1, ConsultationObjectiveData::count());
    }

    public function test_an_unmatched_exam_is_stored_raw_and_can_be_remapped_later(): void
    {
        // Ajunge o examinare pentru un pacient care nu e încă provizionat.
        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-5',
            'patientId' => 'higo-patient-9',
            'measurements' => ['pulse' => 75],
        ])->assertStatus(202)->assertJsonPath('status', HigoExamPayload::STATUS_UNMATCHED);

        // Datele brute sunt salvate integral, deci nimic nu s-a pierdut.
        $payload = HigoExamPayload::firstOrFail();
        $this->assertSame(75, $payload->raw['measurements']['pulse']);
        $this->assertSame(0, ConsultationObjectiveData::count());

        // Pacientul apare în sistem, apoi rulăm remaparea.
        $this->scenario();
        $this->artisan('higo:remap')->assertSuccessful();

        $this->assertSame(HigoExamPayload::STATUS_MAPPED, $payload->refresh()->status);
        $this->assertSame(75, ConsultationObjectiveData::firstOrFail()->payload['heart_rate']);
    }

    public function test_remap_rewrites_the_same_record_after_a_field_map_fix(): void
    {
        $this->scenario();

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-6',
            'patientId' => 'higo-patient-9',
            'measurements' => ['heartBeat' => 91],
        ])->assertStatus(201);

        // Câmpul lor nu era în mapare, deci a intrat cu numele original.
        $this->assertSame(91, ConsultationObjectiveData::firstOrFail()->payload['heartBeat']);

        // Corectăm maparea și reluăm — fără să pierdem sau să dublăm nimic.
        config(['higo.exams.field_map' => ['heartBeat' => 'heart_rate']]);
        $this->artisan('higo:remap --all')->assertSuccessful();

        $this->assertSame(1, ConsultationObjectiveData::count());
        $this->assertSame(91, ConsultationObjectiveData::firstOrFail()->payload['heart_rate']);
    }

    public function test_exam_can_be_matched_by_device_serial_when_patient_id_is_missing(): void
    {
        $scenario = $this->scenario();
        HigoDevice::create([
            'serial_number' => 'DEV-123',
            'assigned_user_id' => $scenario['operator']->id,
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-7',
            'deviceSerial' => 'DEV-123',
            'measurements' => ['pulse' => 66],
        ])->assertStatus(201);

        $this->assertSame($scenario['request']->id, ConsultationObjectiveData::firstOrFail()->consultation_request_id);
    }

    public function test_fhir_subject_reference_is_resolved_to_the_patient(): void
    {
        $scenario = $this->scenario();

        // API-ul lor e HL7 FHIR: referința vine ca `Patient/higo-patient-9`.
        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'resourceType' => 'Observation',
            'id' => 'exam-9',
            'subject' => ['reference' => 'Patient/higo-patient-9'],
            'measurements' => ['pulse' => 72],
        ])->assertStatus(201);

        $this->assertSame($scenario['request']->id, ConsultationObjectiveData::firstOrFail()->consultation_request_id);
    }

    public function test_an_encounter_notification_gets_a_specific_diagnostic(): void
    {
        $this->scenario();

        // HIGO folosește Encounter pentru notificări; în FHIR acesta nu poartă
        // măsurătorile, deci mesajul trebuie să spună clar ce urmează de făcut.
        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'resourceType' => 'Encounter',
            'id' => 'enc-1',
            'subject' => ['reference' => 'Patient/higo-patient-9'],
            'status' => 'finished',
        ])->assertStatus(202);

        $payload = HigoExamPayload::firstOrFail();

        $this->assertSame(HigoExamPayload::STATUS_FAILED, $payload->status);
        $this->assertStringContainsString('Observation', (string) $payload->error);
        // Payload-ul brut rămâne intact, deci se poate remapa după ce aflăm forma.
        $this->assertSame('finished', $payload->raw['status']);
    }

    /**
     * Fluxul real: notificarea aduce doar `diagnosticReportId`, iar măsurătorile
     * se citesc apoi din raport și din observațiile FHIR.
     */
    public function test_a_real_notification_fetches_the_report_and_its_observations(): void
    {
        $scenario = $this->scenario();

        Http::fake([
            'https://higo.test/oauth/token' => Http::response(['access_token' => 'jwt', 'expires_in' => 3599]),
            'https://higo.test/api/fhir/DiagnosticReport*' => Http::response([
                'resourceType' => 'Bundle',
                'entry' => [['resource' => [
                    'resourceType' => 'DiagnosticReport',
                    'id' => '46509',
                    'subject' => ['reference' => 'Patient/higo-patient-9'],
                    'effectiveDateTime' => '2026-08-06T10:00:00+00:00',
                    'encounter' => ['reference' => 'Encounter/346'],
                    'result' => [
                        ['reference' => 'Observation/948', 'display' => 'TEMPERATURE_EXAM'],
                        ['reference' => 'Observation/949', 'display' => 'SATURATION_EXAM'],
                    ],
                ]]],
            ]),
            // Căutarea lor de observații cere perechea `_id` + `type`; fără tip
            // răspunde 400, deci fiecare observație se cere separat.
            'https://higo.test/api/fhir/Observation*' => function ($request) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

                $bodies = [
                    '948' => [
                        'resourceType' => 'Observation', 'id' => '948',
                        'code' => ['coding' => [['system' => 'https://loinc.org', 'code' => '8310-5']]],
                        'valueQuantity' => ['value' => 37.4, 'unit' => 'C'],
                    ],
                    '949' => [
                        'resourceType' => 'Observation', 'id' => '949',
                        // Cod LOINC nemapat: cade pe denumirea examinării.
                        'code' => ['coding' => [['code' => 'X-UNKNOWN']]],
                        'valueQuantity' => ['value' => 97, 'unit' => '%'],
                    ],
                ];

                $expectedType = ['948' => 'TEMPERATURE_EXAM', '949' => 'SATURATION_EXAM'];
                $id = (string) ($query['_id'] ?? '');

                if (! isset($bodies[$id]) || ($query['type'] ?? null) !== $expectedType[$id]) {
                    return Http::response(['resourceType' => 'OperationOutcome'], 400);
                }

                return Http::response([
                    'resourceType' => 'Bundle',
                    'entry' => [['resource' => $bodies[$id]]],
                ]);
            },
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => [
                'diagnosticReportId' => '46509',
                'deviceSerialNumber' => '00D21320015T',
                'observationTypes' => 'TEMPERATURE_EXAM,SATURATION_EXAM',
            ],
        ])->assertStatus(201)->assertJsonPath('status', HigoExamPayload::STATUS_MAPPED);

        $data = ConsultationObjectiveData::firstOrFail();

        $this->assertSame('higo_device', $data->source);
        $this->assertSame($scenario['request']->id, $data->consultation_request_id);
        $this->assertSame(37.4, $data->payload['temperature']);
        $this->assertSame(97, $data->payload['spo2']);
        $this->assertNotNull($scenario['request']->refresh()->objective_data_completed_at);
    }

    public function test_the_webhook_rejects_wrong_basic_credentials(): void
    {
        config([
            'higo.exams.notify_client_id' => 'higo-id',
            'higo.exams.notify_client_secret' => 'higo-secret',
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', ['code' => 'X'], [
            'Authorization' => 'Basic '.base64_encode('higo-id:gresit'),
        ])->assertStatus(401);
    }

    public function test_the_webhook_accepts_correct_basic_credentials(): void
    {
        config([
            'higo.exams.notify_client_id' => 'higo-id',
            'higo.exams.notify_client_secret' => 'higo-secret',
        ]);
        Http::fake(['https://higo.test/*' => Http::response(['resourceType' => 'Bundle', 'entry' => []])]);

        // Handshake-ul de activare nu poartă examinare, dar trebuie să reușească.
        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', ['code' => 'HANDSHAKE'], [
            'Authorization' => 'Basic '.base64_encode('higo-id:higo-secret'),
        ])->assertStatus(202);
    }

    public function test_the_periodic_pull_fetches_and_attaches_new_examinations(): void
    {
        $scenario = $this->scenario();

        Http::fake([
            'https://higo.test/oauth/token' => Http::response(['access_token' => 'jwt', 'expires_in' => 3599]),
            'https://higo.test/api/fhir/DiagnosticReport/_history*' => Http::response([
                'resourceType' => 'Bundle',
                'type' => 'history',
                'entry' => [['resource' => ['resourceType' => 'DiagnosticReport', 'id' => '777']]],
            ]),
            'https://higo.test/api/fhir/DiagnosticReport?*' => Http::response([
                'resourceType' => 'Bundle',
                'entry' => [['resource' => [
                    'resourceType' => 'DiagnosticReport',
                    'id' => '777',
                    'subject' => ['reference' => 'Patient/higo-patient-9'],
                    'result' => [['reference' => 'Observation/500', 'display' => 'TEMPERATURE_EXAM']],
                ]]],
            ]),
            'https://higo.test/api/fhir/Observation*' => Http::response([
                'resourceType' => 'Bundle',
                'entry' => [['resource' => [
                    'resourceType' => 'Observation', 'id' => '500',
                    'code' => ['coding' => [['code' => '8310-5']]],
                    'valueQuantity' => ['value' => 36.8, 'unit' => 'C'],
                ]]],
            ]),
        ]);

        $this->artisan('higo:pull --since="2026-08-01 00:00:00"')->assertSuccessful();

        $data = ConsultationObjectiveData::firstOrFail();
        $this->assertSame(36.8, $data->payload['temperature']);
        $this->assertSame($scenario['request']->id, $data->consultation_request_id);

        // A doua rulare nu duplică: `external_id` e unic.
        $this->artisan('higo:pull --since="2026-08-01 00:00:00"')->assertSuccessful();
        $this->assertSame(1, ConsultationObjectiveData::count());
    }

    public function test_a_failed_pull_does_not_advance_the_watermark(): void
    {
        Http::fake([
            'https://higo.test/oauth/token' => Http::response(['access_token' => 'jwt', 'expires_in' => 3599]),
            'https://higo.test/api/fhir/DiagnosticReport/_history*' => Http::response(['error' => 'down'], 503),
        ]);

        $this->artisan('higo:pull --since="2026-08-01 00:00:00"')->assertFailed();

        // Reperul nu avansează, altfel am pierde definitiv intervalul necitit.
        $this->assertNull(app(PlatformConfig::class)->get('higo.exams.pulled_until'));
    }

    public function test_webhook_rejects_a_wrong_secret(): void
    {
        $this->postJson('/api/v1/higo/exams/webhook/gresit', ['id' => 'x'])->assertNotFound();
    }

    public function test_admin_sees_unmatched_exams_and_can_remap_one(): void
    {
        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'id' => 'exam-8',
            'patientId' => 'higo-patient-9',
            'measurements' => ['pulse' => 70],
        ])->assertStatus(202);

        Sanctum::actingAs($this->userWithRole('admin'));

        $this->getJson('/api/v1/admin/higo/sync')
            ->assertOk()
            ->assertJsonPath('exam_summary.unmatched', 1)
            ->assertJsonPath('exams.0.status', HigoExamPayload::STATUS_UNMATCHED);

        $payload = HigoExamPayload::firstOrFail();
        $this->scenario();

        $this->postJson("/api/v1/admin/higo/exams/{$payload->id}/remap")
            ->assertOk()
            ->assertJsonPath('data.status', HigoExamPayload::STATUS_MAPPED);
    }

    /**
     * @return array{request: ConsultationRequest, operator: User}
     */
    private function scenario(): array
    {
        $patientUser = $this->userWithRole('patient');
        $profile = PatientProfile::create([
            'user_id' => $patientUser->id,
            'higo_patient_id' => 'higo-patient-9',
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'status' => 'active',
        ]);

        $operator = $this->userWithRole('operator');

        $request = ConsultationRequest::create([
            'patient_id' => $patientUser->id,
            'patient_profile_id' => $profile->id,
            'operator_id' => $operator->id,
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'status' => 'accepted',
            'symptoms' => 'Tuse',
            'accepted_at' => now(),
        ]);

        return ['request' => $request, 'operator' => $operator];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
