<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
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
        ])->assertCreated()->assertJsonPath('request.acceptance_expires_at', null);
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

    public function test_iso_request_checks_doctor_hours_on_the_local_day_across_midnight(): void
    {
        $scenario = $this->scenario();
        DoctorAvailability::create([
            'doctor_id' => $scenario['doctor']->id,
            'weekday' => Carbon::MONDAY, 'starts_at' => '00:00:00', 'ends_at' => '01:00:00', 'is_active' => true,
        ]);
        $localMonday = Carbon::now('Europe/Chisinau')->next(Carbon::MONDAY)->startOfDay();
        $this->assertNotSame($localMonday->dayOfWeek, $localMonday->copy()->utc()->dayOfWeek);
        $this->postJson('/api/v1/requests', [
            'type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id, 'symptoms' => 'Tuse', 'scheduled_at' => $localMonday->toISOString(),
        ])->assertCreated();
        $stored = ConsultationRequest::latest('id')->firstOrFail();
        $this->assertTrue($stored->scheduled_at->equalTo($localMonday));
        $this->postJson('/api/v1/requests', [
            'type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id, 'symptoms' => 'Tuse', 'scheduled_at' => $localMonday->copy()->addHours(2)->toISOString(),
        ])->assertUnprocessable();
    }

    public function test_doctor_opens_confirmed_consultation_only_at_scheduled_time(): void
    {
        $scenario = $this->scenario();
        $request = $this->scheduledRequest($scenario);
        Sanctum::actingAs($scenario['doctor']);
        $this->postJson('/api/v1/requests/'.$request->id.'/start')->assertUnprocessable();
        $this->postJson('/api/v1/requests/'.$request->id.'/accept')->assertOk();
        $this->postJson('/api/v1/requests/'.$request->id.'/start')->assertUnprocessable();
        $this->travelTo($request->scheduled_at);
        $this->postJson('/api/v1/requests/'.$request->id.'/start')->assertOk();
        $this->assertNotNull($request->refresh()->doctor_started_at);
    }

    public function test_patient_confirmation_of_doctor_proposal_confirms_the_appointment(): void
    {
        $scenario = $this->scenario();
        $request = $this->scheduledRequest($scenario);
        Sanctum::actingAs($scenario['doctor']);
        $proposedAt = now()->addDays(2)->startOfHour();
        $this->postJson('/api/v1/requests/'.$request->id.'/propose-time', ['scheduled_at' => $proposedAt->toISOString()])
            ->assertOk()->assertJsonPath('request.status', 'rescheduled');
        $this->postJson('/api/v1/requests/'.$request->id.'/accept')->assertUnprocessable();
        $this->postJson('/api/v1/requests/'.$request->id.'/start')->assertUnprocessable();
        Sanctum::actingAs($scenario['patient']->user);
        $this->postJson('/api/v1/requests/'.$request->id.'/accept-proposed-time')
            ->assertOk()->assertJsonPath('request.status', 'accepted');
        $request->refresh();
        $this->assertTrue($request->scheduled_at->equalTo($proposedAt));
        $this->assertNull($request->acceptance_expires_at);
        $this->assertNull($request->proposed_scheduled_at);
    }

    public function test_unrelated_provider_cannot_propose_a_time(): void
    {
        $scenario = $this->scenario();
        $request = $this->scheduledRequest($scenario);
        Sanctum::actingAs($this->userWithRole('doctor'));
        $this->postJson('/api/v1/requests/'.$request->id.'/propose-time', ['scheduled_at' => now()->addDays(2)->toISOString()])->assertForbidden();
    }

    private function scheduledRequest(array $scenario): ConsultationRequest
    {
        return ConsultationRequest::create([
            'patient_id' => $scenario['patient']->user_id, 'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'new',
            'scheduled_at' => now()->addDay(), 'symptoms' => 'Tuse',
        ]);
    }

    private function nextMonday(string $time): string
    {
        return Carbon::now('Europe/Chisinau')->next(Carbon::MONDAY)->setTimeFromTimeString($time)->toISOString();
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
