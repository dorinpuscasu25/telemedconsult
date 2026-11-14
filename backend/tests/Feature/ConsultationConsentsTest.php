<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationConsent;
use App\Models\ConsultationRequest;
use App\Models\ContractTemplate;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ConsultationConsents;
use App\Services\MedicalDocumentPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationConsentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_unapproved_templates_stay_draft_and_do_not_claim_patient_acceptance(): void
    {
        [$patient,,$payload] = $this->scenario();
        $this->templates('draft');
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/patient/consultation-consents')->assertOk()->assertJsonPath('ready', false)->assertJsonCount(0, 'data');
        $this->postJson('/api/v1/requests', $payload)->assertCreated();
        $this->assertSame(0, ConsultationConsent::count());
    }

    public function test_current_versions_are_required_atomically_and_evidence_is_frozen_per_request(): void
    {
        [$patient,$doctor,$payload] = $this->scenario();
        $this->templates('active');
        Sanctum::actingAs($patient);
        $templates = $this->getJson('/api/v1/patient/consultation-consents')->assertJsonPath('ready', true)->json('data');
        $this->postJson('/api/v1/requests', $payload)->assertUnprocessable();
        $this->assertSame(0, ConsultationRequest::count());
        $this->assertSame(100000, Wallet::where('user_id', $patient->id)->value('balance_minor'));
        $accepted = array_map(fn ($t) => ['template_id' => $t['template_id'], 'version' => $t['version'], 'accepted' => true], $templates);
        $first = ContractTemplate::find($templates[0]['template_id']);
        $first->update(['content' => 'Versiune nouă aprobată']);
        $this->postJson('/api/v1/requests', [...$payload, 'consents' => $accepted, 'consent_capacity' => 'self'])->assertUnprocessable();
        $templates = $this->getJson('/api/v1/patient/consultation-consents')->json('data');
        $accepted = array_map(fn ($t) => ['template_id' => $t['template_id'], 'version' => $t['version'], 'accepted' => true], $templates);
        $id = $this->postJson('/api/v1/requests', [...$payload, 'consents' => $accepted, 'consent_capacity' => 'representative', 'representative_name' => 'Titular Test', 'representative_relationship' => 'Părinte'])->assertCreated()->json('request.id');
        $this->assertSame(2, ConsultationConsent::count());
        $evidence = ConsultationConsent::where('consultation_request_id', $id)->first();
        $this->assertSame($patient->id, $evidence->accepted_by);
        $this->assertSame('Părinte', $evidence->snapshot['representative_relationship']);
        ContractTemplate::query()->update(['content' => 'ALT TEXT']);
        $consultation = Consultation::create(['consultation_request_id' => $id, 'patient_id' => $patient->id, 'patient_profile_id' => $payload['patient_profile_id'], 'doctor_id' => $doctor->id, 'status' => 'completed']);
        $snapshot = app(MedicalDocumentPublisher::class)->snapshot($consultation);
        $this->assertCount(2, $snapshot['consents']);
        $this->assertStringStartsWith('PV-', $snapshot['protocol_number']);
        $this->assertNotSame('ALT TEXT', $snapshot['consents'][0]['content']);
    }

    public function test_representative_details_and_both_acceptances_are_required(): void
    {
        [$patient,,$payload] = $this->scenario();
        $this->templates('active');
        Sanctum::actingAs($patient);
        $templates = $this->getJson('/api/v1/patient/consultation-consents')->json('data');
        $accepted = array_map(fn ($t) => ['template_id' => $t['template_id'], 'version' => $t['version'], 'accepted' => true], $templates);
        $this->postJson('/api/v1/requests', [...$payload, 'consents' => $accepted, 'consent_capacity' => 'representative'])->assertUnprocessable()->assertJsonValidationErrors('representative_name');
        $accepted[0]['accepted'] = false;
        $this->postJson('/api/v1/requests', [...$payload, 'consents' => $accepted, 'consent_capacity' => 'self'])->assertUnprocessable();
        $this->assertSame(0, ConsultationConsent::count());
    }

    private function templates(string $status): void
    {
        foreach (ConsultationConsents::TYPES as $type) {
            ContractTemplate::create(['title' => $type, 'type' => $type, 'content' => 'Text demonstrativ pentru teste', 'status' => $status]);
        }
    }

    private function scenario(): array
    {
        Notification::fake();
        $patient = $this->user('patient');
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'video_price' => 500]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Test', 'status' => 'active']);
        Wallet::create(['user_id' => $patient->id, 'type' => 'real', 'balance_minor' => 100000]);

        return [$patient, $doctor, ['type' => 'video', 'consultation_kind' => 'video', 'doctor_id' => $doctor->id, 'patient_profile_id' => $profile->id, 'symptoms' => 'Consultație']];
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
