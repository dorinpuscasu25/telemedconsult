<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\FirstTopupPromotionGrant;
use App\Models\PatientProfile;
use App\Models\Payment;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\ConsultationCostEstimator;
use App\Services\FirstTopupPromotion;
use App\Services\OperatorAssignmentService;
use App\Services\PaymentVerification;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FirstTopupPromotionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();
    }

    public function test_first_confirmed_topup_awards_fixed_restricted_bonus_once_and_preserves_generic_bonus(): void
    {
        [$patient, $doctor] = $this->scenario();
        app(PlatformConfig::class)->upsert('wallet.topup_bonus_percent', 10);
        $payment = $this->payment($patient, 100000);
        $this->confirm($payment);
        $this->confirm($payment);
        $this->confirm($this->payment($patient, 50000));
        $this->assertSame(150000, $this->balance($patient, 'real'));
        $this->assertSame(15000, $this->balance($patient, 'points'));
        $this->assertSame(50000, $this->balance($patient, 'promo'));
        $this->assertSame(1, FirstTopupPromotionGrant::count());
        $this->assertSame(1, WalletTransaction::where('type', 'first_topup_promotion')->count());
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('promo_wallet.balance', 500)->assertJsonPath('first_topup_promotion.grant.doctor_ids.0', $doctor->id)->assertJsonPath('first_topup_promotion.eligible_for_grant', false);
    }

    public function test_small_first_topup_consumes_eligibility_and_failed_topup_does_not(): void
    {
        [$patient] = $this->scenario();
        $this->payment($patient, 80000)->update(['status' => 'failed']);
        $this->confirm($this->payment($patient, 49999));
        $this->confirm($this->payment($patient, 50000));
        $this->assertSame(0, FirstTopupPromotionGrant::count());
        $this->assertSame(0, $this->balance($patient, 'promo'));
    }

    public function test_disabled_or_unconfigured_promotion_does_not_award_bonus(): void
    {
        [$patient] = $this->scenario();
        app(PlatformConfig::class)->upsert('wallet.first_topup_promo_doctor_ids', []);
        $this->confirm($this->payment($patient, 50000));
        $this->assertSame(0, FirstTopupPromotionGrant::count());
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('first_topup_promotion.enabled', false)->assertJsonPath('first_topup_promotion.eligible_for_grant', false);
    }

    public function test_provider_only_account_is_not_eligible_for_patient_promotion(): void
    {
        [, $doctor] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('first_topup_promotion.eligible_for_grant', false);
        $this->confirm($this->payment($doctor, 50000));
        $this->assertSame(0, FirstTopupPromotionGrant::count());
        $this->assertSame(50000, $this->balance($doctor, 'real'));
        $this->assertSame(0, $this->balance($doctor, 'promo'));
    }

    public function test_earned_scope_and_cap_survive_changed_or_disabled_promotion(): void
    {
        [$patient, $doctor] = $this->scenario();
        $this->confirm($this->payment($patient, 50000));
        $other = $this->doctor();
        app(PlatformConfig::class)->upsert('wallet.first_topup_promo_doctor_ids', [$other->id]);
        app(PlatformConfig::class)->upsert('wallet.first_topup_promo_enabled', false);
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('first_topup_promotion.doctor_ids', [$doctor->id])->assertJsonPath('first_topup_promotion.doctors.0.name', $doctor->name);
        $quote = app(FirstTopupPromotion::class)->split($patient->id, $doctor, 50000, 50000);
        $this->assertSame(250, $quote['promo_amount']);
        $this->assertSame(0, app(FirstTopupPromotion::class)->split($patient->id, $other, 50000, 50000)['promo_amount']);
    }

    public function test_preview_and_hold_auto_apply_promotion_then_cancel_restores_original_balances(): void
    {
        [$patient, $doctor, $profile] = $this->scenario();
        $this->confirm($this->payment($patient, 50000));
        Sanctum::actingAs($patient);
        $payload = $this->requestPayload($profile, $doctor);
        $this->postJson('/api/v1/requests/preview', $payload)->assertOk()->assertJsonPath('payment.promo_amount', 250)->assertJsonPath('payment.real_amount', 250);
        $id = $this->postJson('/api/v1/requests', $payload)->assertCreated()->assertJsonPath('request.promo_amount', 250)->assertJsonPath('request.real_amount', 250)->json('request.id');
        $this->assertSame(25000, $this->balance($patient, 'real'));
        $this->assertSame(25000, $this->balance($patient, 'promo'));
        $this->postJson('/api/v1/requests/'.$id.'/cancel')->assertOk();
        $this->postJson('/api/v1/requests/'.$id.'/cancel')->assertUnprocessable();
        $this->assertSame(50000, $this->balance($patient, 'real'));
        $this->assertSame(50000, $this->balance($patient, 'promo'));
        $this->assertSame(0, $this->balance($patient, 'points'));
    }

    public function test_other_doctor_cannot_spend_restricted_promotion_even_when_client_requests_full_bonus(): void
    {
        [$patient, , $profile] = $this->scenario();
        $this->confirm($this->payment($patient, 50000));
        $other = $this->doctor();
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests', [...$this->requestPayload($profile, $other), 'points_percent' => 100])->assertCreated()->assertJsonPath('request.promo_amount', 0)->assertJsonPath('request.real_amount', 500);
        $this->assertSame(50000, $this->balance($patient, 'promo'));
    }

    public function test_generic_and_promo_combined_cannot_exceed_half_of_doctor_base_or_pay_exam_fees(): void
    {
        [$patient, $doctor] = $this->scenario();
        $this->confirm($this->payment($patient, 50000));
        $doctor->doctorProfile->update(['accepts_points' => true]);
        app(PlatformConfig::class)->upsert('wallet.max_points_payment_percent', 100);
        Wallet::where('user_id', $patient->id)->where('type', 'promo')->update(['balance_minor' => 10000]);
        $payment = app(FirstTopupPromotion::class)->split($patient->id, $doctor->fresh(), 85000, 50000, 100);
        $this->assertSame(100, $payment['promo_amount']);
        $this->assertSame(150, $payment['points_amount']);
        $this->assertSame(600, $payment['real_amount']);
        $this->assertSame(0, app(FirstTopupPromotion::class)->split($patient->id, null, 35000, 0, 100)['promo_amount']);
    }

    public function test_exam_preview_and_hold_apply_half_of_doctor_fee_only(): void
    {
        [$patient, $doctor, $profile] = $this->scenario();
        $this->confirm($this->payment($patient, 100000));
        $region = Region::create(['name' => 'Test', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Test', 'type' => 'municipiu', 'is_active' => true]);
        $profile->update(['region_id' => $region->id, 'locality_id' => $locality->id, 'address' => 'Str. Test 1']);
        $operator = $this->user('operator');
        $this->mock(OperatorAssignmentService::class)->shouldReceive('pickOperatorId')->twice()->andReturn($operator->id);
        $this->mock(ConsultationCostEstimator::class)->shouldReceive('estimate')->twice()->andReturn([
            'doctor_base' => 500, 'investigations' => [], 'investigations_total' => 300, 'travel_fee' => 50, 'total' => 850,
        ]);
        Sanctum::actingAs($patient);
        $payload = [...$this->requestPayload($profile, $doctor), 'type' => 'doctor', 'consultation_kind' => 'with_exam'];
        $this->postJson('/api/v1/requests/preview', $payload)->assertOk()->assertJsonPath('payment.total', 850)->assertJsonPath('payment.promo_amount', 250)->assertJsonPath('payment.real_amount', 600);
        $this->postJson('/api/v1/requests', $payload)->assertCreated()->assertJsonPath('request.promo_amount', 250)->assertJsonPath('request.real_amount', 600);
        $this->assertSame(40000, $this->balance($patient, 'real'));
        $this->assertSame(25000, $this->balance($patient, 'promo'));
    }

    public function test_repeated_holds_stop_using_promotion_when_its_separate_balance_is_exhausted(): void
    {
        [$patient, $doctor, $profile] = $this->scenario();
        $this->confirm($this->payment($patient, 100000));
        Sanctum::actingAs($patient);
        foreach ([250, 250, 0] as $expectedPromo) {
            $this->postJson('/api/v1/requests', $this->requestPayload($profile, $doctor))->assertCreated()->assertJsonPath('request.promo_amount', $expectedPromo);
        }
        $this->assertSame(0, $this->balance($patient, 'promo'));
        $this->assertSame(0, $this->balance($patient, 'real'));
        $this->assertSame(0, $this->balance($patient, 'points'));
    }

    public function test_partial_cancellation_refunds_all_promotion_and_pays_travel_from_cash(): void
    {
        [$patient, $doctor, $profile] = $this->scenario();
        $this->confirm($this->payment($patient, 50000));
        $operator = $this->user('operator');
        Wallet::where('user_id', $patient->id)->where('type', 'real')->update(['balance_minor' => 4000]);
        Wallet::where('user_id', $patient->id)->where('type', 'promo')->update(['balance_minor' => 25000]);
        $request = ConsultationRequest::create([
            'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'operator_id' => $operator->id,
            'type' => 'doctor', 'consultation_kind' => 'with_exam', 'status' => 'accepted', 'operator_accepted_at' => now(),
            'payment_status' => 'held', 'amount_minor' => 71000, 'real_amount_minor' => 46000, 'promo_amount_minor' => 25000,
            'promo_grant_id' => FirstTopupPromotionGrant::first()->id, 'pricing_snapshot' => ['cost_breakdown' => ['travel_fee' => 50]],
        ]);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/cancel')->assertOk();
        $this->assertSame(45000, $this->balance($patient, 'real'));
        $this->assertSame(50000, $this->balance($patient, 'promo'));
        $this->assertSame(5000, $this->balance($operator, 'real'));
        $this->assertSame(0, $this->balance($patient, 'points'));
    }

    public function test_promotion_does_not_reduce_doctor_contractual_payout_and_cannot_be_refunded_after_capture(): void
    {
        [$patient, $doctor, $profile] = $this->scenario();
        $this->confirm($this->payment($patient, 50000));
        Sanctum::actingAs($patient);
        $id = $this->postJson('/api/v1/requests', $this->requestPayload($profile, $doctor))->assertCreated()->json('request.id');
        $request = ConsultationRequest::findOrFail($id);
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        $this->assertSame($request->provider_amount_minor, $this->balance($doctor, 'real'));
        $this->assertSame(25000, WalletTransaction::where('user_id', $doctor->id)->where('type', 'consultation_income')->firstOrFail()->metadata['promo_subsidy_minor']);
        $this->assertSame('captured', $request->fresh()->payment_status);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$id.'/cancel')->assertUnprocessable();
        $this->assertSame(25000, $this->balance($patient, 'promo'));
    }

    public function test_admin_rejects_promotion_without_doctor_or_with_unapproved_doctor(): void
    {
        $admin = $this->user('admin');
        Sanctum::actingAs($admin);
        $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'wallet.first_topup_promo_enabled', 'value' => true]]])->assertUnprocessable();
        $doctor = $this->doctor();
        $doctor->doctorProfile->update(['is_approved' => false]);
        $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'wallet.first_topup_promo_doctor_ids', 'value' => [$doctor->id]]]])->assertUnprocessable();
    }

    private function scenario(): array
    {
        $patient = $this->user('patient');
        $doctor = $this->doctor();
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Eva', 'last_name' => 'Test', 'status' => 'active', 'active_until' => now()->addYear()]);
        app(PlatformConfig::class)->upsert('wallet.first_topup_promo_enabled', true);
        app(PlatformConfig::class)->upsert('wallet.first_topup_promo_doctor_ids', [$doctor->id]);

        return [$patient, $doctor, $profile];
    }

    private function user(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }

    private function doctor(): User
    {
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'video_price' => 500, 'consultation_price' => 500]);

        return $doctor;
    }

    private function payment(User $patient, int $amountMinor): Payment
    {
        $wallet = Wallet::firstOrCreate(['user_id' => $patient->id, 'type' => 'real'], ['balance_minor' => 0, 'currency' => 'MDL']);

        return Payment::create(['user_id' => $patient->id, 'wallet_id' => $wallet->id, 'amount_minor' => $amountMinor, 'currency' => 'MDL', 'purpose' => 'wallet_top_up', 'status' => 'pending', 'provider' => 'maib', 'provider_payment_id' => (string) Str::uuid()]);
    }

    private function confirm(Payment $payment): void
    {
        $this->postJson('/api/v1/payments/callback/maib', ['payId' => $payment->provider_payment_id, 'status' => 'OK'])->assertOk();
    }

    private function balance(User $user, string $type): int
    {
        return (int) Wallet::where('user_id', $user->id)->where('type', $type)->value('balance_minor');
    }

    private function requestPayload(PatientProfile $profile, User $doctor): array
    {
        return ['type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'symptoms' => 'Simptome test'];
    }
}
