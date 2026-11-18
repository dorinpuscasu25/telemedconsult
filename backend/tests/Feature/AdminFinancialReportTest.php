<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\DoctorService;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\PatientCardPackage;
use App\Models\PatientCardPurchase;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WithdrawalRequest;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminFinancialReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_global_totals_separate_confirmed_payments_card_sales_and_medical_earnings_beyond_the_transaction_preview(): void
    {
        $admin = $this->admin();
        $wallet = Wallet::create(['user_id' => $admin->id, 'type' => 'real', 'balance_minor' => 123400, 'currency' => 'MDL']);
        foreach (range(1, 201) as $index) {
            $item = $this->captured($admin, ['amount_minor' => 1000, 'real_amount_minor' => 1000, 'provider_amount_minor' => 800, 'platform_fee_minor' => 200]);
            WalletTransaction::create(['wallet_id' => $wallet->id, 'user_id' => $admin->id, 'amount_minor' => 800, 'currency' => 'MDL', 'type' => 'consultation_income', 'status' => 'completed', 'description' => 'Venit consultație', 'metadata' => ['platform_fee_minor' => 200], 'consultation_request_id' => $item->id]);
        }
        $this->captured($admin, ['payment_status' => 'held', 'status' => 'new', 'amount_minor' => 50000, 'real_amount_minor' => 50000, 'provider_amount_minor' => 40000, 'platform_fee_minor' => 10000]);
        $this->captured($admin, ['payment_status' => 'refunded', 'status' => 'cancelled', 'amount_minor' => 10000, 'real_amount_minor' => 10000, 'platform_fee_minor' => 1000]);
        foreach (['paid' => 100000, 'pending' => 50000, 'failed' => 90000] as $status => $amount) {
            Payment::create(['user_id' => $admin->id, 'wallet_id' => $wallet->id, 'amount_minor' => $amount, 'currency' => 'MDL', 'purpose' => 'wallet_top_up', 'status' => $status, 'provider' => 'maib']);
        }
        $package = PatientCardPackage::create(['name' => 'Pachet test', 'profile_slots' => 2, 'price_minor' => 35000, 'validity_days' => 365, 'is_active' => true]);
        PatientCardPurchase::create(['user_id' => $admin->id, 'patient_card_package_id' => $package->id, 'profile_slots' => 2, 'amount_minor' => 35000, 'validity_days' => 365, 'expires_at' => now()->addYear()]);
        WithdrawalRequest::create(['user_id' => $admin->id, 'payer' => 'platform', 'iban' => 'MD00TEST0000000000000000', 'amount_minor' => 5000, 'status' => 'pending']);
        WithdrawalRequest::create(['user_id' => $admin->id, 'payer' => 'platform', 'iban' => 'MD00TEST0000000000000000', 'amount_minor' => 10000, 'approved_amount_minor' => 9000, 'status' => 'approved']);
        WithdrawalRequest::create(['user_id' => $admin->id, 'payer' => 'institution', 'iban' => 'MD00TEST0000000000000000', 'amount_minor' => 7000, 'status' => 'pending']);

        $this->getJson('/api/v1/admin/financial')->assertOk()
            ->assertJsonCount(200, 'transactions')->assertJsonPath('transaction_count', 201)
            ->assertJsonPath('summary.wallets_balance', 1234)
            ->assertJsonPath('summary.top_ups', 1000)->assertJsonPath('summary.pending_top_ups', 500)
            ->assertJsonPath('summary.card_revenue', 350)
            ->assertJsonPath('summary.medical_paid_real', 2010)
            ->assertJsonPath('summary.medical_provider_earnings', 1608)
            ->assertJsonPath('summary.platform_fees', 402)->assertJsonPath('summary.medical_retained_real', 402)
            ->assertJsonPath('summary.medical_held_real', 500)
            ->assertJsonPath('summary.pending_withdrawals', 50)->assertJsonPath('summary.paid_withdrawals', 90)
            ->assertJsonPath('by_service.0.count', 201)->assertJsonPath('by_service.0.paid_real', 2010);
        $this->getJson('/api/v1/admin/financial?transactions_page=2')->assertOk()->assertJsonCount(1, 'transactions')
            ->assertJsonPath('transaction_pagination.current_page', 2)->assertJsonPath('transaction_pagination.last_page', 2)
            ->assertJsonPath('transaction_count', 201)->assertJsonPath('summary.platform_fees', 402);
    }

    public function test_service_history_survives_renaming_repricing_and_deleting_the_catalog_entry_without_turning_points_into_cash(): void
    {
        $admin = $this->admin();
        $doctor = User::factory()->create();
        $service = DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Interpretare analize', 'type' => 'video', 'duration' => 30, 'price' => 500, 'is_active' => true]);
        $this->captured($admin, ['amount_minor' => 50000, 'real_amount_minor' => 30000, 'points_amount_minor' => 20000, 'provider_amount_minor' => 24000, 'pricing_snapshot' => ['service' => $service->snapshot()]]);
        $service->update(['name' => 'Interpretare investigații', 'price' => 800]);
        $this->captured($admin, ['amount_minor' => 80000, 'real_amount_minor' => 50000, 'points_amount_minor' => 20000, 'promo_amount_minor' => 10000, 'provider_amount_minor' => 40000, 'pricing_snapshot' => ['service' => $service->snapshot()]]);
        $service->delete();
        $other = DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Interpretare investigații', 'type' => 'video', 'price' => 100, 'is_active' => true]);
        $this->captured($admin, ['amount_minor' => 10000, 'real_amount_minor' => 10000, 'pricing_snapshot' => ['service' => $other->snapshot()]]);
        $data = $this->getJson('/api/v1/admin/financial')->assertOk()->assertJsonCount(2, 'by_service')->json();
        $row = collect($data['by_service'])->firstWhere('service_id', $service->id);
        $this->assertSame(2, $row['count']);
        $this->assertEquals(1300, $row['total']);
        $this->assertEquals(800, $row['paid_real']);
        $this->assertEquals(400, $row['paid_points']);
        $this->assertEquals(100, $row['paid_promo']);
        $this->assertEquals(640, $row['provider_earnings']);
        $this->assertEquals(160, $row['retained_real']);
        $this->assertEquals(0, $row['unclassified_total']);
        $this->assertSame(['Interpretare analize', 'Interpretare investigații'], $row['historical_names']);
    }

    public function test_historical_missing_cash_classification_is_exposed_and_non_admins_cannot_read_the_report(): void
    {
        $admin = $this->admin();
        $this->captured($admin, ['amount_minor' => 50000, 'real_amount_minor' => 0]);
        $this->getJson('/api/v1/admin/financial')->assertOk()->assertJsonPath('by_service.0.unclassified_total', 500)->assertJsonPath('by_service.0.paid_real', 0)->assertJsonPath('summary.has_unclassified_medical', true);
        Sanctum::actingAs(User::factory()->create(['status' => 'active']));
        $this->getJson('/api/v1/admin/financial')->assertForbidden();
    }

    public function test_supplementary_operator_services_and_chat_reactivation_are_counted_once_separately_from_base_consultations(): void
    {
        $admin = $this->admin();
        $wallet = Wallet::create(['user_id' => $admin->id, 'type' => 'real', 'currency' => 'MDL']);
        $points = Wallet::create(['user_id' => $admin->id, 'type' => 'points', 'currency' => 'MDL']);
        $base = ['wallet_id' => $wallet->id, 'user_id' => $admin->id, 'currency' => 'MDL', 'status' => 'completed', 'description' => 'Serviciu demonstrativ'];
        WalletTransaction::create([...$base, 'type' => 'operator_add_on', 'amount_minor' => -20000]);
        WalletTransaction::create([...$base, 'type' => 'operator_add_on_income', 'amount_minor' => 16000, 'metadata' => ['gross_amount_minor' => 20000, 'platform_fee_minor' => 4000]]);
        WalletTransaction::create([...$base, 'type' => 'chat_reactivation', 'amount_minor' => -5000]);
        WalletTransaction::create([...$base, 'type' => 'operator_add_on_income', 'amount_minor' => 7000, 'status' => 'pending', 'metadata' => ['gross_amount_minor' => 9000, 'platform_fee_minor' => 2000]]);
        WalletTransaction::create([...$base, 'wallet_id' => $points->id, 'type' => 'chat_reactivation', 'amount_minor' => -8000]);

        $this->getJson('/api/v1/admin/financial')->assertOk()
            ->assertJsonPath('summary.medical_paid_real', 250)
            ->assertJsonPath('summary.medical_provider_earnings', 160)
            ->assertJsonPath('summary.medical_retained_real', 90)
            ->assertJsonPath('summary.platform_fees', 90)
            ->assertJsonCount(2, 'by_service')
            ->assertJsonPath('by_service.0.count', 1)->assertJsonPath('by_service.0.total', 200)
            ->assertJsonPath('by_service.0.unclassified_total', 0)
            ->assertJsonPath('by_service.1.count', 1)->assertJsonPath('by_service.1.retained_real', 50);
    }

    public function test_institution_and_moldovan_date_filters_reconcile_with_manager_after_doctor_transfer(): void
    {
        config(['app.timezone' => 'UTC']);
        $admin = $this->admin();
        $first = MedicalInstitution::create(['name' => 'Clinica istorică', 'status' => 'active']);
        $second = MedicalInstitution::create(['name' => 'Clinica actuală', 'status' => 'active']);
        $doctor = User::factory()->create();
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $first->id, 'is_approved' => true]);
        $inside = $this->institutionalCapture($admin, $doctor, $first, '2026-11-17T22:15:00Z');
        $this->institutionalCapture($admin, $doctor, $first, '2026-11-17T21:59:59Z');
        $this->institutionalCapture($admin, $doctor, $first, '2026-11-18T22:00:00Z');
        $doctor->doctorProfile->update(['medical_institution_id' => $second->id]);
        $this->institutionalCapture($admin, $doctor, $second, '2026-11-18T08:00:00Z');
        $this->captured($admin, ['doctor_id' => $doctor->id, 'completed_at' => CarbonImmutable::parse('2026-11-18T08:00:00Z'), 'amount_minor' => 70000, 'real_amount_minor' => 70000, 'pricing_snapshot' => ['institution_id' => null]]);
        $managerRole = Role::firstOrCreate(['name' => 'institution'], ['label' => 'Manager']);
        $manager = User::factory()->create(['active_role_id' => $managerRole->id, 'status' => 'active']);
        $manager->roles()->attach($managerRole);
        $first->managers()->attach($manager);

        $query = 'from=2026-11-18&to=2026-11-18';
        $report = $this->getJson('/api/v1/admin/financial?'.$query.'&institution_id='.$first->id)->assertOk()
            ->assertJsonPath('timezone', 'Europe/Chisinau')->assertJsonCount(1, 'by_institution')
            ->assertJsonPath('summary.top_ups', null)->assertJsonPath('summary.card_revenue', null)
            ->assertJsonPath('summary.medical_paid_real', 300)->assertJsonPath('summary.medical_provider_earnings', 240)
            ->assertJsonPath('summary.medical_retained_real', 60)->assertJsonPath('bonus_report.consultations.count', 1)
            ->assertJsonPath('bonus_report.recent.0.id', $inside->id)->json('by_institution.0');
        Sanctum::actingAs($manager);
        $managerSummary = $this->getJson('/api/v1/institution/reports?mode=earnings&'.$query)->assertOk()->json('summary');
        foreach (['gross', 'provider', 'doctor_total', 'institution_total'] as $key) {
            $this->assertEquals($managerSummary[$key], $report[$key]);
        }
        $this->assertSame($managerSummary['settled_consultations'], $report['consultations']);
        $this->assertEquals(60, $report['retained_real']);
        $this->assertEquals(720, $report['balance_current']);
        $this->getJson('/api/v1/admin/financial?'.$query)->assertForbidden();
    }

    public function test_transactions_bonuses_and_supplementary_income_follow_their_own_operation_date_and_historical_institution(): void
    {
        config(['app.timezone' => 'UTC']);
        $admin = $this->admin();
        $institution = MedicalInstitution::create(['name' => 'Clinica A', 'status' => 'active']);
        $other = MedicalInstitution::create(['name' => 'Clinica B', 'status' => 'active']);
        $doctor = User::factory()->create();
        $old = $this->institutionalCapture($admin, $doctor, $institution, '2026-10-01T09:00:00Z');
        $foreign = $this->institutionalCapture($admin, $doctor, $other, '2026-10-01T09:00:00Z');
        $wallet = Wallet::create(['user_id' => $admin->id, 'type' => 'real', 'currency' => 'MDL']);
        $points = Wallet::create(['user_id' => $admin->id, 'type' => 'points', 'currency' => 'MDL']);
        $base = ['wallet_id' => $wallet->id, 'user_id' => $admin->id, 'currency' => 'MDL', 'status' => 'completed', 'description' => 'Serviciu demo', 'consultation_request_id' => $old->id];
        $extra = WalletTransaction::create([...$base, 'type' => 'operator_add_on_income', 'amount_minor' => 16000, 'metadata' => ['gross_amount_minor' => 20000, 'platform_fee_minor' => 4000]]);
        $extra->forceFill(['created_at' => CarbonImmutable::parse('2026-11-18T08:00:00Z')])->save();
        foreach ([[$old->id, '2026-11-18T08:00:00Z', 1000], [$old->id, '2026-11-17T21:59:59Z', 2000], [$foreign->id, '2026-11-18T08:00:00Z', 3000], [null, '2026-11-18T08:00:00Z', 4000]] as [$requestId, $at, $amount]) {
            $transaction = WalletTransaction::create([...$base, 'wallet_id' => $points->id, 'wallet_type' => 'points', 'consultation_request_id' => $requestId, 'type' => 'review_bonus', 'amount_minor' => $amount]);
            $transaction->forceFill(['created_at' => CarbonImmutable::parse($at)])->save();
        }
        $this->getJson('/api/v1/admin/financial?from=2026-11-18&to=2026-11-18&institution_id='.$institution->id)->assertOk()
            ->assertJsonPath('summary.medical_paid_real', 200)->assertJsonPath('summary.medical_provider_earnings', 160)
            ->assertJsonPath('summary.platform_fees', 40)->assertJsonPath('bonus_report.consultations.count', 0)
            ->assertJsonPath('bonus_report.issued_total', 10)->assertJsonPath('transaction_count', 2)
            ->assertJsonCount(1, 'by_service')->assertJsonPath('by_service.0.key', 'extra:operator_add_on_income');
    }

    public function test_payouts_use_transfer_date_pending_requests_use_submission_date_and_current_balances_ignore_period(): void
    {
        config(['app.timezone' => 'UTC']);
        $admin = $this->admin();
        $institution = MedicalInstitution::create(['name' => 'Clinica plăți', 'status' => 'active']);
        $this->institutionalCapture($admin, User::factory()->create(), $institution, '2026-10-01T09:00:00Z');
        $base = ['user_id' => $admin->id, 'payer' => 'platform', 'medical_institution_id' => $institution->id, 'iban' => 'MD00TEST0000000000000000'];
        $paid = WithdrawalRequest::create([...$base, 'amount_minor' => 10000, 'approved_amount_minor' => 9000, 'status' => 'approved', 'payout_sent_at' => CarbonImmutable::parse('2026-11-18T08:00:00Z')]);
        $paid->forceFill(['created_at' => CarbonImmutable::parse('2026-10-15T08:00:00Z')])->save();
        $pending = WithdrawalRequest::create([...$base, 'amount_minor' => 5000, 'status' => 'pending']);
        $pending->forceFill(['created_at' => CarbonImmutable::parse('2026-11-18T08:00:00Z')])->save();
        $older = WithdrawalRequest::create([...$base, 'amount_minor' => 2500, 'status' => 'pending']);
        $older->forceFill(['created_at' => CarbonImmutable::parse('2026-10-15T08:00:00Z')])->save();
        WithdrawalRequest::create([...$base, 'payer' => 'institution', 'amount_minor' => 8000, 'approved_amount_minor' => 8000, 'status' => 'approved', 'payout_sent_at' => CarbonImmutable::parse('2026-11-18T08:00:00Z')]);
        $this->getJson('/api/v1/admin/financial?from=2026-11-18&to=2026-11-18&institution_id='.$institution->id)->assertOk()
            ->assertJsonPath('summary.paid_withdrawals', 90)->assertJsonPath('summary.pending_withdrawals', 50)
            ->assertJsonCount(2, 'withdrawals')->assertJsonPath('by_institution.0.consultations', 0)
            ->assertJsonPath('by_institution.0.balance_current', 150)->assertJsonPath('by_institution.0.pending_current', 75);
    }

    public function test_partial_periods_and_invalid_filters_and_independent_snapshots(): void
    {
        config(['app.timezone' => 'UTC']);
        $admin = $this->admin();
        $institution = MedicalInstitution::create(['name' => 'Filtre', 'status' => 'active']);
        $doctor = User::factory()->create();
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'is_approved' => true]);
        $this->captured($admin, ['doctor_id' => $doctor->id, 'completed_at' => CarbonImmutable::parse('2026-11-17T22:00:00Z'), 'amount_minor' => 50000, 'real_amount_minor' => 50000, 'pricing_snapshot' => ['institution_id' => null]]);
        $this->getJson('/api/v1/admin/financial?from=2026-11-18')->assertOk()->assertJsonPath('summary.medical_paid_real', 500);
        $this->getJson('/api/v1/admin/financial?to=2026-11-17')->assertOk()->assertJsonPath('summary.medical_paid_real', 0);
        $this->getJson('/api/v1/admin/financial?institution_id='.$institution->id)->assertOk()->assertJsonPath('summary.medical_paid_real', 0);
        foreach (['from=invalid', 'from=2026-11-31', 'from=2026-11-18&to=2026-11-17', 'institution_id=99999', 'institution_id[]=1', 'transactions_page=0'] as $query) {
            $this->getJson('/api/v1/admin/financial?'.$query)->assertUnprocessable();
        }
    }

    public function test_zero_provider_income_and_zero_approved_payment_are_preserved_without_fabricating_an_institution_earning(): void
    {
        $admin = $this->admin();
        $institution = MedicalInstitution::create(['name' => 'Cotă zero', 'status' => 'active']);
        $item = $this->captured($admin, ['amount_minor' => 10000, 'real_amount_minor' => 10000, 'provider_amount_minor' => 0, 'platform_fee_minor' => 10000, 'pricing_snapshot' => ['institution_id' => $institution->id]]);
        $wallet = Wallet::create(['user_id' => $admin->id, 'type' => 'real', 'currency' => 'MDL']);
        WalletTransaction::create(['wallet_id' => $wallet->id, 'user_id' => $admin->id, 'currency' => 'MDL', 'status' => 'completed', 'description' => 'Supliment cu cotă zero', 'consultation_request_id' => $item->id,
            'type' => 'operator_add_on_income', 'amount_minor' => 0, 'metadata' => ['gross_amount_minor' => 20000, 'platform_fee_minor' => 20000]]);
        WithdrawalRequest::create(['user_id' => $admin->id, 'payer' => 'platform', 'medical_institution_id' => $institution->id, 'iban' => 'MD00TEST0000000000000000', 'amount_minor' => 7000, 'approved_amount_minor' => 0, 'status' => 'approved']);
        $this->getJson('/api/v1/admin/financial?institution_id='.$institution->id)->assertOk()
            ->assertJsonPath('summary.medical_paid_real', 300)->assertJsonPath('summary.platform_fees', 300)
            ->assertJsonPath('summary.paid_withdrawals', 0)->assertJsonPath('withdrawals.0.approved_amount', 0)
            ->assertJsonPath('transactions.0.fee', 200)
            ->assertJsonPath('by_institution.0.consultations', 0)->assertJsonPath('by_institution.0.request_count', 1)
            ->assertJsonPath('by_institution.0.retained_real', 100)->assertJsonPath('by_institution.0.reconciliation_required', false);
        $this->assertSame(0, InstitutionEarning::count());
    }

    public function test_settlement_and_payment_dates_override_creation_dates_and_recent_list_uses_recognition_order(): void
    {
        config(['app.timezone' => 'UTC']);
        $admin = $this->admin();
        $wallet = Wallet::create(['user_id' => $admin->id, 'type' => 'real', 'currency' => 'MDL', 'balance_minor' => 12300]);
        $old = $this->captured($admin, ['amount_minor' => 10000, 'real_amount_minor' => 10000, 'provider_amount_minor' => 8000, 'platform_fee_minor' => 2000, 'completed_at' => CarbonImmutable::parse('2026-10-01T09:00:00Z')]);
        $newer = $this->captured($admin, ['amount_minor' => 70000, 'real_amount_minor' => 70000, 'provider_amount_minor' => 60000, 'platform_fee_minor' => 10000, 'completed_at' => CarbonImmutable::parse('2026-11-18T09:00:00Z')]);
        $base = ['wallet_id' => $wallet->id, 'user_id' => $admin->id, 'currency' => 'MDL', 'status' => 'completed', 'description' => 'Decontare'];
        foreach ([[$old->id, 'consultation_income', '2026-11-17T22:00:00Z', 8000], [$old->id, 'platform_fee', '2026-11-17T22:00:00Z', 0], [$newer->id, 'consultation_income', '2026-11-17T21:59:59Z', 60000]] as [$id, $type, $at, $amount]) {
            $transaction = WalletTransaction::create([...$base, 'consultation_request_id' => $id, 'type' => $type, 'amount_minor' => $amount, 'metadata' => ['platform_fee_minor' => 2000]]);
            $transaction->forceFill(['created_at' => CarbonImmutable::parse($at)])->save();
        }
        $payment = Payment::create(['user_id' => $admin->id, 'wallet_id' => $wallet->id, 'amount_minor' => 50000, 'currency' => 'MDL', 'purpose' => 'wallet_top_up', 'status' => 'paid', 'provider' => 'maib', 'paid_at' => CarbonImmutable::parse('2026-11-18T09:00:00Z')]);
        $payment->forceFill(['created_at' => CarbonImmutable::parse('2026-10-01T09:00:00Z')])->save();
        $this->getJson('/api/v1/admin/financial?from=2026-11-18&to=2026-11-18')->assertOk()
            ->assertJsonPath('summary.top_ups', 500)->assertJsonPath('summary.wallets_balance', 123)
            ->assertJsonPath('summary.medical_paid_real', 100)->assertJsonPath('summary.platform_fees', 20)
            ->assertJsonPath('transaction_count', 2)->assertJsonPath('bonus_report.recent.0.id', $old->id)
            ->assertJsonPath('by_service.0.count', 1);
        $this->getJson('/api/v1/admin/financial')->assertOk()->assertJsonPath('bonus_report.recent.0.id', $old->id);
    }

    private function institutionalCapture(User $patient, User $doctor, MedicalInstitution $institution, string $recognizedAt): ConsultationRequest
    {
        $request = $this->captured($patient, ['doctor_id' => $doctor->id, 'amount_minor' => 50000, 'real_amount_minor' => 30000, 'points_amount_minor' => 20000, 'provider_amount_minor' => 24000, 'platform_fee_minor' => 6000,
            'scheduled_at' => CarbonImmutable::parse('2026-10-01T09:00:00Z'), 'completed_at' => CarbonImmutable::parse('2026-10-01T09:30:00Z'), 'pricing_snapshot' => ['institution_id' => $institution->id]]);
        $request->forceFill(['created_at' => CarbonImmutable::parse('2026-09-01T09:00:00Z')])->save();
        $earning = InstitutionEarning::create(['medical_institution_id' => $institution->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $request->id, 'gross_amount_minor' => 50000, 'provider_amount_minor' => 24000, 'doctor_share_percent' => 50, 'doctor_amount_minor' => 12000, 'institution_amount_minor' => 12000]);
        $earning->forceFill(['created_at' => CarbonImmutable::parse($recognizedAt)])->save();

        return $request;
    }

    private function captured(User $user, array $attributes = []): ConsultationRequest
    {
        return ConsultationRequest::create([...['patient_id' => $user->id, 'type' => 'video', 'status' => 'completed', 'payment_status' => 'captured', 'symptoms' => 'Date demonstrative', 'amount_minor' => 0, 'real_amount_minor' => 0, 'completed_at' => now()], ...$attributes]);
    }

    private function admin(): User
    {
        $role = Role::firstOrCreate(['name' => 'admin'], ['label' => 'Admin']);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);
        Sanctum::actingAs($user);

        return $user;
    }
}
