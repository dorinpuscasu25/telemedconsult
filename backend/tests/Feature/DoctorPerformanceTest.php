<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorPerformanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_and_admin_see_the_same_score_and_explained_components(): void
    {
        $this->freezeTime();
        $doctor = $this->user('doctor');
        $patient = $this->user('patient');
        DoctorProfile::create(['user_id' => $doctor->id, 'rating' => 4.5]);
        foreach ([now(), now(), now()->subMonth()] as $date) {
            $request = ConsultationRequest::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'type' => 'video', 'status' => 'completed', 'doctor_response_minutes' => 20]);
            Consultation::create(['consultation_request_id' => $request->id, 'doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'status' => 'completed', 'completed_at' => $date]);
        }
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/doctor/dashboard')->assertOk()->assertJsonPath('summary.performance.score', 94.5)
            ->assertJsonPath('summary.performance.components.current_month', 8)
            ->assertJsonPath('summary.performance.components.previous_consultations', 1.5)
            ->assertJsonPath('summary.performance.components.rating', 45)
            ->assertJsonPath('summary.performance.components.response', 40);
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.performance.score', 94.5);
        Sanctum::actingAs($this->user('admin'));
        $this->getJson('/api/v1/admin/top-doctors')->assertOk()->assertJsonPath('data.0.score', 94.5);
    }

    public function test_missing_response_data_is_explicit_and_never_exposes_another_doctors_data(): void
    {
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id]);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/doctor/dashboard')->assertOk()->assertJsonPath('summary.performance.response_uses_default', true)->assertJsonPath('summary.performance.average_response_minutes', null);
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/doctor/dashboard')->assertForbidden();
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }
}
