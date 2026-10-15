<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ApiPasswordRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_link_uses_frontend_and_valid_token_changes_password_and_revokes_tokens(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $user->createToken('old-session');
        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use ($user) {
            $this->assertStringContainsString('/reset-password?', $notification->toMail($user)->actionUrl);
            $this->postJson('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => $notification->token, 'password' => 'new-password-123', 'password_confirmation' => 'new-password-123'])->assertOk();

            return true;
        });
        $this->assertTrue(Hash::check('new-password-123', $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_unknown_email_returns_same_message_and_bad_token_is_rejected(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $known = $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk()->json('message');
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'unknown@example.test'])->assertOk()->assertJsonPath('message', $known);
        $this->postJson('/api/v1/auth/reset-password', ['email' => $user->email, 'token' => 'invalid', 'password' => 'new-password-123', 'password_confirmation' => 'new-password-123'])->assertUnprocessable();
    }
}
