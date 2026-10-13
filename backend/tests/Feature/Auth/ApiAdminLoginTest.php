<?php

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ApiAdminLoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        app(PlatformConfig::class)->upsert('auth.email_2fa_enabled', true, 'auth', 'boolean');
    }

    #[DataProvider('verificationStates')]
    public function test_admin_logs_in_without_any_confirmation_code(bool $verified): void
    {
        $user = $this->userWithRole('admin', ['email_verified_at' => $verified ? now() : null]);
        $patientRole = Role::create(['name' => 'patient', 'label' => 'Pacient']);
        $user->roles()->attach($patientRole);
        $user->forceFill(['active_role_id' => $patientRole->id])->save();

        $response = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertOk()->assertJsonStructure(['token', 'user'])
            ->assertJsonMissingPath('email_verification_required')->assertJsonMissingPath('login_otp_required');

        $this->withToken($response->json('token'))->getJson('/api/v1/auth/me')
            ->assertOk()->assertJsonPath('user.id', (string) $user->id);
        $this->assertNotNull($user->fresh()->last_seen_at);
        if (! $verified) {
            $this->assertNull($user->fresh()->email_verified_at);
        }
        $this->assertDatabaseCount('email_verification_otps', 0);
        Mail::assertNothingOutgoing();
    }

    public static function verificationStates(): array
    {
        return ['verified' => [true], 'unverified' => [false]];
    }

    #[DataProvider('blockedStatuses')]
    public function test_blocked_admin_cannot_login(string $status): void
    {
        $user = $this->userWithRole('admin', ['status' => $status]);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertUnprocessable()->assertJsonValidationErrors('email')->assertJsonMissingPath('token');
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('email_verification_otps', 0);
    }

    public static function blockedStatuses(): array
    {
        return ['suspended' => ['suspended'], 'rejected' => ['rejected']];
    }

    public function test_admin_still_requires_correct_password(): void
    {
        $user = $this->userWithRole('admin');
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertUnprocessable()->assertJsonMissingPath('token');
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('email_verification_otps', 0);
    }

    public function test_email_confirmation_cannot_authenticate_an_already_verified_admin(): void
    {
        $user = $this->userWithRole('admin');
        $this->postJson('/api/v1/auth/verify-email-otp', ['email' => $user->email, 'code' => '123456'])
            ->assertUnprocessable()->assertJsonValidationErrors('email')->assertJsonMissingPath('token');
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    #[DataProvider('otherRoles')]
    public function test_other_roles_still_require_login_code_and_cannot_claim_admin(string $role): void
    {
        $user = $this->userWithRole($role);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'password123', 'role' => 'admin'])
            ->assertAccepted()->assertJsonPath('login_otp_required', true)->assertJsonMissingPath('token');
        $this->assertDatabaseCount('email_verification_otps', 1);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public static function otherRoles(): array
    {
        return ['patient' => ['patient'], 'doctor' => ['doctor'], 'operator' => ['operator']];
    }

    private function userWithRole(string $role, array $attributes = []): User
    {
        $user = User::factory()->create([...['password' => 'password123', 'status' => 'active'], ...$attributes]);
        $user->roles()->attach(Role::create(['name' => $role, 'label' => $role]));

        return $user;
    }
}
