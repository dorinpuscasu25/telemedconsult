<?php

namespace Tests\Feature;

use App\Models\Complaint;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Notifications\AppEventNotification;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminNotificationSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Mail::fake();
        Http::preventStrayRequests();
        config(['higo.sync.enabled' => false]);
    }

    public function test_complaint_notification_toggle_is_respected_without_dropping_complaints(): void
    {
        $admin = $this->user('admin');
        $inactive = $this->user('admin');
        $inactive->update(['status' => 'suspended']);
        Sanctum::actingAs($this->user('patient'));
        foreach ([false, true] as $enabled) {
            app(PlatformConfig::class)->upsert('notify_complaints', $enabled);
            $this->postJson('/api/v1/patient/complaints', ['subject' => 'Reclamație de test', 'description' => 'Descriere demonstrativă'])->assertCreated();
            if (! $enabled) {
                Notification::assertNothingSent();
            }
        }
        $this->assertSame(2, Complaint::count());
        Notification::assertSentToTimes($admin, AppEventNotification::class, 1);
        Notification::assertNotSentTo($inactive, AppEventNotification::class);
    }

    public function test_self_registered_and_admin_created_doctors_honor_the_same_toggle(): void
    {
        $admin = $this->user('admin');
        $this->user('doctor');
        $specialty = Specialty::create(['name' => 'Specialitate de test', 'slug' => 'specialitate-test']);
        foreach ([false, true] as $enabled) {
            app(PlatformConfig::class)->upsert('notify_new_doctors', $enabled);
            $this->postJson('/api/v1/auth/register', [
                'name' => 'Medic demonstrativ', 'email' => fake()->unique()->safeEmail(), 'phone' => fake()->unique()->numerify('069######'),
                'password' => 'Password123!', 'password_confirmation' => 'Password123!', 'account_type' => 'doctor', 'specialty_id' => $specialty->id,
            ])->assertCreated();
            Sanctum::actingAs($admin);
            $this->postJson('/api/v1/admin/users', ['name' => 'Medic creat de admin', 'email' => fake()->unique()->safeEmail(), 'password' => 'Password123!', 'roles' => ['doctor'], 'specialty_id' => $specialty->id])->assertCreated();
            if (! $enabled) {
                Notification::assertNothingSent();
            }
        }
        Notification::assertSentToTimes($admin, AppEventNotification::class, 2);
        Notification::assertSentTo($admin, AppEventNotification::class, fn ($notification) => $notification->telegramCategory() === 'requests');
    }

    public function test_doctor_platform_withdrawals_respect_notification_toggle_and_payment_category(): void
    {
        $this->travelTo(now()->startOfMonth()->addDays(4));
        $admin = $this->user('admin');
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        ConsultationRequest::create(['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'payment_status' => 'captured', 'provider_amount_minor' => 200000, 'symptoms' => 'Test']);
        Sanctum::actingAs($doctor);
        foreach ([false, true] as $enabled) {
            app(PlatformConfig::class)->upsert('notify_withdrawals', $enabled);
            $this->postJson('/api/v1/doctor/withdrawals', ['amount' => 500, 'source' => 'platform'])->assertCreated();
            if (! $enabled) {
                Notification::assertNothingSent();
            }
        }
        Notification::assertSentToTimes($admin, AppEventNotification::class, 1);
        Notification::assertSentTo($admin, AppEventNotification::class, fn ($notification) => $notification->telegramCategory() === 'payments');
    }

    public function test_institution_platform_payouts_use_the_same_notification_toggle(): void
    {
        $admin = $this->user('admin');
        $manager = $this->user('institution');
        $institution = MedicalInstitution::create(['name' => 'Instituție demonstrativă', 'status' => 'active', 'iban' => 'MD24AG000225100013104168', 'doctor_share_percent' => 60]);
        $institution->managers()->attach($manager);
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id]);
        $request = ConsultationRequest::create(['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'payment_status' => 'captured', 'symptoms' => 'Test']);
        InstitutionEarning::create(['medical_institution_id' => $institution->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $request->id, 'gross_amount_minor' => 250000, 'provider_amount_minor' => 200000, 'doctor_share_percent' => 60, 'doctor_amount_minor' => 120000, 'institution_amount_minor' => 80000]);
        Sanctum::actingAs($manager);
        foreach ([false, true] as $enabled) {
            app(PlatformConfig::class)->upsert('notify_withdrawals', $enabled);
            $this->postJson('/api/v1/institution/payouts', ['amount' => 500])->assertCreated();
            if (! $enabled) {
                Notification::assertNothingSent();
            }
        }
        Notification::assertSentToTimes($admin, AppEventNotification::class, 1);
        Notification::assertSentTo($admin, AppEventNotification::class, fn ($notification) => $notification->telegramCategory() === 'payments');
    }

    private function user(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => $roleName]);
        $user = User::factory()->create(['status' => 'active', 'active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }
}
