<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use App\Models\Consultation;
use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorExtrasTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_uploads_a_photo_that_shows_in_the_catalog(): void
    {
        Storage::fake('public');
        $doctor = $this->doctor();
        Sanctum::actingAs($doctor);

        $url = $this->post('/api/v1/doctor/avatar', ['avatar' => UploadedFile::fake()->image('ana.jpg', 400, 400)], ['Accept' => 'application/json'])
            ->assertOk()->json('avatar');

        $this->assertNotNull($url);
        $this->getJson('/api/v1/catalog/doctors')->assertOk()->assertJsonPath('data.0.avatar', $url);
    }

    public function test_payout_account_is_saved_and_used_for_withdrawals(): void
    {
        $doctor = $this->doctor();
        Sanctum::actingAs($doctor);

        $this->putJson('/api/v1/doctor/profile', ['name' => $doctor->name, 'payout_bank' => 'MAIB', 'payout_iban' => 'md24 ag00 0000 0225 1000 4821'])->assertOk();
        $this->assertSame('MD24AG000000022510004821', $doctor->doctorProfile->fresh()->payout_iban);
        Sanctum::actingAs($doctor->fresh());
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.payout_account', 'MAIB ···· 4821');

        $this->putJson('/api/v1/doctor/profile', ['name' => $doctor->name, 'payout_iban' => 'MD24-<script>'])->assertUnprocessable();
    }

    public function test_doctor_writes_to_admins_about_the_institution(): void
    {
        $admin = $this->user('admin');
        Sanctum::actingAs($this->doctor());

        $this->postJson('/api/v1/doctor/institution-request', ['message' => 'Lucrez la CMF nr. 2'])->assertOk();
        $this->assertSame(1, $admin->notifications()->count());
    }

    public function test_news_audience_separates_doctor_announcements(): void
    {
        BlogPost::create(['title' => 'Pentru toți', 'slug' => 'toti', 'body' => 'x', 'is_published' => true, 'published_at' => now(), 'audience' => 'all']);
        BlogPost::create(['title' => 'Pentru medici', 'slug' => 'medici', 'body' => 'x', 'is_published' => true, 'published_at' => now(), 'audience' => 'doctors']);

        $this->getJson('/api/v1/catalog/blog')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/catalog/blog?audience=doctors')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_conclusion_draft_includes_previous_consultations_and_measurements(): void
    {
        $doctor = $this->doctor();
        $owner = $this->user('patient');
        $profile = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Ana', 'last_name' => 'Pop', 'status' => 'active']);
        $old = ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'preliminary', 'status' => 'completed', 'symptoms' => 'Tuse']);
        Consultation::create(['consultation_request_id' => $old->id, 'patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'status' => 'completed', 'diagnosis' => 'Rinofaringită', 'price' => 150, 'completed_at' => now()->subMonth()]);
        ConsultationObjectiveData::create(['consultation_request_id' => $old->id, 'patient_profile_id' => $profile->id, 'source' => 'manual', 'payload' => ['weight' => 22, 'height' => 121]]);
        $current = ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Febră']);

        Sanctum::actingAs($doctor);
        $this->getJson("/api/v1/requests/{$current->id}/conclusion-draft")->assertOk()
            ->assertJsonPath('context.weight', 22)
            ->assertJsonPath('context.height', 121)
            ->assertJsonPath('context.previous.0.diagnosis', 'Rinofaringită')
            ->assertJsonPath('context.previous.0.kind', 'preliminary');
    }

    public function test_patient_is_reminded_once_before_a_proposal_expires(): void
    {
        $doctor = $this->doctor();
        $owner = $this->user('patient');
        $profile = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Ana', 'last_name' => 'Pop', 'status' => 'active']);
        ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'rescheduled', 'symptoms' => 'Febră', 'proposed_scheduled_at' => now()->addDay(), 'proposal_expires_at' => now()->addHour()]);

        $this->artisan('consultations:remind')->assertSuccessful();
        $this->artisan('consultations:remind')->assertSuccessful();

        $this->assertSame(1, $owner->notifications()->count());
    }

    private function doctor(): User
    {
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'is_available' => true]);

        return $doctor;
    }

    private function user(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
