<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\PatientProfile;
use App\Models\Referral;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDoctorActivityTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_sees_aggregates_without_clinical_content_and_others_cannot(): void
    {
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $patient = $this->user('patient');
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Test', 'status' => 'active']);
        $item = ConsultationRequest::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'type' => 'video', 'status' => 'completed', 'symptoms' => 'SECRET CLINIC', 'amount_minor' => 50000, 'real_amount_minor' => 25000, 'points_amount_minor' => 25000, 'payment_status' => 'captured']);
        Consultation::create(['consultation_request_id' => $item->id, 'doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'status' => 'completed', 'completed_at' => now(), 'diagnosis' => 'DIAGNOSTIC SECRET']);
        ConsultationRequest::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'type' => 'video', 'status' => 'accepted', 'amount_minor' => 27000, 'payment_status' => 'held']);
        $institution = MedicalInstitution::create(['name' => 'Clinica istorică', 'status' => 'active']);
        InstitutionEarning::create(['medical_institution_id' => $institution->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $item->id, 'gross_amount_minor' => 50000, 'provider_amount_minor' => 21250, 'doctor_share_percent' => 40, 'doctor_amount_minor' => 8500, 'institution_amount_minor' => 12750]);
        Referral::factory()->create(['referrer_id' => $doctor->id, 'referred_user_id' => $patient->id]);
        Sanctum::actingAs($doctor);
        $this->getJson("/api/v1/admin/doctors/{$doctor->id}/activity")->assertForbidden();
        Sanctum::actingAs($this->user('admin'));
        $response = $this->getJson("/api/v1/admin/doctors/{$doctor->id}/activity")->assertOk()->assertJsonPath('summary.completed_consultations', 1)->assertJsonPath('summary.unique_patients', 1)->assertJsonPath('summary.captured_cash', 250)->assertJsonPath('institution_balances.0.owed', 85)->assertJsonPath('summary.doctor_earned', 85)->assertJsonPath('summary.held_cash', 270)->assertJsonPath('summary.referred_accounts', 1);
        $this->assertStringNotContainsString('SECRET', $response->getContent());
        $this->getJson("/api/v1/admin/doctors/{$patient->id}/activity")->assertNotFound();
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
