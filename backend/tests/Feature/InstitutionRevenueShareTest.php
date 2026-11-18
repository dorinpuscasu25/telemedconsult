<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\User;
use App\Services\FinancialBreakdown;
use App\Services\InstitutionLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InstitutionRevenueShareTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_sets_each_institutions_share_and_rejects_invalid_rates(): void
    {
        $manager = $this->user('patient');
        Sanctum::actingAs($this->user('admin'));
        $payload = ['name' => 'Clinica A', 'doctor_share_percent' => 30, 'revenue_share_percent' => 80, 'manager_user_id' => $manager->id];
        $id = $this->postJson('/api/v1/admin/institutions', $payload)->assertCreated()->assertJsonPath('institution.revenue_share_percent', 80)->json('institution.id');
        $other = MedicalInstitution::create(['name' => 'Clinica B', 'status' => 'active']);

        foreach ([-1, 100.01, 'invalid', null] as $rate) {
            $this->putJson('/api/v1/admin/institutions/'.$id, [...$payload, 'status' => 'active', 'revenue_share_percent' => $rate])
                ->assertUnprocessable()->assertJsonValidationErrors('revenue_share_percent');
        }
        $this->putJson('/api/v1/admin/institutions/'.$id, [...$payload, 'status' => 'active', 'revenue_share_percent' => 75.5])
            ->assertOk()->assertJsonPath('institution.revenue_share_percent', 75.5);
        $this->assertSame(85.0, $other->fresh()->revenue_share_percent);
    }

    public function test_five_hundred_cash_produces_four_hundred_for_institution_and_one_hundred_twenty_for_doctor(): void
    {
        [$institution, $doctor] = $this->scenario();
        $pricing = app(FinancialBreakdown::class)->forProvider(50000, $doctor);
        $this->assertSame(10000, $pricing['platform_fee_minor']);
        $this->assertSame(40000, $pricing['provider_amount_minor']);
        $earning = app(InstitutionLedger::class)->recordEarning($this->appointment($doctor, $pricing), $doctor);
        $this->assertSame($institution->id, $earning->medical_institution_id);
        $this->assertSame(12000, $earning->doctor_amount_minor);
        $this->assertSame(28000, $earning->institution_amount_minor);
    }

    public function test_mixed_payment_and_additional_cash_keep_booked_rates(): void
    {
        [$institution, $doctor] = $this->scenario();
        $financial = app(FinancialBreakdown::class);
        $pricing = $financial->forProvider(50000, $doctor, 25000);
        $this->assertSame(5000, $pricing['platform_fee_minor']);
        $this->assertSame(20000, $pricing['provider_amount_minor']);
        $request = $this->appointment($doctor, $pricing);
        $institution->update(['revenue_share_percent' => 60, 'doctor_share_percent' => 50]);
        $additional = $financial->forAdditionalCash(10000, $doctor->fresh(), $pricing);
        $this->assertSame(2000, $additional['platform_fee_minor']);
        $this->assertSame(8000, $additional['provider_amount_minor']);
        $earning = app(InstitutionLedger::class)->recordEarning($request, $doctor->fresh());
        $this->assertSame(6000, $earning->doctor_amount_minor);
        $this->assertEquals(30, $earning->doctor_share_percent);
        $this->assertSame(4000, $financial->forProvider(10000, $doctor->fresh())['platform_fee_minor']);
    }

    public function test_manager_applies_common_rate_and_preserves_existing_appointments_and_other_institutions(): void
    {
        [$institution, $doctor] = $this->scenario();
        $doctor->doctorProfile->update(['institution_share_percent' => 40]);
        $legacy = ConsultationRequest::create(['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'accepted']);
        $booked = $this->appointment($doctor->fresh(), app(FinancialBreakdown::class)->forProvider(50000, $doctor->fresh()));
        [$other, $otherDoctor] = $this->scenario();
        $otherDoctor->doctorProfile->update(['institution_share_percent' => 45]);
        $manager = $this->user('institution');
        $institution->managers()->attach($manager);
        Sanctum::actingAs($manager);
        $this->putJson('/api/v1/institution/settings', ['doctor_share_percent' => 30, 'apply_share_to_all_doctors' => true, 'revenue_share_percent' => 100])
            ->assertOk()->assertJsonPath('institution.doctor_share_percent', 30)->assertJsonPath('institution.revenue_share_percent', 80);
        $this->assertNull($doctor->doctorProfile->fresh()->institution_share_percent);
        $this->assertSame(30.0, $doctor->doctorProfile->fresh()->effectiveInstitutionSharePercent());
        $this->assertEquals(40, $legacy->fresh()->pricing_snapshot['doctor_share_percent']);
        $this->assertEquals(40, $booked->fresh()->pricing_snapshot['doctor_share_percent']);
        $this->assertSame(45.0, $otherDoctor->doctorProfile->fresh()->institution_share_percent);
        $this->assertSame(30.0, $other->fresh()->doctor_share_percent);
    }

    public function test_zero_cash_and_percentage_boundaries_do_not_create_money(): void
    {
        [$institution, $doctor] = $this->scenario();
        $financial = app(FinancialBreakdown::class);
        $zero = $financial->forProvider(50000, $doctor, 0);
        $this->assertSame(0, $zero['platform_fee_minor']);
        $this->assertSame(0, $zero['provider_amount_minor']);
        foreach ([0, 100, 80.5] as $rate) {
            $institution->update(['revenue_share_percent' => $rate]);
            $pricing = $financial->forProvider(501, $doctor->fresh(), 251);
            $this->assertSame(251, $pricing['platform_fee_minor'] + $pricing['provider_amount_minor']);
        }
    }

    private function scenario(): array
    {
        $institution = MedicalInstitution::create(['name' => 'Clinica', 'status' => 'active', 'revenue_share_percent' => 80, 'doctor_share_percent' => 30]);
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'institution_joined_at' => now()->subDay(), 'is_approved' => true]);

        return [$institution, $doctor];
    }

    private function appointment(User $doctor, array $pricing): ConsultationRequest
    {
        return ConsultationRequest::create([
            'patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed',
            'amount_minor' => $pricing['amount_minor'], 'real_amount_minor' => $pricing['cash_base_minor'],
            'points_amount_minor' => $pricing['amount_minor'] - $pricing['cash_base_minor'],
            'provider_amount_minor' => $pricing['provider_amount_minor'], 'platform_fee_minor' => $pricing['platform_fee_minor'],
            'pricing_snapshot' => $pricing, 'payment_status' => 'held',
        ]);
    }

    private function user(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => $roleName]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
