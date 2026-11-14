<?php

namespace Tests\Feature;

use App\Mail\AdminWalletConfirmationMail;
use App\Models\AdminWalletConfirmation;
use App\Models\DoctorProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminWalletConfirmationTest extends TestCase
{
    use RefreshDatabase;

    public function test_issuing_code_mails_operation_to_admin_without_touching_wallet_or_exposing_code(): void
    {
        [$admin, $patient] = $this->actors();
        $confirmation = $this->issue($patient);
        $record = AdminWalletConfirmation::findOrFail($confirmation['confirmation_id']);
        $mail = Mail::sent(AdminWalletConfirmationMail::class)->sole();
        $this->assertTrue($mail->hasTo($admin->email));
        $this->assertSame($patient->email, $mail->beneficiaryEmail);
        $this->assertSame(-12550, $mail->payload['amount_minor']);
        $this->assertTrue(Hash::check($mail->code, $record->code_hash));
        $this->assertArrayNotHasKey('code', $confirmation);
        $this->assertArrayNotHasKey('dev_otp', $confirmation);
        $this->assertArrayNotHasKey('code_hash', $record->toArray());
        $this->assertSame(0, Wallet::count());
        $this->assertSame(0, WalletTransaction::count());
        $this->assertStringContainsString('125,50 puncte', $mail->render());
    }

    public function test_missing_or_incorrect_code_cannot_bypass_confirmation_and_attempt_limit_persists(): void
    {
        [, $patient] = $this->actors();
        $this->postJson($this->url($patient), ['amount' => 100, 'direction' => 'credit', 'reason' => 'Compensare'])->assertUnprocessable()->assertJsonValidationErrors('confirmation_id');
        $data = $this->issue($patient);
        $code = Mail::sent(AdminWalletConfirmationMail::class)->sole()->code;
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson($this->url($patient), ['confirmation_id' => $data['confirmation_id'], 'code' => '000000'])->assertUnprocessable()->assertJsonValidationErrors('code');
            $this->assertSame($i, AdminWalletConfirmation::findOrFail($data['confirmation_id'])->attempts);
        }
        $this->postJson($this->url($patient), ['confirmation_id' => $data['confirmation_id'], 'code' => $code])->assertUnprocessable();
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_code_is_bound_to_admin_recipient_operation_and_immutable_payload(): void
    {
        [$admin, $patient, $other] = $this->actors();
        $data = $this->issue($patient, ['direction' => 'credit']);
        $credentials = $this->credentials($data);
        $this->postJson($this->url($other), $credentials)->assertUnprocessable();
        $this->postJson($this->url($patient).'/promotion', $credentials)->assertUnprocessable();
        Sanctum::actingAs($other);
        $this->postJson($this->url($patient), $credentials)->assertUnprocessable();
        Sanctum::actingAs($admin);
        $this->postJson($this->url($patient), $credentials + ['amount' => 100000, 'reason' => 'Alt motiv', 'direction' => 'debit'])->assertUnprocessable()->assertJsonValidationErrors(['amount', 'reason', 'direction']);
        $this->postJson($this->url($patient), $credentials)->assertOk()->assertJsonPath('data.points_balance', 125.5);
        $this->postJson($this->url($patient), $credentials)->assertUnprocessable();
        $this->assertSame(1, WalletTransaction::count());
        $this->assertSame($data['confirmation_id'], WalletTransaction::sole()->metadata['confirmation_id']);
    }

    public function test_expired_or_replaced_code_is_rejected_at_exact_expiry(): void
    {
        [, $patient] = $this->actors();
        $first = $this->issue($patient, ['direction' => 'credit']);
        $credentials = $this->credentials($first);
        $this->postJson($this->url($patient).'/confirmation', $this->payload())->assertStatus(429);
        $this->travel(61)->seconds();
        $second = $this->issue($patient, ['direction' => 'credit', 'amount' => 300]);
        $this->postJson($this->url($patient), $credentials)->assertUnprocessable();
        $credentials = $this->credentials($second);
        $this->travelTo(AdminWalletConfirmation::findOrFail($second['confirmation_id'])->expires_at);
        $this->postJson($this->url($patient), $credentials)->assertUnprocessable();
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_failed_debit_rolls_back_wallet_and_does_not_consume_confirmation(): void
    {
        [, $patient] = $this->actors();
        $data = $this->issue($patient);
        $credentials = $this->credentials($data);
        $this->postJson($this->url($patient), $credentials)->assertUnprocessable()->assertJsonValidationErrors('amount');
        $this->assertNull(AdminWalletConfirmation::findOrFail($data['confirmation_id'])->consumed_at);
        $this->assertSame(0, Wallet::count());
        $this->assertSame(0, WalletTransaction::count());
        Wallet::create(['user_id' => $patient->id, 'type' => 'points', 'balance_minor' => 20000, 'currency' => 'MDL']);
        $this->postJson($this->url($patient), $credentials)->assertOk()->assertJsonPath('data.points_balance', 74.5);
    }

    public function test_promotion_requires_code_and_cannot_be_granted_twice(): void
    {
        [, $patient] = $this->actors();
        $this->postJson($this->url($patient).'/promotion')->assertUnprocessable();
        $data = $this->postJson($this->url($patient).'/confirmation', ['operation' => 'promotion'])->assertCreated()->json();
        $credentials = $this->credentials($data);
        $this->postJson($this->url($patient).'/promotion', $credentials)->assertOk()->assertJsonPath('data.promo_balance', 500);
        $this->postJson($this->url($patient).'/promotion', $credentials)->assertUnprocessable();
        $this->assertSame(1, WalletTransaction::count());
    }

    public function test_email_failure_invalidates_confirmation_without_moving_points(): void
    {
        [, $patient] = $this->actors();
        Mail::shouldReceive('to')->once()->andThrow(new \RuntimeException('Transport unavailable'));
        $this->postJson($this->url($patient).'/confirmation', $this->payload())->assertStatus(503);
        $this->assertFalse(AdminWalletConfirmation::sole()->expires_at->isFuture());
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_changed_promotion_conditions_require_a_new_code(): void
    {
        [, $patient, $doctor] = $this->actors();
        $data = $this->postJson($this->url($patient).'/confirmation', ['operation' => 'promotion'])->assertCreated()->json();
        $credentials = $this->credentials($data);
        $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'doctor']);
        $doctor->roles()->attach($role);
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        app(PlatformConfig::class)->upsert('wallet.first_topup_promo_doctor_ids', [$doctor->id]);
        $this->postJson($this->url($patient).'/promotion', $credentials)->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_provider_cannot_issue_code_and_email_change_invalidates_pending_code(): void
    {
        [$admin, $patient] = $this->actors();
        $data = $this->issue($patient, ['direction' => 'credit']);
        $credentials = $this->credentials($data);
        $admin->update(['email' => 'other-admin@example.test']);
        $this->postJson($this->url($patient), $credentials)->assertUnprocessable();
        Sanctum::actingAs($patient);
        $this->postJson($this->url($patient).'/confirmation', $this->payload())->assertForbidden();
        $this->assertSame(0, WalletTransaction::count());
    }

    private function actors(): array
    {
        $this->travelTo(now()->startOfSecond());
        $users = [];
        foreach (['admin', 'patient', 'admin'] as $name) {
            $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
            $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
            $user->roles()->sync([$role->id]);
            $users[] = $user;
        }
        Mail::fake();
        Notification::fake();
        Sanctum::actingAs($users[0]);

        return $users;
    }

    private function payload(): array
    {
        return ['operation' => 'adjustment', 'amount' => 125.5, 'direction' => 'debit', 'reason' => 'Corecție demonstrativă'];
    }

    private function issue(User $user, array $overrides = []): array
    {
        return $this->postJson($this->url($user).'/confirmation', array_replace($this->payload(), $overrides))->assertCreated()->json();
    }

    private function credentials(array $response): array
    {
        return ['confirmation_id' => $response['confirmation_id'], 'code' => Mail::sent(AdminWalletConfirmationMail::class)->last()->code];
    }

    private function url(User $user): string
    {
        return "/api/v1/admin/users/{$user->id}/wallet";
    }
}
