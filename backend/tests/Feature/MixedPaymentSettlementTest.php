<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\FinancialBreakdown;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MixedPaymentSettlementTest extends TestCase
{
    use RefreshDatabase;

    public function test_cash_split_is_frozen_at_booking_and_paid_once_after_review(): void
    {
        [$patient, $doctor, $payload] = $this->scenario();
        Sanctum::actingAs($patient);
        $id = $this->postJson('/api/v1/requests', $payload)->assertCreated()
            ->assertJsonPath('request.real_amount', 250)->assertJsonPath('request.points_amount', 250)->json('request.id');
        $item = ConsultationRequest::findOrFail($id);
        $this->assertSame(3750, $item->platform_fee_minor);
        $this->assertSame(21250, $item->provider_amount_minor);
        $this->assertSame(25000, $item->pricing_snapshot['cash_base_minor']);
        $this->assertSame(0, InstitutionEarning::count());
        $doctor->doctorProfile->update(['institution_share_percent' => 90, 'accepts_points' => false]);
        $item->update(['status' => 'completed', 'completed_at' => now(), 'conclusion_sent_at' => now()]);
        $this->postJson("/api/v1/requests/{$id}/review", ['rating' => 1, 'comment' => 'Efectuată'])->assertCreated();
        $this->postJson("/api/v1/requests/{$id}/review", ['rating' => 5, 'comment' => 'Repetată'])->assertCreated();
        $earning = InstitutionEarning::firstOrFail();
        $this->assertSame(8500, $earning->doctor_amount_minor);
        $this->assertSame(12750, $earning->institution_amount_minor);
        $this->assertSame(0, WalletTransaction::where('type', 'consultation_income')->sum('amount_minor'));
        $this->assertSame(0, (int) Wallet::where('user_id', $doctor->id)->where('type', 'real')->value('balance_minor'));
        $this->assertSame(21250, WalletTransaction::where('type', 'institution_consultation_income')->firstOrFail()->metadata['institution_provider_amount_minor']);
        $this->assertSame('captured', $item->fresh()->payment_status);
        $this->assertSame(25000, Wallet::where('user_id', $doctor->id)->where('type', 'points')->value('balance_minor'));
        $this->assertSame(1, WalletTransaction::where('type', 'consultation_points_income')->count());
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.current_month_revenue', 85);
        $this->getJson('/api/v1/doctor/dashboard')->assertOk()->assertJsonPath('summary.current_month_revenue', 85);
        Sanctum::actingAs($this->user('admin'));
        $this->getJson('/api/v1/admin/financial')->assertOk()->assertJsonPath('summary.platform_fees', 37.5)->assertJsonPath('bonus_report.consultations.platform_net_real', 37.5);
    }

    public function test_cancellation_returns_cash_and_points_without_paying_provider(): void
    {
        [$patient, , $payload] = $this->scenario();
        Sanctum::actingAs($patient);
        $id = $this->postJson('/api/v1/requests', $payload)->assertCreated()->json('request.id');
        $this->postJson("/api/v1/requests/{$id}/cancel")->assertOk();
        $this->assertSame(50000, Wallet::where('user_id', $patient->id)->where('type', 'real')->value('balance_minor'));
        $this->assertSame(50000, Wallet::where('user_id', $patient->id)->where('type', 'points')->value('balance_minor'));
        $this->assertSame(0, InstitutionEarning::count());
    }

    public function test_zero_cash_never_creates_money_and_minor_unit_rounding_reconciles(): void
    {
        [, $doctor] = $this->scenario();
        $zero = app(FinancialBreakdown::class)->forProvider(50000, $doctor, 0);
        $this->assertSame(0, $zero['platform_fee_minor']);
        $this->assertSame(0, $zero['provider_amount_minor']);
        $rounded = app(FinancialBreakdown::class)->forProvider(501, $doctor, 251);
        $this->assertSame(38, $rounded['platform_fee_minor']);
        $this->assertSame(213, $rounded['provider_amount_minor']);
    }

    public function test_doctor_selects_own_points_limit_and_additional_cash_keeps_original_contract(): void
    {
        [$patient, $doctor, $payload] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->putJson('/api/v1/doctor/profile', ['name' => $doctor->name, 'points_payment_percent' => 15])->assertUnprocessable();
        $this->putJson('/api/v1/doctor/profile', ['name' => $doctor->name, 'points_payment_percent' => 20])->assertOk();
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/preview', $payload)->assertOk()->assertJsonPath('payment.points_amount', 100)->assertJsonPath('payment.max_points_percent', 20);
        $financial = app(FinancialBreakdown::class);
        $snapshot = $financial->forProvider(50000, $doctor->refresh(), 25000);
        $doctor->doctorProfile->update(['medical_institution_id' => null]);
        $addition = $financial->forAdditionalCash(10000, $doctor->refresh(), $snapshot);
        $this->assertSame(1500, $addition['platform_fee_minor']);
        $this->assertSame($snapshot['institution_id'], $addition['institution_id']);
    }

    private function scenario(): array
    {
        Notification::fake();
        $patient = $this->user('patient');
        $doctor = $this->user('doctor');
        $institution = MedicalInstitution::create(['name' => 'Clinica', 'status' => 'active', 'doctor_share_percent' => 40]);
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'institution_share_percent' => 40, 'is_approved' => true, 'video_price' => 500, 'accepts_points' => true]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Test', 'status' => 'active']);
        foreach (['real', 'points'] as $type) {
            Wallet::create(['user_id' => $patient->id, 'type' => $type, 'balance_minor' => 50000, 'currency' => 'MDL']);
        }
        app(PlatformConfig::class)->upsert('wallet.max_points_payment_percent', 50);

        return [$patient, $doctor, ['type' => 'video', 'consultation_kind' => 'video', 'doctor_id' => $doctor->id, 'patient_profile_id' => $profile->id, 'symptoms' => 'Consultație', 'points_percent' => 50]];
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['status' => 'active', 'active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }
}
