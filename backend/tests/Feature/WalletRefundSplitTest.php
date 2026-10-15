<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\PatientProfile;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WalletRefundSplitTest extends TestCase
{
    use RefreshDatabase;

    public function test_all_bonus_reservation_returns_to_bonus_wallet_without_cash_credit(): void
    {
        $owner = User::factory()->create();
        $profile = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Eva', 'last_name' => 'Pop']);
        Wallet::create(['user_id' => $owner->id, 'type' => 'real', 'currency' => 'MDL', 'balance_minor' => 0]);
        Wallet::create(['user_id' => $owner->id, 'type' => 'points', 'currency' => 'MDL', 'balance_minor' => 0]);
        $request = ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'new', 'payment_status' => 'held', 'amount_minor' => 10000, 'real_amount_minor' => 0, 'points_amount_minor' => 10000]);
        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/requests/'.$request->id.'/cancel', ['reason' => 'Test'])->assertOk();
        $this->assertSame(0, Wallet::where('user_id', $owner->id)->where('type', 'real')->value('balance_minor'));
        $this->assertSame(10000, Wallet::where('user_id', $owner->id)->where('type', 'points')->value('balance_minor'));
    }
}
