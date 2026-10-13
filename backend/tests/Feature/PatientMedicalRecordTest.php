<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\PatientInvestigation;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\ObjectiveDataSchema;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PatientMedicalRecordTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
    }

    public function test_patient_can_save_sections_without_overwriting_other_sections_or_legacy_history(): void
    {
        [$patient, $profile] = $this->patient();
        $profile->update(['life_history' => [['category' => 'Alergii', 'note' => 'Istoric vechi']]]);
        Sanctum::actingAs($patient);
        $this->patchJson($this->url($profile), ['section' => 'birth', 'data' => ['birth_method' => 'cesarean', 'gestational_weeks' => 38, 'apgar' => 9, 'blood_group' => 'AB', 'rh' => 'positive']])->assertOk();
        $this->patchJson($this->url($profile), ['section' => 'drug_allergies', 'data' => [['name' => 'Medicament', 'period' => 'La 5 ani', 'manifestation' => 'Erupție', 'resolution' => 'Tratament']]])->assertOk();
        $this->assertSame('cesarean', $profile->fresh()->medical_record['birth']['birth_method']);
        $this->assertSame('Medicament', $profile->fresh()->medical_record['drug_allergies'][0]['name']);
        $this->assertSame('Istoric vechi', $profile->fresh()->life_history[0]['note']);
        $this->patchJson($this->url($profile), ['section' => 'drug_allergies', 'data' => []])->assertOk();
        $this->assertSame([], $profile->fresh()->medical_record['drug_allergies']);
    }

    #[DataProvider('invalidSections')]
    public function test_invalid_nested_values_are_rejected(string $section, array $data): void
    {
        [$patient, $profile] = $this->patient();
        Sanctum::actingAs($patient);
        $this->patchJson($this->url($profile), ['section' => $section, 'data' => $data])->assertUnprocessable();
        $this->assertNull($profile->fresh()->medical_record);
    }

    public static function invalidSections(): array
    {
        return [
            ['birth', ['gestational_weeks' => 23]], ['birth', ['gestational_weeks' => 43]],
            ['birth', ['apgar' => 11]], ['birth', ['blood_group' => 'invalid']],
            ['birth', ['diagnosis' => 'Nu este un câmp pentru pacient']],
            ['vaccinations', ['refusal' => 'invalid', 'items' => []]],
            ['drug_allergies', [['manifestation' => 'Fără denumire']]],
            ['surgeries', [['name' => 'Operație', 'date' => '2099-01-01']]],
            ['family_history', [['name' => 'Afecțiune']]],
            ['diagnosis', ['name' => 'Diagnostic pacient']],
        ];
    }

    public function test_all_history_sections_and_vaccination_refusal_are_saved(): void
    {
        [$patient, $profile] = $this->patient();
        Sanctum::actingAs($patient);
        foreach ([
            'vaccinations' => ['refusal' => 'temporary', 'items' => [['name' => 'Vaccin', 'date' => '2020-01-01', 'dose' => '1', 'reaction' => 'Fără reacții']]],
            'surgeries' => [['name' => 'Intervenție stomatologică', 'complications' => 'Fără complicații']],
            'food_allergies' => [['name' => 'Aliment', 'period' => 'La 4 ani']],
            'chronic_conditions' => [['name' => 'Diagnostic', 'date' => '2022-01-01', 'specialist' => 'Medic']],
            'family_history' => [['relationship' => 'Bunica după tata', 'name' => 'Afecțiune']],
            'lifestyle' => ['activity' => 'active', 'workplace' => 'Birou'],
            'disease_history' => [['name' => 'Traumatism', 'period' => 'La 13 ani']],
        ] as $section => $data) {
            $this->patchJson($this->url($profile), ['section' => $section, 'data' => $data])->assertOk();
            $this->assertSame($data, $profile->fresh()->medical_record[$section]);
        }
    }

    public function test_other_patient_cannot_read_or_edit_record(): void
    {
        [, $profile] = $this->patient();
        Sanctum::actingAs($this->user('patient'));
        $this->getJson($this->url($profile))->assertForbidden();
        $this->patchJson($this->url($profile), ['section' => 'birth', 'data' => ['apgar' => 9]])->assertForbidden();
    }

    public function test_assigned_doctor_can_read_history_but_cannot_edit_patient_sections(): void
    {
        [$patient, $profile] = $this->patient();
        $doctor = $this->user('doctor');
        $request = $this->consultation($patient, $profile, $doctor);
        Consultation::create(['consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'diagnosis' => 'Diagnostic medic', 'recommendations' => 'Recomandări medic', 'status' => 'completed']);
        Sanctum::actingAs($doctor);
        $this->getJson($this->url($profile))->assertOk()->assertJsonPath('consultations.0.diagnosis', 'Diagnostic medic')->assertJsonPath('consultations.0.recommendations', 'Recomandări medic');
        $this->patchJson($this->url($profile), ['section' => 'birth', 'data' => ['apgar' => 9]])->assertForbidden();
        Sanctum::actingAs($this->user('doctor'));
        $this->getJson($this->url($profile))->assertForbidden();
    }

    public function test_identity_and_precise_address_are_editable_and_birth_cannot_be_in_future(): void
    {
        [$patient, $profile] = $this->patient();
        Sanctum::actingAs($patient);
        $this->putJson('/api/v1/patient/profiles/'.$profile->id, ['identity_number' => '1234567890123', 'birth_date' => '2026-05-01', 'residential_environment' => 'urban', 'address_details' => ['building' => '5', 'entrance' => '2', 'apartment' => '10', 'floor' => '3']])->assertOk();
        $this->assertSame('1234567890123', $profile->fresh()->identity_number);
        $this->assertSame('10', $profile->fresh()->address_details['apartment']);
        $this->putJson('/api/v1/patient/profiles/'.$profile->id, ['identity_number' => 'abc'])->assertUnprocessable();
        $this->putJson('/api/v1/patient/profiles/'.$profile->id, ['birth_date' => '2099-01-01'])->assertUnprocessable();
    }

    public function test_account_update_preserves_patient_medical_demographics(): void
    {
        [$patient, $profile] = $this->patient();
        $profile->update(['birth_date' => '2000-01-01', 'gender' => 'F', 'medical_summary' => 'Istoric important']);
        Sanctum::actingAs($patient);
        $this->putJson('/api/v1/patient/profile', ['name' => 'Titular nou'])->assertOk();
        $this->assertSame('2000-01-01', $profile->fresh()->birth_date->toDateString());
        $this->assertSame('F', $profile->fresh()->gender);
        $this->assertSame('Istoric important', $profile->fresh()->medical_summary);
    }

    public function test_upload_requires_performed_date_and_stores_file_privately_with_signed_access(): void
    {
        Storage::fake('local');
        [$patient, $profile] = $this->patient();
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/patient/profiles/'.$profile->id.'/investigations', ['title' => 'Analiză', 'file' => UploadedFile::fake()->create('analiza.pdf', 10, 'application/pdf')])->assertUnprocessable()->assertJsonValidationErrors('performed_at');
        $response = $this->postJson('/api/v1/patient/profiles/'.$profile->id.'/investigations', ['title' => 'Analiză', 'type' => 'analysis', 'performed_at' => '2024-05-01', 'file' => UploadedFile::fake()->create('analiza.pdf', 10, 'application/pdf')])->assertCreated();
        $document = PatientInvestigation::findOrFail($response->json('investigation.id'));
        $this->assertSame('local', $document->file_disk);
        Storage::disk('local')->assertExists($document->file_path);
        $this->get($response->json('url'))->assertOk();
        $this->get('/api/v1/patient-investigations/'.$document->id.'/file')->assertForbidden();
    }

    public function test_documents_are_sorted_by_performed_date_not_upload_date(): void
    {
        [$patient, $profile] = $this->patient();
        foreach ([['title' => 'Recent', 'performed_at' => '2025-05-01'], ['title' => 'Vechi', 'performed_at' => '2020-01-01']] as $item) {
            PatientInvestigation::create(['patient_profile_id' => $profile->id, ...$item]);
        }
        Sanctum::actingAs($patient);
        $this->getJson($this->url($profile))->assertOk()->assertJsonPath('documents.0.title', 'Recent')->assertJsonPath('documents.1.title', 'Vechi');
    }

    public function test_document_deletion_checks_profile_ownership_and_removes_file(): void
    {
        Storage::fake('local');
        [$patient, $profile] = $this->patient();
        Storage::disk('local')->put('patient-investigations/test.pdf', 'test');
        $document = PatientInvestigation::create(['patient_profile_id' => $profile->id, 'title' => 'Test', 'file_path' => 'patient-investigations/test.pdf', 'file_disk' => 'local']);
        $url = '/api/v1/patient/profiles/'.$profile->id.'/investigations/'.$document->id;
        Sanctum::actingAs($this->user('patient'));
        $this->deleteJson($url)->assertForbidden();
        Sanctum::actingAs($patient);
        $this->deleteJson($url)->assertOk();
        Storage::disk('local')->assertMissing('patient-investigations/test.pdf');
    }

    public function test_patient_measurements_are_labeled_and_do_not_complete_operator_examination(): void
    {
        [$patient, $profile] = $this->patient();
        $request = $this->consultation($patient, $profile, $this->user('doctor'));
        $request->update(['consultation_kind' => 'with_exam']);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/objective-data', ['source' => 'higo', 'payload' => ['spo2' => 98, 'grip_strength_left' => 10, 'abdominal_circumference' => 85]])->assertCreated();
        $this->assertNull($request->fresh()->objective_data_completed_at);
        $entry = ConsultationObjectiveData::where('consultation_request_id', $request->id)->firstOrFail();
        $this->assertSame('patient', $entry->source);
        $this->assertNull($entry->operator_id);
        $this->postJson('/api/v1/requests/'.$request->id.'/objective-data', ['payload' => ['spo2' => 101]])->assertUnprocessable();
        Sanctum::actingAs($this->user('operator'));
        $this->postJson('/api/v1/requests/'.$request->id.'/objective-data', ['payload' => ['spo2' => 98]])->assertForbidden();
    }

    public function test_admin_custom_parameter_appears_in_catalog_and_is_validated_and_can_be_disabled(): void
    {
        [$patient, $profile] = $this->patient();
        $request = $this->consultation($patient, $profile, $this->user('doctor'));
        $payload = ['key' => 'custom_measure', 'label' => 'Măsurătoare nouă', 'unit' => 'cm', 'type' => 'number', 'min' => 1, 'max' => 10, 'group' => 'anthropometry', 'is_active' => true];
        Sanctum::actingAs($this->user('admin'));
        $response = $this->postJson('/api/v1/admin/clinical-parameters', $payload)->assertCreated();
        $id = $response->json('data.id');
        $this->assertTrue(collect($this->getJson('/api/v1/catalog/objective-fields')->assertOk()->json('data'))->contains('key', 'custom_measure'));
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/objective-data', ['payload' => ['custom_measure' => 11]])->assertUnprocessable();
        $this->postJson('/api/v1/requests/'.$request->id.'/objective-data', ['payload' => ['custom_measure' => 5]])->assertCreated();
        Sanctum::actingAs($this->user('admin'));
        $this->putJson('/api/v1/admin/clinical-parameters/'.$id, [...$payload, 'is_active' => false])->assertOk();
        $this->assertFalse(collect($this->getJson('/api/v1/catalog/objective-fields')->assertOk()->json('data'))->contains('key', 'custom_measure'));
        $this->assertSame('Măsurătoare nouă', ObjectiveDataSchema::label('custom_measure'));
    }

    public function test_non_admin_cannot_add_parameters_or_override_standard_keys(): void
    {
        [$patient] = $this->patient();
        $payload = ['key' => 'spo2', 'label' => 'Override', 'type' => 'number', 'group' => 'vitals', 'is_active' => true];
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/admin/clinical-parameters', $payload)->assertForbidden();
        Sanctum::actingAs($this->user('admin'));
        $this->postJson('/api/v1/admin/clinical-parameters', $payload)->assertUnprocessable();
    }

    private function user(string $role): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $user->roles()->attach(Role::firstOrCreate(['name' => $role], ['label' => $role]));

        return $user;
    }

    private function patient(): array
    {
        $user = $this->user('patient');

        return [$user, PatientProfile::create(['user_id' => $user->id, 'first_name' => 'Ana', 'last_name' => 'Test', 'status' => 'active'])];
    }

    private function consultation(User $patient, PatientProfile $profile, User $doctor): ConsultationRequest
    {
        return ConsultationRequest::create(['patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Simptome']);
    }

    private function url(PatientProfile $profile): string
    {
        return '/api/v1/patient/profiles/'.$profile->id.'/medical-record';
    }
}
