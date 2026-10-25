<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\MedicalInstitutionInvitation;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Models\WithdrawalRequest;
use App\Notifications\InstitutionInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MedicalInstitutionTest extends TestCase
{
    use RefreshDatabase;

    private Specialty $specialty;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->specialty = Specialty::create(['name' => 'Cardiologie', 'slug' => 'cardiologie']);
    }

    public function test_admin_creates_institution_with_manager_who_can_open_the_dashboard(): void
    {
        Sanctum::actingAs($this->userWithRole('admin'));

        $response = $this->postJson('/api/v1/admin/institutions', [
            'name' => 'Clinica Sănătatea',
            'doctor_share_percent' => 65,
            'manager_name' => 'Ana Manager',
            'manager_email' => 'manager@clinica.test',
        ])->assertCreated();

        $password = $response->json('generated_password');
        $this->assertIsString($password);
        $manager = User::where('email', 'manager@clinica.test')->firstOrFail();
        $this->assertTrue($manager->hasRole('institution'));
        $this->assertSame('Clinica Sănătatea', $manager->managedInstitution()?->name);

        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/dashboard')
            ->assertOk()
            ->assertJsonPath('institution.name', 'Clinica Sănătatea')
            ->assertJsonPath('summary.doctors_count', 0);
    }

    public function test_only_institution_managers_reach_the_institution_panel(): void
    {
        Sanctum::actingAs($this->userWithRole('doctor'));
        $this->getJson('/api/v1/institution/dashboard')->assertForbidden();

        [$institution, $manager] = $this->institution();
        $institution->update(['status' => 'suspended']);
        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/dashboard')->assertForbidden();
    }

    public function test_manager_creates_an_approved_doctor_account_with_generated_password(): void
    {
        [$institution, $manager] = $this->institution();
        Sanctum::actingAs($manager);

        $response = $this->postJson('/api/v1/institution/doctors', [
            'name' => 'Dr. Ion Popa',
            'email' => 'ion@clinica.test',
            'specialty_id' => $this->specialty->id,
            'doctor_share_percent' => 80,
        ])->assertCreated();

        $doctor = User::where('email', 'ion@clinica.test')->firstOrFail();
        $this->assertTrue($doctor->hasRole('doctor'));
        $this->assertNotNull($doctor->email_verified_at);
        $this->assertSame($institution->id, $doctor->doctorProfile->medical_institution_id);
        $this->assertTrue($doctor->doctorProfile->is_approved);
        $this->assertSame(80.0, $doctor->doctorProfile->institution_share_percent);
        $this->assertTrue(\Hash::check($response->json('generated_password'), $doctor->password));

        $this->postJson('/api/v1/institution/doctors', [
            'name' => 'Duplicat', 'email' => 'ion@clinica.test', 'specialty_id' => $this->specialty->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_new_doctor_accepts_invitation_and_gets_an_account(): void
    {
        Notification::fake();
        [$institution, $manager] = $this->institution();
        Sanctum::actingAs($manager);

        $url = $this->postJson('/api/v1/institution/invitations', [
            'email' => 'nou@medic.test',
            'name' => 'Dr. Nou',
            'specialty_id' => $this->specialty->id,
        ])->assertCreated()->json('invitation_url');
        $token = Str::afterLast($url, '/');

        Notification::assertSentTo(new AnonymousNotifiable, InstitutionInvitationNotification::class, fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'nou@medic.test');

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/institution-invitations/'.$token)
            ->assertOk()
            ->assertJsonPath('invitation.institution', $institution->name)
            ->assertJsonPath('invitation.account_exists', false);

        $this->postJson('/api/v1/institution-invitations/'.$token.'/accept', [
            'name' => 'Dr. Nou Medic',
            'password' => 'parola-sigura-1',
            'password_confirmation' => 'parola-sigura-1',
        ])->assertCreated()->assertJsonStructure(['token']);

        $doctor = User::where('email', 'nou@medic.test')->firstOrFail();
        $this->assertSame($institution->id, $doctor->doctorProfile->medical_institution_id);
        $this->assertSame('accepted', MedicalInstitutionInvitation::firstOrFail()->status);
        $this->postJson('/api/v1/institution-invitations/'.$token.'/accept', [
            'name' => 'Altcineva', 'password' => 'parola-sigura-1', 'password_confirmation' => 'parola-sigura-1',
        ])->assertStatus(410);
    }

    public function test_existing_doctor_must_be_signed_in_to_accept(): void
    {
        Notification::fake();
        [$institution, $manager] = $this->institution();
        $doctor = $this->doctor();
        Sanctum::actingAs($manager);
        $token = Str::afterLast($this->postJson('/api/v1/institution/invitations', ['email' => $doctor->email])->assertCreated()->json('invitation_url'), '/');

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/institution-invitations/'.$token.'/accept')->assertUnauthorized();

        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/institution-invitations/'.$token.'/accept')->assertOk();
        $this->assertSame($institution->id, $doctor->doctorProfile()->first()->medical_institution_id);
    }

    public function test_doctor_of_another_institution_cannot_be_invited(): void
    {
        [, $manager] = $this->institution();
        [$other] = $this->institution('Altă clinică');
        $doctor = $this->doctor($other);

        Sanctum::actingAs($manager);
        $this->postJson('/api/v1/institution/invitations', ['email' => $doctor->email])->assertUnprocessable();
    }

    public function test_completed_consultation_splits_the_net_amount_and_doctor_is_paid_by_the_institution(): void
    {
        [$institution, $manager] = $this->institution(share: 70);
        $doctor = $this->doctor($institution);
        $request = $this->consultationFor($doctor, amountMinor: 100000);

        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();

        $request->refresh();
        $earning = InstitutionEarning::firstOrFail();
        $this->assertSame($institution->id, $earning->medical_institution_id);
        $this->assertSame((int) $request->provider_amount_minor, $earning->provider_amount_minor);
        $this->assertSame((int) round($request->provider_amount_minor * 0.7), $earning->doctor_amount_minor);
        $this->assertSame($earning->provider_amount_minor - $earning->doctor_amount_minor, $earning->institution_amount_minor);

        // Medicul vede partea lui la instituție; soldul la platformă nu include consultația.
        $stats = $this->getJson('/api/v1/doctor/stats')->assertOk();
        $this->assertSame($earning->doctor_amount_minor / 100, $stats->json('institution.balance'));
        $this->assertEquals(0, $stats->json('summary.available_balance'));

        $this->postJson('/api/v1/doctor/withdrawals', ['amount' => $earning->doctor_amount_minor / 100 + 1])->assertUnprocessable();
        $withdrawalId = $this->postJson('/api/v1/doctor/withdrawals', ['amount' => 100])->assertCreated()->json('withdrawal.id');
        $withdrawal = WithdrawalRequest::findOrFail($withdrawalId);
        $this->assertSame('institution', $withdrawal->payer);

        // Adminul nu procesează cererile plătite de instituție.
        Sanctum::actingAs($this->userWithRole('admin'));
        $this->putJson('/api/v1/admin/withdrawals/'.$withdrawalId, ['status' => 'approved'])->assertForbidden();

        Sanctum::actingAs($manager);
        $this->putJson('/api/v1/institution/withdrawals/'.$withdrawalId, ['status' => 'approved', 'payout_reference' => 'OP-1'])->assertOk();
        $this->assertSame('approved', $withdrawal->fresh()->status);
        $this->getJson('/api/v1/institution/doctors')
            ->assertOk()
            ->assertJsonPath('doctors.0.balance', ($earning->doctor_amount_minor - 10000) / 100);
    }

    public function test_institution_requests_payout_from_platform_and_admin_approves_within_balance(): void
    {
        [$institution, $manager] = $this->institution();
        $institution->update(['iban' => 'MD24AG000225100013104168']);
        $doctor = $this->doctor($institution);
        InstitutionEarning::create([
            'medical_institution_id' => $institution->id,
            'doctor_id' => $doctor->id,
            'consultation_request_id' => $this->consultationFor($doctor, 0)->id,
            'gross_amount_minor' => 100000,
            'provider_amount_minor' => 60000,
            'doctor_share_percent' => 70,
            'doctor_amount_minor' => 42000,
            'institution_amount_minor' => 18000,
        ]);

        Sanctum::actingAs($manager);
        $this->postJson('/api/v1/institution/payouts', ['amount' => 700])->assertUnprocessable();
        $id = $this->postJson('/api/v1/institution/payouts', ['amount' => 600])->assertCreated()->json('withdrawal.id');
        $this->postJson('/api/v1/institution/payouts', ['amount' => 1])->assertUnprocessable();

        $admin = $this->userWithRole('admin');
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/admin/financial')
            ->assertOk()
            ->assertJsonFragment(['beneficiary_type' => 'institution', 'doctor' => $institution->name]);
        $this->putJson('/api/v1/admin/withdrawals/'.$id, ['status' => 'approved', 'approved_amount' => 601])->assertUnprocessable();
        $this->putJson('/api/v1/admin/withdrawals/'.$id, ['status' => 'approved'])->assertOk();

        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/withdrawals')->assertOk()->assertJsonPath('summary.platform_balance', 0);
    }

    public function test_managers_cannot_touch_doctors_or_requests_of_another_institution(): void
    {
        [$institution] = $this->institution();
        [, $otherManager] = $this->institution('Altă clinică');
        $doctor = $this->doctor($institution);
        $withdrawal = WithdrawalRequest::create([
            'user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'payer' => 'institution',
            'amount_minor' => 100, 'currency' => 'MDL', 'iban' => '', 'status' => 'pending',
        ]);

        Sanctum::actingAs($otherManager);
        $this->putJson('/api/v1/institution/doctors/'.$doctor->id, ['doctor_share_percent' => 10])->assertNotFound();
        $this->deleteJson('/api/v1/institution/doctors/'.$doctor->id)->assertNotFound();
        $this->putJson('/api/v1/institution/withdrawals/'.$withdrawal->id, ['status' => 'approved'])->assertNotFound();
    }

    public function test_removed_doctor_becomes_independent_and_keeps_what_the_institution_owes(): void
    {
        [$institution, $manager] = $this->institution();
        $doctor = $this->doctor($institution);

        Sanctum::actingAs($manager);
        $this->deleteJson('/api/v1/institution/doctors/'.$doctor->id)->assertOk();

        $profile = DoctorProfile::where('user_id', $doctor->id)->firstOrFail();
        $this->assertNull($profile->medical_institution_id);
        $this->assertTrue($doctor->fresh()->hasRole('doctor'));
    }

    /**
     * @return array{0: MedicalInstitution, 1: User}
     */
    private function institution(string $name = 'Clinica de test', float $share = 70): array
    {
        $institution = MedicalInstitution::create(['name' => $name, 'doctor_share_percent' => $share, 'status' => 'active']);
        $manager = $this->userWithRole('institution');
        $institution->managers()->attach($manager->id);

        return [$institution, $manager];
    }

    private function doctor(?MedicalInstitution $institution = null): User
    {
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'specialty_id' => $this->specialty->id,
            'is_approved' => true,
            'medical_institution_id' => $institution?->id,
            'institution_joined_at' => $institution ? now() : null,
        ]);

        return $doctor;
    }

    private function consultationFor(User $doctor, int $amountMinor): ConsultationRequest
    {
        $owner = $this->userWithRole('patient');
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Eva', 'last_name' => 'Test', 'birth_date' => '1990-01-01']);
        $providerMinor = (int) round($amountMinor * 0.6);

        return ConsultationRequest::create([
            'patient_id' => $owner->id,
            'patient_profile_id' => $patient->id,
            'doctor_id' => $doctor->id,
            'type' => 'video',
            'consultation_kind' => 'video',
            'status' => 'accepted',
            'payment_status' => $amountMinor > 0 ? 'held' : 'paid',
            'symptoms' => 'Simptome',
            'amount_minor' => $amountMinor,
            'real_amount_minor' => $amountMinor,
            'platform_fee_minor' => $amountMinor - $providerMinor,
            'provider_amount_minor' => $providerMinor,
        ]);
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
