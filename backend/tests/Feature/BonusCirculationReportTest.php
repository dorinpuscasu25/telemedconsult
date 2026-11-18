<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorPromotion;
use App\Models\DoctorPromotionImpression;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\WalletLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BonusCirculationReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_role_distribution_counts_each_account_once_and_ignores_the_active_cabinet(): void
    {
        $admin = $this->user(['admin']);
        $patient = $this->user(['patient']);
        $doctor = $this->user(['patient', 'doctor']);
        $operator = $this->user(['patient', 'operator']);
        $both = $this->user(['patient', 'doctor', 'operator']);
        foreach ([[$patient, 'points', 10000], [$patient, 'promo', 5000], [$doctor, 'points', 20000], [$operator, 'points', 30000], [$both, 'points', 40000], [$both, 'promo', 6000], [$admin, 'points', 700], [$admin, 'real', 900000]] as [$user, $type, $balance]) {
            Wallet::create(['user_id' => $user->id, 'type' => $type, 'balance_minor' => $balance, 'currency' => 'MDL']);
        }
        Sanctum::actingAs($admin);
        $response = $this->getJson('/api/v1/admin/financial')->assertOk();
        $data = $response->json('bonus_report');
        $groups = collect($data['circulation_report']['balances_by_role'])->keyBy('key');
        $this->assertEquals(100, $groups['patient']['points']);
        $this->assertEquals(200, $groups['doctor']['points']);
        $this->assertEquals(300, $groups['operator']['points']);
        $this->assertEquals(400, $groups['doctor_operator']['points']);
        $this->assertEquals(60, $groups['doctor_operator']['promo']);
        $this->assertSame(1, $groups['doctor_operator']['accounts']);
        $this->assertSame(5, $groups->sum('accounts'));
        $this->assertEquals($data['in_circulation']['points'], $groups->sum('points'));
        $this->assertEquals($data['in_circulation']['promo'], $groups->sum('promo'));
        $doctor->update(['active_role_id' => Role::where('name', 'doctor')->value('id')]);
        $this->assertEquals($groups->values()->all(), $this->getJson('/api/v1/admin/financial')->assertOk()->json('bonus_report.circulation_report.balances_by_role'));
    }

    public function test_issuance_transfers_refunds_reserves_and_actual_promotion_consumption_reconcile_without_counting_points_twice(): void
    {
        $admin = $this->user(['admin']);
        $patient = $this->user(['patient']);
        $doctor = $this->user(['doctor']);
        $ledger = app(WalletLedger::class);
        $points = $ledger->locked($patient, 'points');
        $promo = $ledger->locked($patient, 'promo');
        $doctorWallet = $ledger->locked($doctor, 'points');
        $ledger->move($points, 20000, 'registration_bonus', 'Emitere inițială');
        $legacyReview = $ledger->move($points, 1000, 'review_bonus', 'Recenzie');
        $legacyReview->update(['wallet_type' => 'real']);
        $ledger->move($promo, 50000, 'first_topup_promotion', 'Promoție');
        $ledger->move($points, 2500, 'legacy_credit', 'Sursă istorică necunoscută');
        $ledger->move($points, -500, 'legacy_debit', 'Ieșire istorică necunoscută');
        $completed = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'payment_status' => 'captured', 'symptoms' => 'Demo', 'amount_minor' => 20000, 'points_amount_minor' => 10000, 'promo_amount_minor' => 10000]);
        $ledger->move($points, -10000, 'points_service_hold', 'Puncte pentru servicii', [], $completed->id);
        $ledger->move($promo, -10000, 'promo_service_hold', 'Promoție pentru servicii', [], $completed->id);
        $ledger->move($doctorWallet, 10000, 'consultation_points_income', 'Transfer pacient → medic', [], $completed->id);
        $ledger->move($points, -2000, 'points_service_hold', 'Rezervare anulată');
        $ledger->move($points, 2000, 'points_service_refund', 'Restituire');
        $held = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'new', 'payment_status' => 'held', 'symptoms' => 'Demo', 'amount_minor' => 8000, 'points_amount_minor' => 3000, 'promo_amount_minor' => 5000]);
        $ledger->move($points, -3000, 'points_service_hold', 'Încă rezervat', [], $held->id);
        $ledger->move($promo, -5000, 'promo_service_hold', 'Promoție încă rezervată', [], $held->id);
        $campaign = DoctorPromotion::create(['doctor_id' => $doctor->id, 'budget_minor' => 5000, 'remaining_minor' => 4500, 'status' => 'active', 'ends_at' => now()->addDay()]);
        $ledger->move($doctorWallet, -5000, 'promotion_budget_hold', 'Buget promovare');
        foreach (range(1, 5) as $position) {
            DoctorPromotionImpression::create(['doctor_promotion_id' => $campaign->id, 'doctor_id' => $doctor->id, 'viewer_id' => $patient->id, 'position' => $position, 'cost_minor' => 100]);
        }
        $ledger->move($doctorWallet, -2000, 'promotion_budget_hold', 'A doua campanie');
        $ledger->move($doctorWallet, 2000, 'promotion_budget_refund', 'Buget neconsumat restituit');
        WalletTransaction::create(['wallet_id' => $points->id, 'wallet_type' => 'points', 'user_id' => $patient->id, 'type' => 'review_bonus', 'amount_minor' => 9000, 'currency' => 'MDL', 'status' => 'pending', 'description' => 'Neconfirmat']);
        $real = $ledger->locked($patient, 'real');
        $ledger->move($real, 20000, 'referral_topup_commission', 'Referal în lei');
        Sanctum::actingAs($admin);
        $data = $this->getJson('/api/v1/admin/financial')->assertOk()->json('bonus_report');
        $report = $data['circulation_report'];
        $this->assertEquals(710, $data['issued_total']);
        $transactions = $this->getJson('/api/v1/admin/financial')->assertOk()->json('transactions');
        $this->assertSame('points', collect($transactions)->firstWhere('id', $legacyReview->id)['wallet_type']);
        $this->assertEquals(100, $report['transferred_to_doctors']);
        $this->assertEquals(100, $report['used_for_services_points']);
        $this->assertEquals(100, $report['used_for_services_promo']);
        $this->assertEquals(5, $report['promotion_spent']);
        $this->assertEquals(45, $report['promotion_reserved_current']);
        $this->assertEquals(30, $report['held_services_points_current']);
        $this->assertEquals(50, $report['held_services_promo_current']);
        $this->assertEquals(20, collect($report['refunds'])->firstWhere('type', 'points_service_refund')['amount']);
        $this->assertEquals(20, collect($report['refunds'])->firstWhere('type', 'promotion_budget_refund')['amount']);
        $unknown = collect($report['unclassified_movements']);
        $this->assertCount(2, $unknown);
        $this->assertEquals(25, $unknown->sum('credits'));
        $this->assertEquals(5, $unknown->sum('debits'));
        $this->assertEquals($data['issued_total'] + $unknown->sum('credits') - $unknown->sum('debits'), $data['in_circulation']['points'] + $data['in_circulation']['promo'] + $report['promotion_reserved_current'] + $report['held_services_points_current'] + $report['held_services_promo_current'] + $report['promotion_spent'] + $report['used_for_services_promo']);
        $future = $this->getJson('/api/v1/admin/financial?from=2099-01-01&to=2099-01-02')->assertOk()->json('bonus_report');
        $this->assertEquals(0, $future['issued_total']);
        $this->assertEquals(0, $future['circulation_report']['promotion_spent']);
        $this->assertEquals(45, $future['circulation_report']['promotion_reserved_current']);
        $this->assertEquals($data['in_circulation'], $future['in_circulation']);
    }

    private function user(array $roles): User
    {
        $ids = collect($roles)->map(fn (string $name) => Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)])->id);
        $user = User::factory()->create(['status' => 'active', 'active_role_id' => $ids->first()]);
        $user->roles()->sync($ids);

        return $user;
    }
}
