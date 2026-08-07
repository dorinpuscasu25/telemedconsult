<?php

namespace Tests\Feature;

use App\Models\EmailVerificationOtp;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\PlatformConfig;
use App\Services\RegistrationBonus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Bonusul de bun-venit: suma o stabilește adminul, creditarea are loc o singură
 * dată, la confirmarea emailului.
 */
class RegistrationBonusTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'patient', 'doctor'] as $role) {
            Role::firstOrCreate(['name' => $role], ['label' => ucfirst($role)]);
        }
    }

    public function test_a_new_user_gets_the_configured_bonus_when_confirming_the_email(): void
    {
        $this->enableBonus(150);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Ion Popescu',
            'email' => 'ion@example.com',
            'password' => 'parola-buna-123',
            'password_confirmation' => 'parola-buna-123',
            'account_type' => 'patient',
        ])->assertStatus(201);

        $user = User::where('email', 'ion@example.com')->firstOrFail();

        // Înainte de confirmare nu se dă nimic: adresa poate fi inventată.
        $this->assertSame(0, WalletTransaction::where('user_id', $user->id)->count());

        $this->verifyEmail($user)
            ->assertOk()
            ->assertJsonPath('registration_bonus', 150);

        $this->assertSame(15000, (int) Wallet::where('user_id', $user->id)->value('balance_minor'));

        $transaction = WalletTransaction::where('user_id', $user->id)->firstOrFail();
        $this->assertSame(RegistrationBonus::TRANSACTION_TYPE, $transaction->type);
        $this->assertSame(15000, $transaction->amount_minor);
    }

    public function test_the_bonus_is_granted_only_once(): void
    {
        $this->enableBonus(100);
        $user = $this->registeredPatient();

        $this->verifyEmail($user)->assertOk();
        // A doua verificare (link deschis de două ori) nu mai plătește.
        $this->verifyEmail($user)->assertOk();

        $this->assertSame(1, WalletTransaction::where('user_id', $user->id)->count());
        $this->assertSame(10000, (int) Wallet::where('user_id', $user->id)->value('balance_minor'));
    }

    public function test_nothing_is_credited_while_the_bonus_is_off_or_zero(): void
    {
        $this->enableBonus(0);
        $user = $this->registeredPatient();

        $this->verifyEmail($user)->assertOk()->assertJsonMissingPath('registration_bonus');
        $this->assertSame(0, WalletTransaction::where('user_id', $user->id)->count());

        // Sumă pusă, dar modulul oprit.
        app(PlatformConfig::class)->upsert(RegistrationBonus::AMOUNT_SETTING, 200);
        app(PlatformConfig::class)->upsert(RegistrationBonus::ENABLED_SETTING, false);

        $other = $this->registeredPatient('a-doua@example.com');
        $this->verifyEmail($other)->assertOk();

        $this->assertSame(0, WalletTransaction::where('user_id', $other->id)->count());
    }

    public function test_providers_do_not_receive_the_bonus(): void
    {
        $this->enableBonus(150);
        Specialty::firstOrCreate(['name' => 'Cardiologie'], ['slug' => 'cardiologie']);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Dr. Maria Ion',
            'email' => 'medic@example.com',
            'phone' => '069484967',
            'password' => 'parola-buna-123',
            'password_confirmation' => 'parola-buna-123',
            'account_type' => 'doctor',
            'specialty_id' => Specialty::first()->id,
            'license_number' => 'LIC-99',
        ])->assertStatus(201);

        $doctor = User::where('email', 'medic@example.com')->firstOrFail();
        $this->verifyEmail($doctor)->assertOk();

        $this->assertSame(0, WalletTransaction::where('user_id', $doctor->id)->count());
    }

    public function test_admin_sets_the_amount_and_it_is_bounded(): void
    {
        $admin = User::factory()->create(['active_role_id' => Role::where('name', 'admin')->value('id')]);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);
        Sanctum::actingAs($admin);

        $this->putJson('/api/v1/admin/settings', [
            'settings' => [
                ['key' => RegistrationBonus::ENABLED_SETTING, 'value' => true, 'type' => 'boolean'],
                ['key' => RegistrationBonus::AMOUNT_SETTING, 'value' => 75, 'type' => 'number'],
            ],
        ])->assertOk();

        $this->assertSame(75.0, app(RegistrationBonus::class)->amount());
        $this->assertTrue(app(RegistrationBonus::class)->enabled());

        // O sumă absurdă e respinsă: se plătește din banii platformei.
        $this->putJson('/api/v1/admin/settings', [
            'settings' => [['key' => RegistrationBonus::AMOUNT_SETTING, 'value' => 99999, 'type' => 'number']],
        ])->assertStatus(422);
    }

    private function enableBonus(float $amount): void
    {
        $config = app(PlatformConfig::class);
        $config->upsert(RegistrationBonus::ENABLED_SETTING, true);
        $config->upsert(RegistrationBonus::AMOUNT_SETTING, $amount);
    }

    private function registeredPatient(string $email = 'pacient@example.com'): User
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Utilizator Test',
            'email' => $email,
            'password' => 'parola-buna-123',
            'password_confirmation' => 'parola-buna-123',
            'account_type' => 'patient',
        ])->assertStatus(201);

        return User::where('email', $email)->firstOrFail();
    }

    private function verifyEmail(User $user)
    {
        // Codul e stocat hash-uit, deci punem unul cunoscut peste cel trimis.
        $otp = EmailVerificationOtp::where('user_id', $user->id)->latest()->first();

        if ($otp) {
            $otp->forceFill(['code_hash' => Hash::make('123456'), 'verified_at' => null])->save();
        }

        return $this->postJson('/api/v1/auth/verify-email-otp', [
            'email' => $user->email,
            'code' => '123456',
        ]);
    }
}
