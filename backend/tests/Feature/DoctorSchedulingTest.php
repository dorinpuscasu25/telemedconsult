<?php

namespace Tests\Feature;

use App\Models\DoctorAvailability;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Programul săptămânal al medicului e o restricție opțională: comutatorul care
 * decide dacă primește consultații e `is_available`.
 */
class DoctorSchedulingTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_doctor_without_a_configured_schedule_can_still_be_booked(): void
    {
        $scenario = $this->scenario();

        $this->postJson('/api/v1/requests', [
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
            'scheduled_at' => $this->nextMonday('10:00'),
        ])->assertCreated();
    }

    public function test_a_configured_schedule_is_still_enforced(): void
    {
        $scenario = $this->scenario();

        // Luni, 09:00–12:00.
        DoctorAvailability::create([
            'doctor_id' => $scenario['doctor']->id,
            'weekday' => Carbon::MONDAY,
            'starts_at' => '09:00:00',
            'ends_at' => '12:00:00',
            'is_active' => true,
        ]);

        $this->postJson('/api/v1/requests', [
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
            'scheduled_at' => $this->nextMonday('18:00'),
        ])->assertStatus(422);

        $this->postJson('/api/v1/requests', [
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
            'scheduled_at' => $this->nextMonday('10:00'),
        ])->assertCreated();
    }

    public function test_an_unavailable_doctor_is_still_refused(): void
    {
        $scenario = $this->scenario();
        $scenario['doctor']->doctorProfile->forceFill(['is_available' => false])->save();

        $this->postJson('/api/v1/requests', [
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
            'scheduled_at' => $this->nextMonday('10:00'),
        ])->assertStatus(422);
    }

    private function nextMonday(string $time): string
    {
        return Carbon::now()->next(Carbon::MONDAY)->setTimeFromTimeString($time)->format('Y-m-d H:i:s');
    }

    /**
     * @return array{patient: PatientProfile, doctor: User}
     */
    private function scenario(): array
    {
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'is_approved' => true,
            'is_available' => true,
            'consultation_price' => 400,
            'video_price' => 300,
        ]);

        $patientUser = $this->userWithRole('patient');
        Wallet::create(['user_id' => $patientUser->id, 'balance_minor' => 500000, 'currency' => 'MDL']);
        $patient = PatientProfile::create([
            'user_id' => $patientUser->id,
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);

        Sanctum::actingAs($patientUser);

        return ['patient' => $patient, 'doctor' => $doctor];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
