<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RegistrationApprovalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['otp.demo_code_enabled' => true]);
        Mail::fake();
        Notification::fake();

        foreach (['admin', 'patient', 'doctor', 'operator'] as $name) {
            Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        }

        Specialty::firstOrCreate(['slug' => 'cardiologie'], ['name' => 'Cardiologie']);
        Region::firstOrCreate(['name' => 'Chișinău'], ['type' => 'municipiu', 'is_active' => true]);
    }

    public function test_patient_registration_activates_immediately_with_only_patient_role(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Ion Pacient',
            'email' => 'pacient@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'patient',
        ])
            ->assertCreated()
            ->assertJsonPath('requires_approval', false);

        $user = User::where('email', 'pacient@example.test')->firstOrFail();

        $this->assertSame('active', $user->status);
        $this->assertSame(['patient'], $user->roles->pluck('name')->all());
    }

    public function test_doctor_registration_is_pending_with_only_doctor_role_and_unapproved_profile(): void
    {
        $specialtyId = Specialty::firstOrFail()->id;

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Dr. House',
            'email' => 'doctor@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'doctor',
            'specialty_id' => $specialtyId,
            'license_number' => 'LIC-123',
        ])
            ->assertCreated()
            ->assertJsonPath('requires_approval', true);

        $user = User::where('email', 'doctor@example.test')->firstOrFail();

        $this->assertSame('pending', $user->status);
        $this->assertSame(['doctor'], $user->roles->pluck('name')->all());
        $this->assertFalse($user->hasRole('patient'));

        $this->assertDatabaseHas('doctor_profiles', [
            'user_id' => $user->id,
            'is_approved' => false,
            'license_number' => 'LIC-123',
        ]);
    }

    public function test_doctor_registration_requires_a_specialty(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Dr. NoSpecialty',
            'email' => 'nospecialty@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'doctor',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('specialty_id');

        $this->assertSame(0, DoctorProfile::count());
    }

    public function test_operator_registration_is_pending_and_requires_a_region(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Operator Fără Regiune',
            'email' => 'noregion@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'operator',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('region');

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Operator Bun',
            'email' => 'operator@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'account_type' => 'operator',
            'region' => 'Chișinău',
        ])->assertCreated();

        $user = User::where('email', 'operator@example.test')->firstOrFail();

        $this->assertSame('pending', $user->status);
        $this->assertSame(['operator'], $user->roles->pluck('name')->all());
        $this->assertDatabaseHas('operator_profiles', [
            'user_id' => $user->id,
            'region' => 'Chișinău',
            'is_approved' => false,
        ]);
    }

    public function test_pending_provider_can_still_authenticate_but_suspended_cannot(): void
    {
        $pending = User::factory()->create([
            'email' => 'pending@example.test',
            'password' => 'password123',
            'status' => 'pending',
            'email_verified_at' => now(),
        ]);
        $pending->roles()->sync([Role::where('name', 'doctor')->value('id')]);

        // Pending accounts are NOT blocked: they proceed to the OTP step and can
        // obtain a token (landing on the "cont în verificare" screen client-side).
        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'pending@example.test',
            'password' => 'password123',
        ])
            ->assertAccepted()
            ->assertJsonPath('login_otp_required', true);

        $this->postJson('/api/v1/auth/verify-login-otp', [
            'email' => 'pending@example.test',
            'code' => $login->json('dev_otp'),
        ])
            ->assertOk()
            ->assertJsonStructure(['token'])
            ->assertJsonPath('user.status', 'pending');

        $suspended = User::factory()->create([
            'email' => 'suspended@example.test',
            'password' => 'password123',
            'status' => 'suspended',
            'email_verified_at' => now(),
        ]);
        $suspended->roles()->sync([Role::where('name', 'doctor')->value('id')]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'suspended@example.test',
            'password' => 'password123',
        ])->assertUnprocessable();
    }

    public function test_admin_can_approve_and_reject_pending_registrations(): void
    {
        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);

        $doctor = User::factory()->create(['status' => 'pending']);
        $doctor->roles()->sync([Role::where('name', 'doctor')->value('id')]);
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'specialty_id' => Specialty::firstOrFail()->id,
            'is_approved' => false,
            'is_available' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/registrations')
            ->assertOk()
            ->assertJsonPath('data.0.id', (string) $doctor->id);

        $this->postJson("/api/v1/admin/users/{$doctor->id}/approve")
            ->assertOk()
            ->assertJsonPath('user.status', 'active');

        $this->assertDatabaseHas('doctor_profiles', [
            'user_id' => $doctor->id,
            'is_approved' => true,
        ]);

        $operator = User::factory()->create(['status' => 'pending']);
        $operator->roles()->sync([Role::where('name', 'operator')->value('id')]);

        $this->postJson("/api/v1/admin/users/{$operator->id}/reject")
            ->assertOk()
            ->assertJsonPath('user.status', 'rejected');
    }
}
