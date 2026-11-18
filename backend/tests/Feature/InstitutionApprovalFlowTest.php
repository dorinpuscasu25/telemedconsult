<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\User;
use App\Notifications\AppEventNotification;
use App\Services\ConsultationSettlement;
use App\Services\FinancialBreakdown;
use App\Services\InstitutionLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InstitutionApprovalFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_receives_and_approves_only_own_verified_doctor_applications(): void
    {
        Notification::fake();
        Queue::fake();
        $institution = MedicalInstitution::create(['name' => 'Clinica A', 'status' => 'active', 'doctor_share_percent' => 70]);
        $other = MedicalInstitution::create(['name' => 'Clinica B', 'status' => 'active', 'doctor_share_percent' => 60]);
        $manager = $this->user('institution');
        $institution->managers()->attach($manager);
        $doctor = $this->user('doctor', 'pending');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => false]);
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => null])->assertUnprocessable();
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => $institution->id])->assertOk();
        Notification::assertSentTo($manager, AppEventNotification::class);
        $stranger = $this->user('institution');
        $other->managers()->attach($stranger);
        Sanctum::actingAs($stranger);
        $this->getJson('/api/v1/institution/doctors')->assertOk()->assertJsonCount(0, 'pending_doctors');
        $this->postJson("/api/v1/institution/doctors/{$doctor->id}/approve")->assertNotFound();
        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/doctors')->assertOk()->assertJsonPath('pending_doctors.0.id', $doctor->id);
        $this->postJson("/api/v1/institution/doctors/{$doctor->id}/approve", ['doctor_share_percent' => 40])->assertOk();
        $this->assertSame('active', $doctor->fresh()->status);
        $this->assertTrue($doctor->doctorProfile->fresh()->is_approved);
        $this->assertSame($institution->id, $doctor->doctorProfile->fresh()->medical_institution_id);
        $this->assertEquals(40, $doctor->doctorProfile->fresh()->institution_share_percent);
        $this->postJson("/api/v1/institution/doctors/{$doctor->id}/approve")->assertUnprocessable();
        $this->getJson('/api/v1/institution/doctors')->assertOk()->assertJsonCount(0, 'pending_doctors')->assertJsonCount(1, 'doctors');
    }

    public function test_manager_cannot_approve_operator_or_unverified_doctor(): void
    {
        Queue::fake();
        $institution = MedicalInstitution::create(['name' => 'Clinica', 'status' => 'active', 'doctor_share_percent' => 70]);
        $manager = $this->user('institution');
        $institution->managers()->attach($manager);
        $operator = $this->user('operator', 'pending');
        $doctor = $this->user('doctor', 'pending');
        $doctor->forceFill(['email_verified_at' => null])->save();
        DoctorProfile::create(['user_id' => $doctor->id, 'requested_institution_id' => $institution->id, 'is_approved' => false]);
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/institution/doctors/{$operator->id}/approve")->assertNotFound();
        $this->postJson("/api/v1/institution/doctors/{$doctor->id}/approve")->assertUnprocessable();
        $this->getJson('/api/v1/institution/doctors')->assertJsonCount(0, 'pending_doctors');
        Sanctum::actingAs($this->user('admin'));
        $this->postJson("/api/v1/admin/users/{$operator->id}/approve")->assertOk();
        $this->assertSame('active', $operator->fresh()->status);
    }

    private function user(string $roleName, string $status = 'active'): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => $roleName]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => $status]);
        $user->roles()->attach($role);

        return $user;
    }

    public function test_institution_receives_eighty_five_percent_and_doctor_share_is_frozen_at_booking(): void
    {
        $institution = MedicalInstitution::create(['name' => 'Clinica', 'status' => 'active', 'doctor_share_percent' => 40]);
        $doctor = $this->user('doctor');
        $profile = DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'institution_share_percent' => 40, 'is_approved' => true]);
        $pricing = app(FinancialBreakdown::class)->forProvider(50000, $doctor);
        $this->assertSame(7500, $pricing['platform_fee_minor']);
        $this->assertSame(42500, $pricing['provider_amount_minor']);
        $patient = $this->user('patient');
        $request = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'amount_minor' => 50000, 'platform_fee_minor' => 7500, 'provider_amount_minor' => 42500, 'payment_status' => 'held', 'pricing_snapshot' => $pricing]);
        $profile->update(['institution_share_percent' => 90]);
        app(ConsultationSettlement::class)->close($request);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/review', ['rating' => 2, 'comment' => 'Consultație efectuată'])->assertCreated();
        $this->assertSame('captured', $request->fresh()->payment_status);
        $earning = app(InstitutionLedger::class)->recordEarning($request, $doctor->refresh());
        $this->assertSame(17000, $earning->doctor_amount_minor);
        $this->assertSame(25500, $earning->institution_amount_minor);
        $this->assertSame($institution->id, $earning->medical_institution_id);
    }

    public function test_appointment_totals_exclude_other_institutions_and_legacy_history_before_joining(): void
    {
        $institution = MedicalInstitution::create(['name' => 'Clinica A', 'status' => 'active', 'doctor_share_percent' => 40]);
        $other = MedicalInstitution::create(['name' => 'Clinica B', 'status' => 'active', 'doctor_share_percent' => 40]);
        $manager = $this->user('institution');
        $institution->managers()->attach($manager);
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'institution_joined_at' => now()->subDays(2), 'is_approved' => true]);
        $base = ['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'doctor', 'status' => 'accepted'];
        ConsultationRequest::create($base)->forceFill(['created_at' => now()->subDays(3)])->save();
        ConsultationRequest::create($base)->forceFill(['created_at' => now()->subDay()])->save();
        ConsultationRequest::create($base + ['pricing_snapshot' => ['institution_id' => $institution->id]]);
        ConsultationRequest::create($base + ['pricing_snapshot' => ['institution_id' => $other->id]]);
        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/doctors')->assertOk()->assertJsonPath('doctors.0.appointments', 2);
        $this->getJson('/api/v1/institution/dashboard')->assertOk()->assertJsonPath('summary.appointments_total', 2)->assertJsonPath('summary.month_appointments', 2);
    }
}
