<?php

namespace Tests\Feature\Auth;

use App\Models\EmailVerificationOtp;
use App\Models\Role;
use App\Models\TrustedDevice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

/**
 * Autentificarea: limite contra ghicirii codului și „Ține-mă minte 30 de zile”
 * pentru pacienți (fără cod pe un dispozitiv de încredere).
 */
class LoginProtectionAndTrustedDeviceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['otp.demo_code_enabled' => true]);
    }

    public function test_login_and_code_verification_are_throttled(): void
    {
        $user = $this->user('patient');

        foreach (range(1, 10) as $attempt) {
            $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])->assertUnprocessable();
        }
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])->assertTooManyRequests();
    }

    public function test_five_wrong_codes_invalidate_the_login_code(): void
    {
        $user = $this->user('patient');
        $code = $this->loginCode($user);
        $wrong = $code === '000000' ? '111111' : '000000';

        foreach (range(1, 5) as $attempt) {
            $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $wrong])->assertJsonValidationErrors('code');
        }

        $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $code])
            ->assertUnprocessable()
            ->assertJsonPath('errors.code.0', 'Prea multe coduri greșite. Autentifică-te din nou ca să primești un cod nou.');
        $this->assertSame(0, EmailVerificationOtp::where('user_id', $user->id)->whereNull('verified_at')->count());

        // Un login nou trimite un cod nou și resetează încercările.
        $fresh = $this->loginCode($user);
        $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $fresh])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_patient_can_remember_a_device_and_skip_the_code_for_30_days(): void
    {
        $user = $this->user('patient');

        $deviceToken = $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $this->loginCode($user), 'remember_device' => true])
            ->assertOk()
            ->json('device_token');
        $this->assertIsString($deviceToken);
        $this->assertDatabaseMissing('trusted_devices', ['token_hash' => $deviceToken]);

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!', 'device_token' => $deviceToken])
            ->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonMissingPath('login_otp_required');

        $this->travel(31)->days();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!', 'device_token' => $deviceToken])
            ->assertStatus(202)
            ->assertJsonPath('login_otp_required', true);
    }

    public function test_device_token_does_not_skip_the_password_or_work_for_another_account(): void
    {
        $owner = $this->user('patient');
        $other = $this->user('patient');
        $deviceToken = $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $owner->email, 'code' => $this->loginCode($owner), 'remember_device' => true])->json('device_token');

        $this->postJson('/api/v1/auth/login', ['email' => $owner->email, 'password' => 'wrong-password', 'device_token' => $deviceToken])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['email' => $other->email, 'password' => 'Password123!', 'device_token' => $deviceToken])
            ->assertStatus(202)
            ->assertJsonPath('login_otp_required', true);
    }

    public function test_doctors_and_multi_role_accounts_are_never_remembered(): void
    {
        foreach ([['doctor'], ['patient', 'doctor']] as $roles) {
            $user = $this->user(...$roles);
            $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $this->loginCode($user), 'remember_device' => true])
                ->assertOk()
                ->assertJsonMissingPath('device_token');
        }

        $this->assertSame(0, TrustedDevice::count());
    }

    public function test_password_reset_forgets_all_trusted_devices(): void
    {
        $user = $this->user('patient');
        $deviceToken = $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $this->loginCode($user), 'remember_device' => true])->json('device_token');

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => Password::createToken($user), 'email' => $user->email,
            'password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!',
        ])->assertOk();

        $this->assertSame(0, TrustedDevice::where('user_id', $user->id)->count());
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'NewPassword123!', 'device_token' => $deviceToken])
            ->assertStatus(202)
            ->assertJsonPath('login_otp_required', true);
    }

    private function loginCode(User $user): string
    {
        // Codurile se pot cere la cel mult un minut distanță; testul trece peste această pauză.
        EmailVerificationOtp::where('user_id', $user->id)->update(['created_at' => now()->subMinutes(2)]);
        $response = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!'])
            ->assertStatus(202)
            ->assertJsonPath('login_otp_required', true);

        return (string) $response->json('dev_otp');
    }

    private function user(string ...$roles): User
    {
        $user = User::factory()->create(['password' => Hash::make('Password123!'), 'email_verified_at' => now(), 'status' => 'active']);
        $roleIds = collect($roles)->map(fn (string $name) => Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)])->id);
        $user->roles()->sync($roleIds);
        $user->forceFill(['active_role_id' => $roleIds->first()])->save();

        return $user;
    }
}
