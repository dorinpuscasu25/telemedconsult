<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\PaymentVerification;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WalletTopupBonusTest extends TestCase
{
    use RefreshDatabase;

    public function test_confirmed_deposit_adds_full_cash_and_separate_bonus_only_once(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
        app(PlatformConfig::class)->upsert('wallet.topup_bonus_percent', 10);
        $payment = $this->payment();
        foreach ([1, 2] as $attempt) {
            $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();
        }
        $this->assertSame(100000, Wallet::where('user_id', $payment->user_id)->where('type', 'real')->value('balance_minor'));
        $this->assertSame(10000, Wallet::where('user_id', $payment->user_id)->where('type', 'points')->value('balance_minor'));
        $this->assertSame(1, WalletTransaction::where('type', 'topup_bonus')->count());
        $this->assertSame(10.0, (float) WalletTransaction::where('type', 'topup_bonus')->first()->rate_snapshot['wallet.topup_bonus_percent']);
        Sanctum::actingAs(User::find($payment->user_id));
        $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('wallet.balance', 1000)->assertJsonPath('points_wallet.balance', 100);
    }

    public function test_unverified_callback_and_success_redirect_cannot_credit_money(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnFalse();
        app(PlatformConfig::class)->upsert('wallet.topup_bonus_percent', 10);
        $payment = $this->payment();
        $this->postJson('/api/v1/payments/callback/maib', ['orderId' => $payment->id, 'status' => 'paid'])->assertStatus(503);
        $this->get('/api/v1/payments/maib/ok?orderId='.$payment->id)->assertRedirect();
        $this->assertSame('pending', $payment->fresh()->status);
        $this->assertSame(0, Wallet::findOrFail($payment->wallet_id)->balance_minor);
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_new_percentage_does_not_rewrite_existing_bonus_and_zero_disables(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
        $config = app(PlatformConfig::class);
        $config->upsert('wallet.topup_bonus_percent', 10);
        $first = $this->payment();
        $this->confirm($first);
        $config->upsert('wallet.topup_bonus_percent', 20);
        $second = $this->payment(User::find($first->user_id));
        $this->confirm($second);
        $config->upsert('wallet.topup_bonus_percent', 0);
        $this->confirm($this->payment(User::find($first->user_id)));
        $this->assertSame(300000, Wallet::findOrFail($first->wallet_id)->balance_minor);
        $this->assertSame(30000, Wallet::where('user_id', $first->user_id)->where('type', 'points')->value('balance_minor'));
        $this->assertSame([10.0, 20.0], WalletTransaction::where('type', 'topup_bonus')->get()->map(fn ($item) => (float) $item->rate_snapshot['wallet.topup_bonus_percent'])->all());
    }

    public function test_admin_percentage_rejects_values_outside_range(): void
    {
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::create(['name' => 'admin', 'label' => 'Admin']));
        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'wallet.topup_bonus_percent', 'value' => 101, 'type' => 'number']]])->assertUnprocessable();
    }

    private function payment(?User $user = null): Payment
    {
        $user ??= User::factory()->create();
        $wallet = Wallet::firstOrCreate(['user_id' => $user->id, 'type' => 'real'], ['balance_minor' => 0, 'currency' => 'MDL']);

        return Payment::create(['user_id' => $user->id, 'wallet_id' => $wallet->id, 'amount_minor' => 100000, 'currency' => 'MDL', 'purpose' => 'wallet_top_up', 'status' => 'pending', 'provider' => 'maib', 'provider_payment_id' => (string) Str::uuid()]);
    }

    private function confirm(Payment $payment): void
    {
        $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();
    }
}
