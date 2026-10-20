<?php

namespace Tests\Feature\Auth;

use App\Mail\EmailOtpMail;
use App\Models\EmailVerificationOtp;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ApiOtpMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_email_renders_readable_code_expiry_security_and_plain_text_alternative_without_scripts(): void
    {
        $mail = new EmailOtpMail('Ana <script>alert(1)</script>', '123456', 7, 'verify', 'https://telemedconsult.md/confirm-code#email=ana%40example.test&code=123456&purpose=verify');
        $mail->assertHasSubject('Confirmă adresa de email · telemedconsult.md');
        $mail->assertSeeInHtml('123456');
        $mail->assertSeeInHtml('7 minute');
        $mail->assertSeeInHtml('Introdu codul automat');
        $mail->assertSeeInHtml('Ana &lt;script&gt;alert(1)&lt;/script&gt;', false);
        $mail->assertDontSeeInHtml('<script', false);
        $mail->assertDontSeeInHtml('navigator.clipboard', false);
        $mail->assertDontSeeInHtml('onclick=', false);
        $mail->assertSeeInText('Codul tău: 123456');
        $mail->assertSeeInText('Codul expiră în 7 minute');
        $mail->assertSeeInText('Nu le comunica altor persoane');
        $mail->assertSeeInText('https://telemedconsult.md/confirm-code#email=ana%40example.test&code=123456&purpose=verify');
    }

    public function test_login_email_uses_explicit_login_copy_and_singular_minute(): void
    {
        $mail = new EmailOtpMail('Ana', '654321', 1, 'login');
        $mail->assertHasSubject('Codul tău de autentificare · telemedconsult.md');
        $mail->assertSeeInHtml('Codul tău de autentificare');
        $mail->assertSeeInText('Codul expiră în 1 minut');
        $mail->assertSeeInText('Dacă nu ai solicitat autentificarea');
        $mail->assertDontSeeInHtml('Introdu codul automat');
    }

    public function test_registration_sends_verification_email_with_configured_expiry_and_prefill_fragment(): void
    {
        $this->freezeTime();
        Role::firstOrCreate(['name' => 'patient'], ['label' => 'Pacient']);
        Mail::fake();
        config(['otp.expires_minutes' => 7, 'otp.demo_code_enabled' => true, 'services.frontend_url' => 'https://portal.example.test/']);
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Ana Test', 'email' => 'ana+new@example.test', 'password' => 'Password123!', 'password_confirmation' => 'Password123!',
        ])->assertCreated();
        $code = $response->json('dev_otp');
        $otp = EmailVerificationOtp::firstOrFail();
        $this->assertSame(now()->addMinutes(7)->getTimestamp(), $otp->expires_at->getTimestamp());
        $this->assertTrue(Hash::check($code, $otp->code_hash));
        Mail::assertSent(EmailOtpMail::class, function (EmailOtpMail $mail) use ($code): bool {
            $this->assertSame('verify', $mail->purpose);
            $this->assertSame(7, $mail->expiresMinutes);
            $this->assertSame($code, $mail->code);
            $this->assertSame('https://portal.example.test/confirm-code', strtok($mail->actionUrl, '#'));
            $this->assertNull(parse_url($mail->actionUrl, PHP_URL_QUERY));
            parse_str(parse_url($mail->actionUrl, PHP_URL_FRAGMENT), $values);
            $this->assertSame(['email' => 'ana+new@example.test', 'code' => $code, 'purpose' => 'verify'], $values);

            return $mail->hasTo('ana+new@example.test');
        });
        Mail::assertSentCount(1);
    }

    public function test_verified_account_login_sends_login_email_without_changing_otp_confirmation(): void
    {
        $user = $this->patient(verified: true);
        Mail::fake();
        config(['otp.demo_code_enabled' => true, 'otp.expires_minutes' => 4]);
        $response = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!'])->assertAccepted()->assertJsonPath('login_otp_required', true);
        $code = $response->json('dev_otp');
        Mail::assertSent(EmailOtpMail::class, fn (EmailOtpMail $mail) => $mail->purpose === 'login' && $mail->expiresMinutes === 4 && $mail->code === $code && str_ends_with($mail->actionUrl, 'purpose=login'));
        $this->postJson('/api/v1/auth/verify-login-otp', ['email' => $user->email, 'code' => $code])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_unverified_account_login_and_resend_send_verification_emails_and_recent_code_is_not_resent(): void
    {
        $this->freezeTime();
        $user = $this->patient(verified: false);
        Mail::fake();
        config(['otp.demo_code_enabled' => true]);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!'])->assertAccepted()->assertJsonPath('email_verification_required', true);
        Mail::assertSent(EmailOtpMail::class, fn (EmailOtpMail $mail) => $mail->purpose === 'verify');
        $this->postJson('/api/v1/auth/resend-email-otp', ['email' => $user->email])->assertOk();
        Mail::assertSentCount(1);
        $this->travel(61)->seconds();
        $this->postJson('/api/v1/auth/resend-email-otp', ['email' => $user->email])->assertOk();
        Mail::assertSentCount(2);
    }

    private function patient(bool $verified): User
    {
        $role = Role::firstOrCreate(['name' => 'patient'], ['label' => 'Pacient']);
        $user = User::factory()->create(['active_role_id' => $role->id, 'password' => 'Password123!', 'email_verified_at' => $verified ? now() : null]);
        $user->roles()->attach($role);

        return $user;
    }
}
