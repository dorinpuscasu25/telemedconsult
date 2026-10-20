<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ActiveConsultationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.livekit.url' => 'wss://test.livekit.cloud', 'services.livekit.api_key' => 'test', 'services.livekit.api_secret' => 'test']);
    }

    public function test_authentication_and_persisted_role_are_required(): void
    {
        $this->getJson('/api/v1/requests/active?role=patient')->assertUnauthorized();
        Sanctum::actingAs($this->userWithRole('patient'));
        $this->getJson('/api/v1/requests/active?role=doctor')->assertForbidden();
        $this->getJson('/api/v1/requests/active?role=admin')->assertUnprocessable();
    }

    public function test_patient_and_assigned_doctor_can_resume_the_same_consultation_without_medical_data(): void
    {
        [$patient, $doctor, $consultation] = $this->scenario();
        $consultation->update(['doctor_started_at' => now()]);
        $chat = Conversation::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $consultation->id, 'status' => 'open']);
        foreach ([[$patient, 'patient'], [$doctor, 'doctor']] as [$user, $role]) {
            Sanctum::actingAs($user);
            $response = $this->getJson('/api/v1/requests/active?role='.$role)->assertOk()
                ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', (string) $consultation->id)
                ->assertJsonPath('data.0.conversation_id', $chat->id)->assertJsonPath('data.0.video_available', true)
                ->assertJsonMissingPath('data.0.symptoms')->assertJsonMissingPath('data.0.identity_number')->assertJsonMissingPath('data.0.medical_record');
            $this->assertNotNull($response->json('data.0.doctor_started_at'));
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        }
    }

    public function test_other_users_and_unassigned_requests_are_not_listed(): void
    {
        [, , $consultation] = $this->scenario();
        foreach (['patient', 'doctor', 'operator'] as $role) {
            Sanctum::actingAs($this->userWithRole($role));
            $this->getJson('/api/v1/requests/active?role='.$role)->assertOk()->assertJsonCount(0, 'data');
        }
        $consultation->update(['doctor_id' => null]);
        Sanctum::actingAs($this->userWithRole('doctor'));
        $this->getJson('/api/v1/requests/active?role=doctor')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_terminal_and_concluded_consultations_disappear(): void
    {
        [$patient, , $consultation] = $this->scenario();
        Sanctum::actingAs($patient);
        foreach (['new', 'completed', 'cancelled', 'rejected', 'expired', 'no_operator_available'] as $status) {
            $consultation->update(['status' => $status]);
            $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonCount(0, 'data');
        }
        $consultation->update(['status' => 'accepted']);
        foreach (['conclusion_sent_at', 'closed_at', 'completed_at', 'cancelled_at'] as $field) {
            $consultation->update([$field => now()]);
            $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonCount(0, 'data');
            $consultation->update([$field => null]);
        }
    }

    public function test_rescheduled_consultation_remains_visible_but_cannot_join_video(): void
    {
        [$patient, , $consultation] = $this->scenario();
        $consultation->update(['status' => 'rescheduled']);
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.video_available', false);
    }

    public function test_video_respects_examination_configuration_and_operator_participation(): void
    {
        [, , $consultation] = $this->scenario();
        $operator = $this->userWithRole('operator');
        $consultation->update(['operator_id' => $operator->id, 'consultation_kind' => 'with_exam']);
        Sanctum::actingAs($operator);
        $this->getJson('/api/v1/requests/active?role=operator')->assertOk()->assertJsonPath('data.0.video_available', false);
        $consultation->update(['objective_data_completed_at' => now(), 'doctor_started_at' => now()]);
        $this->getJson('/api/v1/requests/active?role=operator')->assertOk()->assertJsonPath('data.0.video_available', true);
        config(['services.livekit.api_secret' => null]);
        $this->getJson('/api/v1/requests/active?role=operator')->assertOk()->assertJsonPath('data.0.video_available', false);
        config(['services.livekit.api_secret' => 'test']);
        $consultation->update(['consultation_kind' => 'video']);
        $this->getJson('/api/v1/requests/active?role=operator')->assertOk()->assertJsonPath('data.0.video_available', false);
    }

    public function test_resume_video_is_available_once_doctor_explicitly_opens_including_early_start(): void
    {
        [$patient, , $consultation] = $this->scenario();
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonPath('data.0.video_available', false);
        $consultation->update(['doctor_started_at' => now(), 'scheduled_at' => now()->addHour()]);
        $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonPath('data.0.video_available', true);
        $this->travelTo($consultation->scheduled_at);
        $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonPath('data.0.video_available', true);
    }

    public function test_multiple_roles_do_not_mix_patient_and_doctor_consultations(): void
    {
        [$patient] = $this->scenario();
        $patient->roles()->attach(Role::where('name', 'doctor')->firstOrFail());
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/active?role=patient')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/requests/active?role=doctor')->assertOk()->assertJsonCount(0, 'data');
    }

    private function userWithRole(string $role): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $user->roles()->attach(Role::firstOrCreate(['name' => $role], ['label' => $role]));

        return $user;
    }

    private function scenario(): array
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ion', 'last_name' => 'Exemplu', 'status' => 'active', 'medical_record' => ['birth' => ['blood_group' => 'A']]]);
        $consultation = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'patient_profile_id' => $profile->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Private']);

        return [$patient, $doctor, $consultation];
    }
}
