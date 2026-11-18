<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\User;
use App\Models\WithdrawalRequest;
use App\Services\PlatformConfig;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PayoutRequestWindowTest extends TestCase
{
    use RefreshDatabase;

    public function test_stats_and_withdrawal_use_the_configured_inclusive_window_in_chisinau_timezone(): void
    {
        Notification::fake();
        $config = app(PlatformConfig::class);
        $config->upsert('payout.request_day_start', 18);
        $config->upsert('payout.request_day_end', 20);
        $doctor = $this->doctor();
        Sanctum::actingAs($doctor);
        $this->travelTo(CarbonImmutable::parse('2026-11-17T21:59:00Z'));
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.payout_window.open', false)->assertJsonPath('summary.payout_window.today', '2026-11-17');
        $this->travelTo(CarbonImmutable::parse('2026-11-17T22:00:00Z'));
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.payout_window.open', true)->assertJsonPath('summary.payout_window.today', '2026-11-18')->assertJsonPath('summary.payout_window.start_day', 18)->assertJsonPath('summary.payout_window.end_day', 20)->assertJsonPath('summary.payout_window.timezone', 'Europe/Chisinau');
        $this->postJson('/api/v1/doctor/withdrawals', ['source' => 'platform', 'amount' => 500])->assertCreated();
        $this->travelTo(CarbonImmutable::parse('2026-11-20T21:59:00Z'));
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.payout_window.open', true);
        $this->travelTo(CarbonImmutable::parse('2026-11-20T22:00:00Z'));
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.payout_window.open', false);
        $this->postJson('/api/v1/doctor/withdrawals', ['source' => 'platform', 'amount' => 500])->assertUnprocessable()->assertJsonPath('message', 'Cererile de retragere de la platformă pot fi depuse în zilele 18–20 ale lunii (ora Chișinăului).');
        $this->assertSame(1, WithdrawalRequest::count());
    }

    public function test_invalid_days_or_reversed_window_are_rejected_before_other_settings_are_written(): void
    {
        $adminRole = Role::firstOrCreate(['name' => 'admin'], ['label' => 'Admin']);
        $admin = User::factory()->create(['status' => 'active', 'active_role_id' => $adminRole->id]);
        $admin->roles()->attach($adminRole);
        Sanctum::actingAs($admin);
        $originalVideoPrice = app(PlatformConfig::class)->number('video.default_price');
        foreach ([0, 32, 1.5, 'invalid'] as $day) {
            $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'payout.request_day_start', 'value' => $day], ['key' => 'video.default_price', 'value' => 777]]])->assertUnprocessable()->assertJsonValidationErrors('settings');
        }
        $this->assertSame($originalVideoPrice, app(PlatformConfig::class)->number('video.default_price'));
        $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'payout.request_day_start', 'value' => 18], ['key' => 'payout.request_day_end', 'value' => 20]]])->assertOk();
        $this->putJson('/api/v1/admin/settings', ['settings' => [['key' => 'payout.request_day_end', 'value' => 17]]])->assertUnprocessable()->assertJsonValidationErrors('settings');
        $this->assertSame(20.0, app(PlatformConfig::class)->number('payout.request_day_end'));
    }

    public function test_requests_to_institution_are_independent_of_platform_window(): void
    {
        Notification::fake();
        app(PlatformConfig::class)->upsert('payout.request_day_start', 18);
        app(PlatformConfig::class)->upsert('payout.request_day_end', 20);
        $this->travelTo(CarbonImmutable::parse('2026-11-05T12:00:00Z'));
        $doctor = $this->doctor();
        $institution = MedicalInstitution::create(['name' => 'Instituție de test', 'status' => 'active', 'doctor_share_percent' => 60]);
        $doctor->doctorProfile->update(['medical_institution_id' => $institution->id]);
        $request = ConsultationRequest::where('doctor_id', $doctor->id)->firstOrFail();
        InstitutionEarning::create(['medical_institution_id' => $institution->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $request->id, 'gross_amount_minor' => 250000, 'provider_amount_minor' => 200000, 'doctor_share_percent' => 60, 'doctor_amount_minor' => 120000, 'institution_amount_minor' => 80000]);
        Sanctum::actingAs($doctor->fresh());
        $this->postJson('/api/v1/doctor/withdrawals', ['source' => 'institution', 'institution_id' => $institution->id, 'amount' => 500])->assertCreated();
        $this->assertSame('institution', WithdrawalRequest::firstOrFail()->payer);
    }

    private function doctor(): User
    {
        $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
        $doctor = User::factory()->create(['status' => 'active', 'active_role_id' => $role->id]);
        $doctor->roles()->attach($role);
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        ConsultationRequest::create(['patient_id' => User::factory()->create()->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'payment_status' => 'captured', 'provider_amount_minor' => 200000, 'symptoms' => 'Test']);

        return $doctor;
    }
}
