<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\DoctorService;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorServicesTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_manages_services_and_legacy_prices_follow(): void
    {
        $doctor = $this->doctor();
        Sanctum::actingAs($doctor);

        $id = $this->postJson('/api/v1/doctor/services', ['name' => 'Consultație video', 'type' => 'video', 'price' => 300, 'duration' => 30])
            ->assertCreated()
            ->assertJsonPath('service.type', 'video')
            ->json('service.id');
        $this->postJson('/api/v1/doctor/services', ['name' => 'Prin chat', 'type' => 'chat', 'price' => 150, 'duration' => 24])->assertCreated();

        $this->assertSame(150, $doctor->doctorProfile->fresh()->video_price);

        $this->putJson("/api/v1/doctor/services/{$id}", ['is_active' => false])->assertOk()->assertJsonPath('service.is_active', false);
        $this->getJson('/api/v1/doctor/services')->assertOk()->assertJsonCount(2, 'data');

        $other = $this->doctor();
        $foreign = DoctorService::create(['doctor_id' => $other->id, 'name' => 'X', 'type' => 'video', 'price' => 1, 'duration' => 10]);
        $this->putJson("/api/v1/doctor/services/{$foreign->id}", ['price' => 2])->assertNotFound();
        $this->deleteJson("/api/v1/doctor/services/{$id}")->assertOk();
        $this->assertDatabaseMissing('doctor_services', ['id' => $id]);
    }

    public function test_investigations_are_kept_only_for_home_services(): void
    {
        Sanctum::actingAs($this->doctor());

        $this->postJson('/api/v1/doctor/services', ['name' => 'Video', 'type' => 'video', 'price' => 300, 'duration' => 30, 'investigations' => ['1' => 'required']])
            ->assertCreated()
            ->assertJsonPath('service.investigations', []);
        $this->postJson('/api/v1/doctor/services', ['name' => 'Video', 'type' => 'video', 'price' => -5, 'duration' => 30])->assertUnprocessable();
    }

    public function test_booking_a_chat_service_uses_its_price_and_kind_and_keeps_a_snapshot(): void
    {
        $doctor = $this->doctor();
        $service = DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Consultație prin chat', 'type' => 'chat', 'price' => 150, 'duration' => 24]);
        $patient = $this->patient(balanceMinor: 100000);

        $this->postJson('/api/v1/requests/preview', ['patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'service_id' => $service->id])
            ->assertOk()
            ->assertJsonPath('cost.total', 150)
            ->assertJsonPath('consultation_kind', 'preliminary');

        $this->postJson('/api/v1/requests', [
            'type' => 'video', 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'service_id' => $service->id, 'symptoms' => 'Tuse',
        ])
            ->assertCreated()
            ->assertJsonPath('request.consultation_kind', 'preliminary')
            ->assertJsonPath('request.amount', 150)
            ->assertJsonPath('request.service.name', 'Consultație prin chat')
            ->assertJsonPath('request.service.type', 'chat');

        $service->update(['price' => 999, 'name' => 'Altul']);
        $item = ConsultationRequest::firstOrFail();
        $this->assertSame($service->id, $item->doctor_service_id);
        $this->assertSame('Consultație prin chat', $item->pricing_snapshot['service']['name']);
    }

    public function test_inactive_or_foreign_services_cannot_be_booked(): void
    {
        $doctor = $this->doctor();
        $inactive = DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Oprit', 'type' => 'video', 'price' => 100, 'duration' => 20, 'is_active' => false]);
        $foreign = DoctorService::create(['doctor_id' => $this->doctor()->id, 'name' => 'Străin', 'type' => 'video', 'price' => 100, 'duration' => 20]);
        $patient = $this->patient(balanceMinor: 100000);

        foreach ([$inactive, $foreign] as $service) {
            $this->postJson('/api/v1/requests', [
                'type' => 'video', 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'service_id' => $service->id, 'symptoms' => 'Tuse',
            ])->assertUnprocessable();
        }
    }

    public function test_catalog_lists_only_active_services_in_order(): void
    {
        $doctor = $this->doctor();
        DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Al doilea', 'type' => 'video', 'price' => 200, 'duration' => 15, 'position' => 2]);
        DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Primul', 'type' => 'chat', 'price' => 150, 'duration' => 24, 'position' => 1]);
        DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Oprit', 'type' => 'video', 'price' => 100, 'duration' => 15, 'position' => 0, 'is_active' => false]);

        $this->getJson('/api/v1/catalog/doctors')
            ->assertOk()
            ->assertJsonCount(2, 'data.0.services')
            ->assertJsonPath('data.0.services.0.name', 'Primul')
            ->assertJsonPath('data.0.services.1.name', 'Al doilea');
    }

    public function test_saving_the_profile_without_prices_keeps_the_prices_from_services(): void
    {
        $doctor = $this->doctor();
        Sanctum::actingAs($doctor);

        $this->putJson('/api/v1/doctor/profile', ['name' => 'Ana Ciobanu', 'bio' => 'Medic de familie'])->assertOk();

        $profile = $doctor->doctorProfile->fresh();
        $this->assertSame(300, $profile->video_price);
        $this->assertSame(400, $profile->consultation_price);
        $this->assertSame('Medic de familie', $profile->bio);
    }

    private function doctor(): User
    {
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'is_available' => true, 'consultation_price' => 400, 'video_price' => 300]);

        return $doctor;
    }

    private function patient(int $balanceMinor): PatientProfile
    {
        $user = $this->userWithRole('patient');
        Wallet::create(['user_id' => $user->id, 'type' => 'real', 'balance_minor' => $balanceMinor, 'currency' => 'MDL']);
        Sanctum::actingAs($user);

        return PatientProfile::create(['user_id' => $user->id, 'first_name' => 'Ana', 'last_name' => 'Pop', 'status' => 'active', 'active_until' => now()->addYear()]);
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
