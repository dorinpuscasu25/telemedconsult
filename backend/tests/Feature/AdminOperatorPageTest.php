<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\OperatorProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminOperatorPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_sees_the_operator_account_visits_and_earnings(): void
    {
        $operator = $this->withRole('operator', ['phone' => '069000111']);
        OperatorProfile::create(['user_id' => $operator->id, 'region' => 'Anenii Noi', 'locality' => 'Anenii Noi', 'is_approved' => true]);
        $patient = $this->withRole('patient');
        ConsultationRequest::create(['patient_id' => $patient->id, 'operator_id' => $operator->id, 'type' => 'operator', 'consultation_kind' => 'with_exam', 'status' => 'completed', 'objective_data_completed_at' => now()]);
        ConsultationRequest::create(['patient_id' => $patient->id, 'operator_id' => $operator->id, 'type' => 'operator', 'consultation_kind' => 'with_exam', 'status' => 'accepted']);
        $wallet = Wallet::create(['user_id' => $operator->id, 'type' => 'real', 'balance_minor' => 15000, 'currency' => 'MDL']);
        WalletTransaction::create(['wallet_id' => $wallet->id, 'user_id' => $operator->id, 'wallet_type' => 'real', 'amount_minor' => 15000, 'currency' => 'MDL', 'type' => 'operator_exam_income', 'status' => 'completed', 'description' => 'Venit']);

        $this->getJson("/api/v1/admin/operators/{$operator->id}")->assertUnauthorized();
        Sanctum::actingAs($patient);
        $this->getJson("/api/v1/admin/operators/{$operator->id}")->assertForbidden();

        Sanctum::actingAs($this->withRole('admin'));
        $this->getJson("/api/v1/admin/operators/{$operator->id}")->assertOk()
            ->assertJsonPath('data.phone', '069000111')
            ->assertJsonPath('data.profile.region', 'Anenii Noi')
            ->assertJsonPath('data.visits.total', 2)
            ->assertJsonPath('data.visits.in_progress', 1)
            ->assertJsonPath('data.visits.exams_done', 1)
            ->assertJsonPath('data.earnings.visits_total', 150);
    }

    private function withRole(string $name, array $attributes = []): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', ...$attributes]);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
