<?php

namespace Tests\Feature;

use App\Models\PatientCardPackage;
use App\Models\PatientCardPurchase;
use App\Models\Payment;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\MaibCheckout;
use App\Services\PaymentVerification;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PatientOnboardingCheckoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_buys_directly_from_balance_when_no_topup_is_requested(): void
    {
        $patient = $this->patient();
        $package = $this->package();
        Wallet::create(['user_id' => $patient->id, 'type' => 'real', 'balance_minor' => 30000, 'currency' => 'MDL']);
        $this->mock(MaibCheckout::class)->shouldNotReceive('start');
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases/checkout', ['package_id' => $package->id, 'include_topup' => false])
            ->assertCreated()
            ->assertJsonPath('mode', 'purchased');

        $this->assertSame(6000, Wallet::where('user_id', $patient->id)->where('type', 'real')->value('balance_minor'));
        $this->assertSame(1, PatientCardPurchase::where('user_id', $patient->id)->count());
        $this->assertSame(0, Payment::count());
    }

    public function test_checkout_with_topup_pays_package_and_topup_in_one_maib_payment(): void
    {
        $patient = $this->patient();
        $package = $this->package();
        $this->fakeMaib();
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases/checkout', ['package_id' => $package->id, 'include_topup' => true])
            ->assertOk()
            ->assertJsonPath('mode', 'redirect')
            ->assertJsonPath('pay.payUrl', 'https://maib.test/pay');

        $payment = Payment::sole();
        $this->assertSame(74000, $payment->amount_minor);
        $this->assertSame('wallet_top_up', $payment->purpose);
        $this->assertSame($package->id, $payment->metadata['buy_package_id']);
        $this->assertSame('https://maib.test/pay', $payment->metadata['pay_url']);
        $this->assertSame(0, PatientCardPurchase::count());
    }

    public function test_confirmed_checkout_activates_the_package_and_leaves_the_topup_in_the_wallet(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
        $payment = $this->startCheckout(includeTopup: true);

        $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();

        $purchase = PatientCardPurchase::sole();
        $this->assertSame($payment->id, $purchase->payment_id);
        $this->assertSame(24000, $purchase->amount_minor);
        $this->assertSame(1, $purchase->availableSlots());
        $this->assertSame(50000, Wallet::where('user_id', $payment->user_id)->where('type', 'real')->value('balance_minor'));

        Sanctum::actingAs(User::find($payment->user_id));
        $this->postJson('/api/v1/patient/profiles', $this->profilePayload())->assertCreated();
    }

    public function test_duplicate_callback_and_ok_redirect_buy_the_package_only_once(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
        $payment = $this->startCheckout(includeTopup: true);

        foreach ([1, 2] as $attempt) {
            $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();
        }
        $this->get('/api/v1/payments/maib/ok?orderId='.$payment->id)->assertRedirectContains('/patient/start?payment=ok');

        $this->assertSame(1, PatientCardPurchase::count());
        $this->assertSame(1, WalletTransaction::where('type', 'patient_card_purchase')->count());
        $this->assertSame(1, WalletTransaction::where('type', 'top_up')->count());
        $this->assertSame(50000, Wallet::where('user_id', $payment->user_id)->where('type', 'real')->value('balance_minor'));
    }

    public function test_unverified_callback_buys_nothing(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnFalse();
        $payment = $this->startCheckout(includeTopup: true);

        $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertStatus(503);

        $this->assertSame(0, PatientCardPurchase::count());
        $this->assertSame('pending', $payment->fresh()->status);
    }

    public function test_topup_bonus_applies_to_the_whole_checkout_payment(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
        app(PlatformConfig::class)->upsert('wallet.topup_bonus_percent', 10);
        $payment = $this->startCheckout(includeTopup: true);

        $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();

        $this->assertSame(7400, Wallet::where('user_id', $payment->user_id)->where('type', 'points')->value('balance_minor'));
    }

    public function test_package_deactivated_before_confirmation_keeps_the_money_in_the_wallet(): void
    {
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
        $payment = $this->startCheckout(includeTopup: true);
        PatientCardPackage::query()->update(['is_active' => false]);

        $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();

        $this->assertSame(0, PatientCardPurchase::count());
        $this->assertSame(74000, Wallet::where('user_id', $payment->user_id)->where('type', 'real')->value('balance_minor'));
    }

    public function test_failed_redirect_for_a_checkout_returns_to_the_wizard(): void
    {
        $payment = $this->startCheckout(includeTopup: false);

        $this->get('/api/v1/payments/maib/fail?orderId='.$payment->id)->assertRedirectContains('/patient/start?payment=fail');
        $this->assertSame('failed', $payment->fresh()->status);
    }

    public function test_topup_amount_comes_from_the_admin_setting(): void
    {
        app(PlatformConfig::class)->upsert('onboarding.first_consultation_topup', 300, 'wallet', 'number');
        $patient = $this->patient();
        $package = $this->package();
        $this->fakeMaib();
        Sanctum::actingAs($patient);

        $this->getJson('/api/v1/patient/profile')->assertJsonPath('onboarding.first_consultation_topup', 300);
        $this->postJson('/api/v1/patient/card-purchases/checkout', ['package_id' => $package->id, 'include_topup' => true])->assertOk();

        $this->assertSame(54000, Payment::sole()->amount_minor);
    }

    public function test_checkout_respects_feature_flags(): void
    {
        $patient = $this->patient();
        $package = $this->package();
        app(PlatformConfig::class)->upsert('feature.patient_cards', false, 'features', 'boolean');
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases/checkout', ['package_id' => $package->id])->assertForbidden();
    }

    private function startCheckout(bool $includeTopup): Payment
    {
        $patient = $this->patient();
        $package = $this->package();
        $this->fakeMaib();
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases/checkout', ['package_id' => $package->id, 'include_topup' => $includeTopup])
            ->assertOk()
            ->assertJsonPath('mode', 'redirect');

        return Payment::sole();
    }

    private function fakeMaib(): void
    {
        $this->mock(MaibCheckout::class)->shouldReceive('start')->andReturnUsing(function (Payment $payment) {
            $payment->update([
                'provider_payment_id' => 'pay-'.$payment->id,
                'metadata' => [...($payment->metadata ?? []), 'pay_url' => 'https://maib.test/pay'],
            ]);

            return (object) ['payId' => 'pay-'.$payment->id, 'payUrl' => 'https://maib.test/pay'];
        });
    }

    private function patient(): User
    {
        $role = Role::firstOrCreate(['name' => 'patient'], ['label' => 'Pacient']);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function package(): PatientCardPackage
    {
        return PatientCardPackage::create([
            'name' => '1 profil / an',
            'profile_slots' => 1,
            'price_minor' => 24000,
            'validity_days' => 365,
            'is_active' => true,
        ]);
    }

    private function profilePayload(): array
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Durlești', 'type' => 'oras', 'is_active' => true]);

        return [
            'first_name' => 'Dorin',
            'last_name' => 'Puscasu',
            'birth_date' => '1990-01-01',
            'gender' => 'M',
            'region_id' => $region->id,
            'locality_id' => $locality->id,
        ];
    }
}
