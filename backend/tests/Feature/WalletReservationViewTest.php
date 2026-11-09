<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Portofelul arată banii rezervați pentru consultații și ciclul fiecărei rezervări
 * (Rezervat → Plătit sau Returnat), fără să schimbe cum se mișcă banii.
 */
class WalletReservationViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_wallet_shows_reserved_money_and_the_reservation_state(): void
    {
        [$patient, $profile, $doctor] = $this->scenario();

        $requestId = $this->postJson('/api/v1/requests', [
            'type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $profile->id,
            'doctor_id' => $doctor->id, 'symptoms' => 'Tuse',
        ])->assertCreated()->json('request.id');

        $wallet = $this->getJson('/api/v1/wallet')->assertOk();
        $wallet->assertJsonPath('wallet.balance', 700)
            ->assertJsonPath('reserved.total', 300)
            ->assertJsonPath('reserved.items.0.provider_name', $doctor->name)
            ->assertJsonPath('reserved.items.0.patient_name', 'Ana Pop')
            ->assertJsonPath('transactions.0.kind', 'service_hold')
            ->assertJsonPath('transactions.0.consultation_request_id', (int) $requestId)
            ->assertJsonPath('transactions.0.consultation.reservation_state', 'reserved');

        $this->postJson('/api/v1/requests/'.$requestId.'/cancel', ['reason' => 'Nu mai am nevoie'])->assertOk();

        $this->getJson('/api/v1/wallet')->assertOk()
            ->assertJsonPath('wallet.balance', 1000)
            ->assertJsonPath('reserved.total', 0)
            ->assertJsonCount(0, 'reserved.items')
            ->assertJsonPath('transactions.0.kind', 'service_refund')
            ->assertJsonPath('transactions.0.consultation.reservation_state', 'refunded')
            ->assertJsonPath('transactions.1.consultation.reservation_state', 'refunded');
    }

    public function test_wallet_does_not_expose_other_patients_consultations(): void
    {
        [$patient] = $this->scenario();
        [$other, $otherProfile, $doctor] = $this->scenario();
        $this->postJson('/api/v1/requests', [
            'type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $otherProfile->id,
            'doctor_id' => $doctor->id, 'symptoms' => 'Tuse',
        ])->assertCreated();

        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/wallet')->assertOk()
            ->assertJsonPath('reserved.total', 0)
            ->assertJsonCount(0, 'transactions');
    }

    /**
     * @return array{0: User, 1: PatientProfile, 2: User}
     */
    private function scenario(): array
    {
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'is_available' => true, 'consultation_price' => 400, 'video_price' => 300]);
        $patient = $this->userWithRole('patient');
        Wallet::create(['user_id' => $patient->id, 'type' => 'real', 'balance_minor' => 100000, 'currency' => 'MDL']);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Pop', 'status' => 'active', 'active_until' => now()->addYear()]);
        Sanctum::actingAs($patient);

        return [$patient, $profile, $doctor];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
