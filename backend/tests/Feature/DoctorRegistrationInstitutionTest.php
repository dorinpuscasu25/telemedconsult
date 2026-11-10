<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorRegistrationInstitutionTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_lists_only_active_institutions(): void
    {
        MedicalInstitution::create(['name' => 'Activă', 'status' => 'active', 'doctor_share_percent' => 70]);
        MedicalInstitution::create(['name' => 'Suspendată', 'status' => 'suspended', 'doctor_share_percent' => 70]);

        $this->getJson('/api/v1/catalog/institutions')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Activă');
    }

    public function test_pending_doctor_chooses_an_institution_and_admin_approval_joins_it(): void
    {
        $institution = MedicalInstitution::create(['name' => 'CMF nr. 1', 'status' => 'active', 'doctor_share_percent' => 70]);
        $admin = $this->user('admin', 'active');
        $doctor = $this->pendingDoctor();
        Sanctum::actingAs($doctor);

        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('user.doctor_registration.institution_chosen', false);
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => $institution->id])->assertOk()
            ->assertJsonPath('user.doctor_registration.institution_chosen', true)
            ->assertJsonPath('user.doctor_registration.requested_institution.name', 'CMF nr. 1');
        $this->assertSame(1, $admin->notifications()->count());

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/registrations')->assertOk()->assertJsonPath('data.0.profiles.doctor.requested_institution.name', 'CMF nr. 1');
        $this->postJson("/api/v1/admin/users/{$doctor->id}/approve")->assertOk();

        $profile = $doctor->doctorProfile->fresh();
        $this->assertSame($institution->id, $profile->medical_institution_id);
        $this->assertTrue($profile->is_approved);
    }

    public function test_independent_doctor_stays_without_institution_and_admin_can_assign_one(): void
    {
        $institution = MedicalInstitution::create(['name' => 'CMF nr. 2', 'status' => 'active', 'doctor_share_percent' => 70]);
        $doctor = $this->pendingDoctor();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => null])->assertOk()
            ->assertJsonPath('user.doctor_registration.requested_institution', null);

        Sanctum::actingAs($this->user('admin', 'active'));
        $this->postJson("/api/v1/admin/users/{$doctor->id}/approve", ['institution_id' => $institution->id])->assertOk();
        $this->assertSame($institution->id, $doctor->doctorProfile->fresh()->medical_institution_id);
    }

    public function test_choice_needs_a_confirmed_email_a_pending_account_and_an_active_institution(): void
    {
        $suspended = MedicalInstitution::create(['name' => 'X', 'status' => 'suspended', 'doctor_share_percent' => 70]);
        $doctor = $this->pendingDoctor(verified: false);
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => null])->assertUnprocessable();

        $doctor->forceFill(['email_verified_at' => now()])->save();
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => $suspended->id])->assertUnprocessable();

        $doctor->forceFill(['status' => 'active'])->save();
        $this->postJson('/api/v1/auth/registration/institution', ['institution_id' => null])->assertUnprocessable();
    }

    private function pendingDoctor(bool $verified = true): User
    {
        $doctor = $this->user('doctor', 'pending');
        $doctor->forceFill(['email_verified_at' => $verified ? now() : null])->save();
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => false]);

        return $doctor;
    }

    private function user(string $roleName, string $status): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => $status, 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
