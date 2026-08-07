<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\ReferralCommission;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\ReferralProgram;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regula de business testată: invitatorul primește un procent configurabil din
 * FIECARE alimentare de portofel confirmată a utilizatorului invitat. Nimic nu
 * se plătește la înregistrare sau la confirmarea emailului.
 */
class PatientReferralProgramTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['otp.demo_code_enabled' => true]);
        Mail::fake();

        foreach (['admin', 'patient', 'doctor', 'operator'] as $name) {
            Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        }

        Specialty::firstOrCreate(['slug' => 'cardiologie'], ['name' => 'Cardiologie']);
    }

    public function test_inviter_receives_percentage_of_each_confirmed_top_up(): void
    {
        $this->setRate(10);
        $referrer = $this->patient('inviter@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);

        $invited = $this->registerAndVerifyPatient('invited@example.test', $code);

        // Confirmarea emailului NU trebuie să crediteze nimic.
        $this->assertNull(Wallet::where('user_id', $referrer->id)->value('balance_minor'));
        $this->assertSame(0, ReferralCommission::count());

        // Prima alimentare: 500 MDL la 10% => 50 MDL.
        $this->completeTopUp($invited, 500.00);
        $this->assertSame(5000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));

        // A doua alimentare: 200 MDL la 10% => 20 MDL, cumulat 70 MDL.
        $this->completeTopUp($invited, 200.00);
        $this->assertSame(7000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));

        $this->assertSame(2, ReferralCommission::where('referrer_id', $referrer->id)->count());
        $this->assertSame(2, WalletTransaction::where('type', 'referral_topup_commission')->count());
    }

    public function test_repeated_payment_confirmation_does_not_pay_twice(): void
    {
        $this->setRate(10);
        $referrer = $this->patient('idempotent@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $invited = $this->registerAndVerifyPatient('idempotent-invited@example.test', $code);

        $payment = $this->pendingPayment($invited, 300.00);

        // Callback MAIB livrat de două ori pentru aceeași plată.
        $this->confirmPayment($payment);
        $this->confirmPayment($payment);

        $this->assertSame(3000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));
        $this->assertSame(1, ReferralCommission::where('payment_id', $payment->id)->count());
    }

    public function test_first_deposit_only_mode_pays_a_single_commission(): void
    {
        $this->setRate(10);
        $this->setSetting(ReferralProgram::FIRST_ONLY_SETTING, true, 'boolean');

        $referrer = $this->patient('first-only@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $invited = $this->registerAndVerifyPatient('first-only-invited@example.test', $code);

        $this->completeTopUp($invited, 400.00);
        $this->completeTopUp($invited, 400.00);

        $this->assertSame(4000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));
        $this->assertSame(1, ReferralCommission::where('referrer_id', $referrer->id)->count());
    }

    public function test_top_up_below_minimum_amount_is_not_commissioned(): void
    {
        $this->setRate(10);
        $this->setSetting(ReferralProgram::MIN_AMOUNT_SETTING, 250, 'number');

        $referrer = $this->patient('minimum@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $invited = $this->registerAndVerifyPatient('minimum-invited@example.test', $code);

        $this->completeTopUp($invited, 100.00);
        $this->assertSame(0, ReferralCommission::count());

        $this->completeTopUp($invited, 250.00);
        $this->assertSame(2500, Wallet::where('user_id', $referrer->id)->value('balance_minor'));
    }

    public function test_rate_is_snapshotted_per_commission_and_uses_the_current_value(): void
    {
        $this->setRate(5);
        $referrer = $this->patient('snapshot@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $invited = $this->registerAndVerifyPatient('snapshot-invited@example.test', $code);

        $this->completeTopUp($invited, 1000.00);
        $this->assertSame(5000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));

        // Adminul urcă procentul: alimentările următoare folosesc noua cotă,
        // iar cele deja plătite își păstrează cota istorică.
        $this->setRate(20);
        $this->completeTopUp($invited, 1000.00);

        $this->assertSame(25000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));

        $rates = ReferralCommission::orderBy('id')->pluck('rate_percent')->map(fn ($rate) => (float) $rate)->all();
        $this->assertSame([5.0, 20.0], $rates);
    }

    public function test_zero_rate_and_disabled_program_pay_nothing(): void
    {
        $this->setRate(0);
        $referrer = $this->patient('zero@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $invited = $this->registerAndVerifyPatient('zero-invited@example.test', $code);

        $this->completeTopUp($invited, 500.00);
        $this->assertSame(0, ReferralCommission::count());

        // Program dezactivat: chiar cu procent valid nu se plătește nimic.
        $this->setRate(10);
        $this->setSetting('feature.affiliate_program', false, 'boolean', 'features');

        $this->completeTopUp($invited, 500.00);
        $this->assertSame(0, ReferralCommission::count());
    }

    public function test_self_referral_is_not_possible(): void
    {
        $this->setRate(10);
        $patient = $this->patient('self@example.test');
        $code = app(ReferralProgram::class)->ensureCode($patient);

        // Codul propriu nu creează legătură.
        $this->assertNull(app(ReferralProgram::class)->attachPatient($patient, $code));

        $this->completeTopUp($patient, 500.00);
        $this->assertSame(0, ReferralCommission::count());
    }

    public function test_invalid_referral_code_is_rejected_and_provider_signup_is_not_attached(): void
    {
        $this->registerPatient('invalid@example.test', 'COD-INVALID')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('referral_code');

        $referrer = $this->patient('provider-inviter@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Medic Invitat',
            'email' => 'provider@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'doctor',
            'phone' => '069484967',
            'specialty_id' => Specialty::firstOrFail()->id,
            'referral_code' => $code,
        ])->assertCreated();

        $provider = User::where('email', 'provider@example.test')->firstOrFail();
        $this->assertDatabaseMissing('referrals', ['referred_user_id' => $provider->id]);
    }

    public function test_patient_summary_exposes_rate_and_masks_invitee(): void
    {
        $this->setRate(10);
        $referrer = $this->patient('summary@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $invited = $this->registerAndVerifyPatient('private-invitee@example.test', $code);

        Sanctum::actingAs($referrer);

        $response = $this->getJson('/api/v1/patient/referrals')
            ->assertOk()
            ->assertJsonPath('code', $code)
            ->assertJsonPath('commission_rate', 10)
            ->assertJsonPath('stats.invited_count', 1)
            ->assertJsonPath('stats.active_count', 0)
            ->assertJsonPath('stats.pending_count', 1)
            ->assertJsonPath('latest_referrals.0.status', 'waiting_topup');

        $this->assertStringNotContainsString('private-invitee', $response->json('latest_referrals.0.email'));

        $this->completeTopUp($invited, 500.00);

        Sanctum::actingAs($referrer);
        $this->getJson('/api/v1/patient/referrals')
            ->assertOk()
            ->assertJsonPath('stats.active_count', 1)
            ->assertJsonPath('stats.earned_total', 50)
            ->assertJsonPath('latest_referrals.0.status', 'earning');
    }

    public function test_admin_can_set_the_rate_and_bounds_are_enforced(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);
        Sanctum::actingAs($admin);

        // Peste 100% trebuie respins: un procent invalid poate goli platforma.
        $this->putJson('/api/v1/admin/settings', [
            'settings' => [[
                'key' => ReferralProgram::RATE_SETTING,
                'value' => 101,
                'type' => 'number',
            ]],
        ])->assertUnprocessable();

        $this->putJson('/api/v1/admin/settings', [
            'settings' => [[
                'key' => ReferralProgram::RATE_SETTING,
                'value' => -1,
                'type' => 'number',
            ]],
        ])->assertUnprocessable();

        $this->putJson('/api/v1/admin/settings', [
            'settings' => [[
                'key' => ReferralProgram::RATE_SETTING,
                'value' => 7.5,
                'type' => 'number',
            ]],
        ])->assertOk();

        $this->assertSame(7.5, (float) PlatformSetting::where('key', ReferralProgram::RATE_SETTING)->value('value'));
        $this->assertSame(7.5, app(ReferralProgram::class)->ratePercent());
    }

    // --- helpers ---------------------------------------------------------

    private function patient(string $email): User
    {
        $patient = User::factory()->create([
            'email' => $email,
            'status' => 'active',
            'active_role_id' => Role::where('name', 'patient')->value('id'),
        ]);
        $patient->roles()->sync([Role::where('name', 'patient')->value('id')]);

        return $patient;
    }

    private function registerPatient(string $email, string $referralCode)
    {
        return $this->postJson('/api/v1/auth/register', [
            'name' => 'Pacient Invitat',
            'email' => $email,
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'patient',
            'referral_code' => $referralCode,
        ]);
    }

    private function registerAndVerifyPatient(string $email, string $code): User
    {
        $registration = $this->registerPatient($email, $code)->assertCreated();

        $this->postJson('/api/v1/auth/verify-email-otp', [
            'email' => $email,
            'code' => $registration->json('dev_otp'),
        ])->assertOk();

        $user = User::where('email', $email)->firstOrFail();
        $this->assertDatabaseHas('referrals', ['referred_user_id' => $user->id]);

        return $user;
    }

    private function pendingPayment(User $user, float $amount): Payment
    {
        $wallet = Wallet::firstOrCreate(
            ['user_id' => $user->id],
            ['balance_minor' => 0, 'currency' => 'MDL'],
        );

        return Payment::create([
            'user_id' => $user->id,
            'wallet_id' => $wallet->id,
            'amount_minor' => (int) round($amount * 100),
            'currency' => 'MDL',
            'purpose' => 'wallet_top_up',
            'status' => 'pending',
            'provider' => 'maib',
            'metadata' => ['source' => 'test'],
        ]);
    }

    /** Simulează confirmarea plății pe același drum pe care o face MAIB. */
    private function confirmPayment(Payment $payment): void
    {
        $this->postJson('/api/v1/payments/callback/maib', [
            'orderId' => (string) $payment->id,
            'status' => 'OK',
        ])->assertOk();
    }

    private function completeTopUp(User $user, float $amount): Payment
    {
        $payment = $this->pendingPayment($user, $amount);
        $this->confirmPayment($payment);

        return $payment->refresh();
    }

    private function setRate(float $percent): void
    {
        $this->setSetting(ReferralProgram::RATE_SETTING, $percent, 'number');
    }

    private function setSetting(string $key, mixed $value, string $type, string $group = 'affiliate'): void
    {
        PlatformSetting::updateOrCreate(['key' => $key], [
            'value' => $value,
            'group' => $group,
            'type' => $type,
        ]);
    }
}
