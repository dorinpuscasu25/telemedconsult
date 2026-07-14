<?php

namespace Tests\Feature;

use App\Models\PlatformSetting;
use App\Models\Referral;
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

    public function test_verified_patient_referral_credits_inviter_exactly_once(): void
    {
        $this->setReward(25);
        $referrer = $this->patient('inviter@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);

        $registration = $this->registerPatient('invited@example.test', $code)
            ->assertCreated();

        $invited = User::where('email', 'invited@example.test')->firstOrFail();
        $referral = Referral::where('referred_user_id', $invited->id)->firstOrFail();

        $this->assertSame(Referral::STATUS_PENDING, $referral->status);
        $this->assertSame(2500, $referral->reward_amount_minor);
        $this->assertNull(Wallet::where('user_id', $referrer->id)->first());

        $payload = [
            'email' => $invited->email,
            'code' => $registration->json('dev_otp'),
        ];

        $this->postJson('/api/v1/auth/verify-email-otp', $payload)->assertOk();
        $this->postJson('/api/v1/auth/verify-email-otp', $payload)->assertOk();

        $this->assertSame(2500, Wallet::where('user_id', $referrer->id)->value('balance_minor'));
        $this->assertSame(1, WalletTransaction::where('referral_id', $referral->id)->count());
        $this->assertDatabaseHas('referrals', [
            'id' => $referral->id,
            'status' => Referral::STATUS_REWARDED,
        ]);
    }

    public function test_reward_is_snapshotted_at_registration(): void
    {
        $this->setReward(30);
        $referrer = $this->patient('snapshot@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $registration = $this->registerPatient('snapshot-invited@example.test', $code)->assertCreated();

        $this->setReward(90);

        $this->postJson('/api/v1/auth/verify-email-otp', [
            'email' => 'snapshot-invited@example.test',
            'code' => $registration->json('dev_otp'),
        ])->assertOk();

        $this->assertSame(3000, Wallet::where('user_id', $referrer->id)->value('balance_minor'));
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
            'specialty_id' => Specialty::firstOrFail()->id,
            'referral_code' => $code,
        ])->assertCreated();

        $provider = User::where('email', 'provider@example.test')->firstOrFail();
        $this->assertDatabaseMissing('referrals', ['referred_user_id' => $provider->id]);
    }

    public function test_disabled_program_rejects_referral_and_zero_reward_is_not_credited(): void
    {
        $referrer = $this->patient('disabled@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);

        PlatformSetting::updateOrCreate(['key' => 'feature.affiliate_program'], [
            'value' => false,
            'group' => 'features',
            'type' => 'boolean',
        ]);

        $this->registerPatient('disabled-invited@example.test', $code)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('referral_code');

        PlatformSetting::where('key', 'feature.affiliate_program')->update(['value' => true]);
        $this->setReward(0);

        $registration = $this->registerPatient('zero@example.test', $code)->assertCreated();
        $this->postJson('/api/v1/auth/verify-email-otp', [
            'email' => 'zero@example.test',
            'code' => $registration->json('dev_otp'),
        ])->assertOk();

        $this->assertDatabaseHas('referrals', [
            'referred_user_id' => User::where('email', 'zero@example.test')->value('id'),
            'status' => Referral::STATUS_INELIGIBLE,
        ]);
        $this->assertDatabaseMissing('wallet_transactions', ['type' => 'patient_referral_bonus']);
    }

    public function test_patient_summary_has_stable_link_stats_and_masked_invitee(): void
    {
        $this->setReward(20);
        $referrer = $this->patient('summary@example.test');
        $code = app(ReferralProgram::class)->ensureCode($referrer);
        $this->registerPatient('private-invitee@example.test', $code)->assertCreated();

        Sanctum::actingAs($referrer);

        $first = $this->getJson('/api/v1/patient/referrals')
            ->assertOk()
            ->assertJsonPath('code', $code)
            ->assertJsonPath('stats.invited_count', 1)
            ->assertJsonPath('stats.pending_count', 1);

        $this->assertStringNotContainsString('private-invitee', $first->json('latest_referrals.0.email'));
        $this->getJson('/api/v1/patient/referrals')->assertJsonPath('code', $code);
    }

    public function test_admin_referral_reward_has_server_side_bounds(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);
        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/admin/settings', [
            'settings' => [[
                'key' => ReferralProgram::REWARD_SETTING,
                'value' => 10001,
                'type' => 'number',
            ]],
        ])->assertUnprocessable();

        $this->putJson('/api/v1/admin/settings', [
            'settings' => [[
                'key' => ReferralProgram::REWARD_SETTING,
                'value' => 35,
                'type' => 'number',
            ]],
        ])->assertOk();

        $this->assertSame(35, PlatformSetting::where('key', ReferralProgram::REWARD_SETTING)->value('value'));
    }

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

    private function setReward(float $amount): void
    {
        PlatformSetting::updateOrCreate(['key' => ReferralProgram::REWARD_SETTING], [
            'value' => $amount,
            'group' => 'affiliate',
            'type' => 'number',
        ]);
    }
}
