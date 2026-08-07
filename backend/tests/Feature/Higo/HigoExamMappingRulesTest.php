<?php

namespace Tests\Feature\Higo;

use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\HigoExamMedia;
use App\Models\HigoExamPayload;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Maparea datelor din aparat: unități, coliziuni, reguli editabile din admin.
 */
class HigoExamMappingRulesTest extends TestCase
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

    public function test_a_measurement_in_another_unit_is_converted_not_relabelled(): void
    {
        $this->scenario();
        $this->fakeExam([
            ['id' => '1', 'type' => 'TEMPERATURE_EXAM', 'code' => '8310-5', 'value' => 100.4, 'unit' => '[degF]'],
            ['id' => '2', 'type' => 'WEIGHT_EXAM', 'code' => '29463-7', 'value' => 154, 'unit' => 'lb'],
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        $payload = ConsultationObjectiveData::firstOrFail()->payload;

        // 100.4 °F sunt 38 °C — nu „100.4 °C”, care ar fi incompatibil cu viața.
        $this->assertEquals(38, $payload['temperature']);
        $this->assertEquals(69.85, $payload['weight']);
    }

    public function test_two_exams_of_the_same_organ_do_not_overwrite_each_other(): void
    {
        $this->scenario();
        $this->fakeExam([
            ['id' => '1', 'type' => 'LEFT_EAR_EXAM', 'code' => 'X-EAR', 'value' => 'timpan normal'],
            ['id' => '2', 'type' => 'RIGHT_EAR_EXAM', 'code' => 'X-EAR', 'value' => 'timpan hiperemiat'],
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        $payload = ConsultationObjectiveData::firstOrFail()->payload;

        $this->assertSame('timpan normal', $payload['ear_left']);
        $this->assertSame('timpan hiperemiat', $payload['ear_right']);
    }

    public function test_a_collision_keeps_both_values_instead_of_dropping_one(): void
    {
        $this->scenario();
        // Mapare greșită dinadins: ambele examinări trimise în același câmp.
        config(['higo.exams.exam_type_map' => [
            'LEFT_EAR_EXAM' => 'ear',
            'RIGHT_EAR_EXAM' => 'ear',
        ]]);

        $this->fakeExam([
            ['id' => '1', 'type' => 'LEFT_EAR_EXAM', 'code' => 'X-EAR', 'value' => 'stânga'],
            ['id' => '2', 'type' => 'RIGHT_EAR_EXAM', 'code' => 'X-EAR', 'value' => 'dreapta'],
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        $payload = ConsultationObjectiveData::firstOrFail()->payload;

        $this->assertSame('stânga', $payload['ear']);
        $this->assertSame('dreapta', $payload['ear_right_ear_exam']);
    }

    public function test_a_value_less_observation_does_not_land_in_the_chart_as_its_unit(): void
    {
        $this->scenario();
        $this->fakeExam([
            ['id' => '1', 'type' => 'TEMPERATURE_EXAM', 'code' => '8310-5', 'value' => 36.6, 'unit' => 'C'],
            ['id' => '2', 'type' => 'SATURATION_EXAM', 'code' => 'X-SAT', 'value' => null, 'unit' => '%'],
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        $payload = ConsultationObjectiveData::firstOrFail()->payload;

        $this->assertSame(36.6, $payload['temperature']);
        $this->assertArrayNotHasKey('spo2', $payload);
    }

    public function test_admin_sees_how_each_observation_was_mapped(): void
    {
        $this->scenario();
        $this->fakeExam([
            ['id' => '1', 'type' => 'TEMPERATURE_EXAM', 'code' => '8310-5', 'value' => 37.2, 'unit' => 'C'],
            ['id' => '2', 'type' => 'BRAND_NEW_EXAM', 'code' => 'X-NEW', 'value' => 12],
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        Sanctum::actingAs($this->userWithRole('admin'));
        $exam = HigoExamPayload::firstOrFail();

        $response = $this->getJson("/api/v1/admin/higo/exams/{$exam->id}")->assertOk();

        $response->assertJsonPath('data.mapping.0.key', 'temperature')
            ->assertJsonPath('data.mapping.0.rule', 'loinc')
            ->assertJsonPath('data.mapping.0.label', 'Temperatură')
            // Examinarea necunoscută nu dispare: e vizibilă ca nemapată.
            ->assertJsonPath('data.mapping.1.key', 'BRAND_NEW_EXAM')
            ->assertJsonPath('data.mapping.1.rule', 'unmapped')
            ->assertJsonPath('data.mapping.1.known', false);

        // Payload-ul brut ajunge întreg în panou.
        $this->assertSame('1000', $response->json('data.raw.diagnosticReport.id'));
    }

    public function test_admin_can_fix_a_mapping_rule_and_reapply_it_to_past_exams(): void
    {
        $this->scenario();
        $this->fakeExam([
            ['id' => '1', 'type' => 'BRAND_NEW_EXAM', 'code' => 'X-NEW', 'value' => 63],
        ]);

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        // Fără regulă, măsurătoarea intră cu denumirea aparatului.
        $this->assertSame(63, ConsultationObjectiveData::firstOrFail()->payload['BRAND_NEW_EXAM']);

        Sanctum::actingAs($this->userWithRole('admin'));

        $this->getJson('/api/v1/admin/higo/mapping')
            ->assertOk()
            ->assertJsonFragment(['BRAND_NEW_EXAM']);

        $this->putJson('/api/v1/admin/higo/mapping', [
            'kind' => 'exam_type',
            'rules' => ['BRAND_NEW_EXAM' => 'heart_rate'],
            'remap' => true,
        ])->assertOk();

        // Regula corectată se aplică retroactiv, în aceeași înregistrare.
        $this->assertSame(1, ConsultationObjectiveData::count());
        $payload = ConsultationObjectiveData::firstOrFail()->payload;
        $this->assertSame(63, $payload['heart_rate']);
        $this->assertArrayNotHasKey('BRAND_NEW_EXAM', $payload);
    }

    public function test_a_recording_is_stored_as_video_when_the_device_sends_one(): void
    {
        $this->scenario();
        $this->fakeExam(
            [['id' => '1', 'type' => 'THROAT_EXAM', 'code' => 'X-THROAT', 'value' => null, 'media' => 'Media/77']],
            [
                'https://higo.test/api/fhir/Media*' => Http::response([
                    'resourceType' => 'Bundle',
                    'entry' => [['resource' => [
                        'resourceType' => 'Media', 'id' => '77',
                        'content' => ['contentType' => 'video/mp4', 'url' => 'https://blob.test/77.mp4'],
                        'note' => [['text' => 'INDEX: 1']],
                    ]]],
                ]),
                'https://blob.test/*' => Http::response('octeti-de-film'),
            ],
        );

        $this->postJson('/api/v1/higo/exams/webhook/exam-secret', [
            'code' => 'NEW_DIAGNOSTIC_REPORT_CREATED',
            'data' => ['diagnosticReportId' => '1000'],
        ])->assertStatus(201);

        $media = HigoExamMedia::firstOrFail();

        $this->assertSame(HigoExamMedia::KIND_VIDEO, $media->kind);
        $this->assertStringEndsWith('.mp4', (string) $media->path);
    }

    /**
     * Un raport cu observațiile date, servit din HTTP fake.
     *
     * @param  list<array<string, mixed>>  $observations
     * @param  array<string, mixed>  $extraFakes
     */
    private function fakeExam(array $observations, array $extraFakes = []): void
    {
        $results = [];
        $bodies = [];

        foreach ($observations as $observation) {
            $id = (string) $observation['id'];
            $results[] = ['reference' => 'Observation/'.$id, 'display' => $observation['type']];

            $resource = [
                'resourceType' => 'Observation',
                'id' => $id,
                'code' => ['coding' => [['code' => $observation['code']]]],
            ];

            if (($observation['value'] ?? null) !== null) {
                $resource[is_numeric($observation['value']) ? 'valueQuantity' : 'valueString'] = is_numeric($observation['value'])
                    ? array_filter(['value' => $observation['value'], 'unit' => $observation['unit'] ?? null])
                    : $observation['value'];
            } elseif (isset($observation['unit'])) {
                $resource['valueQuantity'] = ['unit' => $observation['unit']];
            }

            if (isset($observation['media'])) {
                $resource['basedOn'] = [['reference' => $observation['media']]];
            }

            $bodies[$id] = $resource;
        }

        Http::fake(array_merge([
            'https://higo.test/oauth/token' => Http::response(['access_token' => 'jwt', 'expires_in' => 3599]),
            'https://higo.test/api/fhir/DiagnosticReport*' => Http::response([
                'resourceType' => 'Bundle',
                'entry' => [['resource' => [
                    'resourceType' => 'DiagnosticReport',
                    'id' => '1000',
                    'subject' => ['reference' => 'Patient/higo-patient-9'],
                    'effectiveDateTime' => '2026-08-07T09:00:00+00:00',
                    'result' => $results,
                ]]],
            ]),
            'https://higo.test/api/fhir/Observation*' => function ($request) use ($bodies) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                $id = (string) ($query['_id'] ?? '');

                return isset($bodies[$id])
                    ? Http::response(['resourceType' => 'Bundle', 'entry' => [['resource' => $bodies[$id]]]])
                    : Http::response(['resourceType' => 'OperationOutcome'], 400);
            },
        ], $extraFakes));
    }

    private function scenario(): ConsultationRequest
    {
        $patientUser = $this->userWithRole('patient');
        $profile = PatientProfile::create([
            'user_id' => $patientUser->id,
            'higo_patient_id' => 'higo-patient-9',
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'status' => 'active',
        ]);

        return ConsultationRequest::create([
            'patient_id' => $patientUser->id,
            'patient_profile_id' => $profile->id,
            'operator_id' => $this->userWithRole('operator')->id,
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'status' => 'accepted',
            'symptoms' => 'Tuse',
            'accepted_at' => now(),
        ]);
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
