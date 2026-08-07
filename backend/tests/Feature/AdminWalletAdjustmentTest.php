<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\AppEventNotification;
use App\Services\WalletAdjustment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Adăugarea manuală de fonduri din panoul de admin.
 */
class AdminWalletAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_adds_money_and_the_user_is_told(): void
    {
        Notification::fake();
        $user = $this->userWithRole('patient');
        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 150.50,
            'direction' => 'credit',
            'reason' => 'compensare consultație anulată',
        ])->assertOk()->assertJsonPath('data.balance', 150.5);

        $this->assertSame(15050, (int) Wallet::where('user_id', $user->id)->value('balance_minor'));

        $transaction = WalletTransaction::where('user_id', $user->id)->firstOrFail();
        $this->assertSame(WalletAdjustment::TYPE_CREDIT, $transaction->type);
        // Cine a făcut mișcarea și de ce rămân pe tranzacție.
        $this->assertSame('compensare consultație anulată', $transaction->metadata['reason']);
        $this->assertNotNull($transaction->metadata['admin_id']);

        Notification::assertSentTo($user, AppEventNotification::class);
    }

    public function test_a_second_adjustment_adds_to_the_balance(): void
    {
        Notification::fake();
        $user = $this->userWithRole('patient');
        $this->actingAsAdmin();

        foreach ([100, 50] as $amount) {
            $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
                'amount' => $amount,
                'direction' => 'credit',
                'reason' => 'alimentare manuală',
            ])->assertOk();
        }

        $this->assertSame(15000, (int) Wallet::where('user_id', $user->id)->value('balance_minor'));
        $this->assertSame(2, WalletTransaction::where('user_id', $user->id)->count());
    }

    public function test_a_debit_cannot_push_the_balance_below_zero(): void
    {
        Notification::fake();
        $user = $this->userWithRole('patient');
        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 100,
            'direction' => 'credit',
            'reason' => 'alimentare',
        ])->assertOk();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 250,
            'direction' => 'debit',
            'reason' => 'corecție',
        ])->assertStatus(422)->assertJsonValidationErrors('amount');

        // Soldul rămâne neatins, iar corecția eșuată nu lasă tranzacție.
        $this->assertSame(10000, (int) Wallet::where('user_id', $user->id)->value('balance_minor'));
        $this->assertSame(1, WalletTransaction::where('user_id', $user->id)->count());
    }

    public function test_a_debit_within_the_balance_goes_through(): void
    {
        Notification::fake();
        $user = $this->userWithRole('patient');
        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 100, 'direction' => 'credit', 'reason' => 'alimentare',
        ])->assertOk();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 40, 'direction' => 'debit', 'reason' => 'stornare parțială',
        ])->assertOk()->assertJsonPath('data.balance', 60);

        $this->assertSame(
            WalletAdjustment::TYPE_DEBIT,
            WalletTransaction::where('user_id', $user->id)->latest('id')->value('type'),
        );
    }

    public function test_the_reason_is_required(): void
    {
        $user = $this->userWithRole('patient');
        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 10, 'direction' => 'credit', 'reason' => '',
        ])->assertStatus(422)->assertJsonValidationErrors('reason');

        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_a_non_admin_cannot_move_money(): void
    {
        $user = $this->userWithRole('patient');
        Sanctum::actingAs($this->userWithRole('doctor'));

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 500, 'direction' => 'credit', 'reason' => 'îmi pun singur bani',
        ])->assertForbidden();

        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_admin_sees_the_balance_and_the_last_moves(): void
    {
        Notification::fake();
        $user = $this->userWithRole('patient');
        $this->actingAsAdmin();

        $this->postJson("/api/v1/admin/users/{$user->id}/wallet", [
            'amount' => 75, 'direction' => 'credit', 'reason' => 'bonus manual',
        ])->assertOk();

        $this->getJson("/api/v1/admin/users/{$user->id}/wallet")
            ->assertOk()
            ->assertJsonPath('data.balance', 75)
            ->assertJsonPath('data.transactions.0.amount', 75)
            ->assertJsonPath('data.user.email', $user->email);
    }

    private function actingAsAdmin(): User
    {
        $admin = $this->userWithRole('admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
