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

    public function test_only_admin_can_change_operator_contract_and_other_operators_are_unchanged(): void
    {
        $operator = $this->withRole('operator');
        OperatorProfile::create(['user_id' => $operator->id, 'is_approved' => true]);
        $other = $this->withRole('operator');
        OperatorProfile::create(['user_id' => $other->id, 'contract_type' => 'employment']);
        $payload = ['person_type' => 'individual', 'contract_type' => 'freelance', 'contract_number' => 'OP-12'];
        Sanctum::actingAs($operator);
        $this->putJson('/api/v1/admin/operators/'.$operator->id.'/contract', $payload)->assertForbidden();
        Sanctum::actingAs($this->withRole('admin'));
        $this->putJson('/api/v1/admin/operators/'.$operator->id.'/contract', $payload)->assertOk()
            ->assertJsonPath('data.profile.person_type', 'individual')->assertJsonPath('data.profile.contract_type', 'freelance')->assertJsonPath('data.profile.contract_number', 'OP-12');
        $this->assertSame('employment', $other->operatorProfile->fresh()->contract_type);
        Sanctum::actingAs($operator->fresh());
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('user.profiles.operator.contract_type', 'freelance');
    }

    public function test_contract_validation_preserves_existing_data_on_invalid_input(): void
    {
        $operator = $this->withRole('operator');
        OperatorProfile::create(['user_id' => $operator->id, 'contract_type' => 'services', 'contract_number' => 'OP-1']);
        Sanctum::actingAs($this->withRole('admin'));
        $this->putJson('/api/v1/admin/operators/'.$operator->id.'/contract', ['person_type' => 'unknown', 'contract_type' => 'unknown', 'contract_number' => 'OP-2'])->assertUnprocessable()->assertJsonValidationErrors(['person_type', 'contract_type']);
        $this->assertSame('OP-1', $operator->operatorProfile->fresh()->contract_number);
        $patient = $this->withRole('patient');
        $this->putJson('/api/v1/admin/operators/'.$patient->id.'/contract', ['person_type' => 'individual', 'contract_type' => 'services', 'contract_number' => null])->assertUnprocessable();
    }

    private function withRole(string $name, array $attributes = []): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', ...$attributes]);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
