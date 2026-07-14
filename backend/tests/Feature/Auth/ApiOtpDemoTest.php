<?php

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ApiOtpDemoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['otp.demo_code_enabled' => true]);
        Mail::fake();

        Role::create(['name' => 'patient', 'label' => 'Pacient']);
    }

    public function test_registration_returns_demo_otp_and_accepts_it_for_verification(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Ion Popescu',
            'email' => 'ion@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('verification_required', true)
            ->assertJsonStructure(['dev_otp']);

        $demoCode = $response->json('dev_otp');

        $this->assertMatchesRegularExpression('/^\d{6}$/', $demoCode);

        $this->postJson('/api/v1/auth/verify-email-otp', [
            'email' => 'ion@example.test',
            'code' => $demoCode,
        ])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);

        $this->assertNotNull(User::where('email', 'ion@example.test')->firstOrFail()->email_verified_at);
    }

    public function test_unverified_login_returns_structured_demo_otp_response(): void
    {
        $user = User::factory()->create([
            'email' => 'ana@example.test',
            'password' => 'password123',
            'email_verified_at' => null,
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response
            ->assertAccepted()
            ->assertJsonPath('email_verification_required', true)
            ->assertJsonStructure(['email', 'dev_otp']);

        $this->assertMatchesRegularExpression('/^\d{6}$/', $response->json('dev_otp'));
    }
}
