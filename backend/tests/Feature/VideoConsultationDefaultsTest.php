<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VideoConsultationDefaultsTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_doctor_profiles_default_to_500_mdl_and_ten_minutes(): void
    {
        $profile = DoctorProfile::create(['user_id' => User::factory()->create()->id]);
        $this->assertSame(500, $profile->fresh()->video_price);
        $this->assertSame(10, $profile->fresh()->video_duration_minutes);
    }

    public function test_platform_overrides_apply_to_new_profiles_but_explicit_doctor_settings_are_preserved(): void
    {
        app(PlatformConfig::class)->upsert('video.default_price', 650, 'video', 'number');
        app(PlatformConfig::class)->upsert('video.default_duration_minutes', 20, 'video', 'number');
        $default = DoctorProfile::create(['user_id' => User::factory()->create()->id]);
        $custom = DoctorProfile::create(['user_id' => User::factory()->create()->id, 'video_price' => 0, 'video_duration_minutes' => 15]);
        $this->assertSame(650, $default->fresh()->video_price);
        $this->assertSame(20, $default->fresh()->video_duration_minutes);
        $this->assertSame(0, $custom->fresh()->video_price);
        $this->assertSame(15, $custom->fresh()->video_duration_minutes);
    }

    public function test_catalog_and_quote_use_same_fallback_for_legacy_null_video_price(): void
    {
        $doctor = User::factory()->create();
        $profile = DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $profile->update(['video_price' => null]);
        $this->getJson('/api/v1/catalog/doctors')->assertOk()
            ->assertJsonPath('data.0.video_price', 500)->assertJsonPath('data.0.video_duration_minutes', 10);
        $owner = User::factory()->create();
        $owner->roles()->attach(Role::firstOrCreate(['name' => 'patient'], ['label' => 'Pacient']));
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Ana', 'last_name' => 'Test', 'status' => 'active', 'active_until' => now()->addYear()]);
        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/requests/preview', ['patient_profile_id' => $patient->id, 'consultation_kind' => 'video', 'doctor_id' => $doctor->id])
            ->assertOk()->assertJsonPath('cost.total', 500);
    }
}
