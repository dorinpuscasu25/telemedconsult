<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Locality;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OperatorReassignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_operator_refusal_reassigns_to_next_eligible_operator(): void
    {
        [$region, $locality] = $this->place();
        $patient = $this->patient($region, $locality);
        $first = $this->operator($region->id);
        $second = $this->operator($region->id);

        $consultationRequest = $this->request($patient, $first->id);

        Sanctum::actingAs($first);
        $this->postJson("/api/v1/requests/{$consultationRequest->id}/reject", ['reason' => 'Ocupat'])->assertOk();

        $consultationRequest->refresh();
        $this->assertSame($second->id, (int) $consultationRequest->operator_id);
        $this->assertSame('new', $consultationRequest->status);
        $this->assertContains($first->id, $consultationRequest->declined_operator_ids);
    }

    public function test_exhausted_reassignment_refunds_and_marks_no_operator_available(): void
    {
        [$region, $locality] = $this->place();
        $patient = $this->patient($region, $locality);
        $only = $this->operator($region->id);

        Wallet::create(['user_id' => $patient->user->id, 'balance_minor' => 0, 'currency' => 'MDL']);
        $consultationRequest = $this->request($patient, $only->id, amountMinor: 71000);

        Sanctum::actingAs($only);
        $this->postJson("/api/v1/requests/{$consultationRequest->id}/reject", ['reason' => 'Nu pot'])->assertOk();

        $consultationRequest->refresh();
        $this->assertSame('no_operator_available', $consultationRequest->status);
        $this->assertSame('refunded', $consultationRequest->payment_status);
        $this->assertSame(71000, Wallet::where('user_id', $patient->user->id)->value('balance_minor'));
    }

    public function test_cancellation_after_operator_accepted_retains_travel_fee(): void
    {
        [$region, $locality] = $this->place();
        $patient = $this->patient($region, $locality);
        $operator = $this->operator($region->id);

        Wallet::create(['user_id' => $patient->user->id, 'balance_minor' => 0, 'currency' => 'MDL']);
        // total 710 MDL (71000 minor) with a 50 MDL (5000 minor) travel fee.
        $consultationRequest = $this->request($patient, $operator->id, amountMinor: 71000, travelFee: 50);
        $consultationRequest->forceFill(['status' => 'accepted', 'operator_accepted_at' => now()])->save();

        Sanctum::actingAs($patient->user);
        $this->postJson("/api/v1/requests/{$consultationRequest->id}/cancel", ['reason' => 'M-am răzgândit'])->assertOk();

        // Patient refunded 710 - 50 = 660 MDL.
        $this->assertSame(66000, Wallet::where('user_id', $patient->user->id)->value('balance_minor'));
        // Operator compensated the 50 MDL travel fee.
        $this->assertSame(5000, Wallet::where('user_id', $operator->id)->value('balance_minor'));
        $this->assertDatabaseHas('wallet_transactions', ['user_id' => $operator->id, 'type' => 'operator_travel_income', 'amount_minor' => 5000]);
    }

    public function test_cancellation_before_operator_accepts_refunds_in_full(): void
    {
        [$region, $locality] = $this->place();
        $patient = $this->patient($region, $locality);
        $operator = $this->operator($region->id);

        Wallet::create(['user_id' => $patient->user->id, 'balance_minor' => 0, 'currency' => 'MDL']);
        $consultationRequest = $this->request($patient, $operator->id, amountMinor: 71000, travelFee: 50);

        Sanctum::actingAs($patient->user);
        $this->postJson("/api/v1/requests/{$consultationRequest->id}/cancel", ['reason' => 'Anulare'])->assertOk();

        $this->assertSame(71000, Wallet::where('user_id', $patient->user->id)->value('balance_minor'));
        $this->assertSame(0, WalletTransaction::where('type', 'operator_travel_income')->count());
    }

    // --- helpers ---

    /**
     * @return array{0: Region, 1: Locality}
     */
    private function place(): array
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);

        return [$region, $locality];
    }

    private function patient(Region $region, Locality $locality): PatientProfile
    {
        $user = $this->userWithRole('patient');

        return PatientProfile::create([
            'user_id' => $user->id,
            'first_name' => 'Ana', 'last_name' => 'Pop', 'identity_number' => '2000000000001',
            'region' => $region->name, 'region_id' => $region->id,
            'locality' => $locality->name, 'locality_id' => $locality->id,
            'address' => 'Str. Test 1', 'status' => 'active', 'active_until' => now()->addYear(),
        ]);
    }

    private function operator(int $regionId): User
    {
        $user = $this->userWithRole('operator');
        OperatorProfile::create(['user_id' => $user->id, 'is_available' => true, 'is_approved' => true, 'accepting_requests' => true]);
        OperatorCoverage::create(['operator_id' => $user->id, 'region_id' => $regionId]);

        return $user;
    }

    private function request(PatientProfile $patient, int $operatorId, int $amountMinor = 0, int $travelFee = 0): ConsultationRequest
    {
        return ConsultationRequest::create([
            'patient_id' => $patient->user->id,
            'patient_profile_id' => $patient->id,
            'operator_id' => $operatorId,
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'status' => 'new',
            'symptoms' => 'Tuse',
            'amount_minor' => $amountMinor,
            'payment_status' => $amountMinor > 0 ? 'held' : 'none',
            'acceptance_expires_at' => now()->addMinutes(15),
            'pricing_snapshot' => ['cost_breakdown' => ['travel_fee' => $travelFee]],
        ]);
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
