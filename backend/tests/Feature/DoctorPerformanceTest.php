<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorProfile;
use App\Models\DoctorReview;
use App\Models\Role;
use App\Models\User;
use App\Services\DoctorPerformance;
use App\Services\PlatformConfig;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorPerformanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_and_admin_see_the_same_score_and_explained_components(): void
    {
        $this->freezeTime();
        $doctor = $this->user('doctor');
        $patient = $this->user('patient');
        DoctorProfile::create(['user_id' => $doctor->id, 'rating' => 4.5, 'is_approved' => true]);
        foreach ([now(), now(), now()->subMonth()] as $date) {
            $request = ConsultationRequest::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'type' => 'video', 'status' => 'completed', 'doctor_response_minutes' => 20, 'doctor_responded_at' => now()]);
            DoctorReview::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'consultation_request_id' => $request->id, 'rating' => 5])->forceFill(['created_at' => $date])->save();
            Consultation::create(['consultation_request_id' => $request->id, 'doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'status' => 'completed', 'completed_at' => $date]);
        }
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/doctor/dashboard')->assertOk()->assertJsonPath('summary.performance.score', 229.5)
            ->assertJsonPath('summary.performance.components.current_month', 8)
            ->assertJsonPath('summary.performance.components.previous_consultations', 1.5)
            ->assertJsonPath('summary.performance.components.rating', 125)
            ->assertJsonPath('summary.performance.components.response', 95);
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.performance.score', 229.5);
        Sanctum::actingAs($this->user('admin'));
        $this->getJson('/api/v1/admin/top-doctors')->assertOk()->assertJsonPath('data.0.score', 229.5);
    }

    public function test_missing_response_data_is_explicit_and_never_exposes_another_doctors_data(): void
    {
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id]);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/doctor/dashboard')->assertOk()->assertJsonPath('summary.performance.response_uses_default', true)->assertJsonPath('summary.performance.average_response_minutes', null);
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/doctor/dashboard')->assertForbidden();
    }

    public function test_first_doctor_reaction_is_recorded_once_and_later_completion_does_not_replace_it(): void
    {
        $this->freezeTime();
        $doctor = $this->user('doctor');
        $patient = $this->user('patient');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $item = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'new']);
        $chat = Conversation::create(['consultation_request_id' => $item->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        $this->travel(10)->minutes();
        Sanctum::actingAs($doctor);
        $this->postJson("/api/v1/requests/{$item->id}/accept")->assertOk();
        $this->assertSame(10, (int) $item->fresh()->doctor_response_minutes);
        $this->travel(30)->minutes();
        $this->postJson("/api/v1/conversations/{$chat->id}/messages", ['body' => 'Bună ziua'])->assertCreated();
        $this->postJson("/api/v1/requests/{$item->id}/complete", ['higo_status' => 'not_performed', 'diagnosis' => 'Diagnostic'])->assertOk();
        $this->assertSame(10, (int) $item->fresh()->doctor_response_minutes);
        $this->getJson('/api/v1/doctor/stats')->assertOk()->assertJsonPath('summary.performance.components.response', 100);
        $this->getJson('/api/v1/doctor/ranking')->assertOk()->assertJsonPath('own_position', 1)->assertJsonMissingPath('data.0.email')->assertJsonMissingPath('data.0.wallet');
    }

    public function test_configured_weights_and_ten_minute_response_buckets_are_shared_with_ranking(): void
    {
        $doctor = $this->user('doctor');
        $profile = DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $item = ConsultationRequest::create(['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'accepted', 'doctor_response_minutes' => 11, 'doctor_responded_at' => now()]);
        $service = app(DoctorPerformance::class);
        $this->assertEquals(95, $service->forDoctor($profile)['components']['response']);
        $item->update(['doctor_response_minutes' => 210]);
        $this->assertEquals(0, $service->forDoctor($profile)['components']['response']);
        $item->update(['doctor_response_minutes' => 20]);
        app(PlatformConfig::class)->upsert('performance.response_decrement', 10, 'performance', 'number');
        $this->assertEquals(90, $service->forDoctor($profile)['components']['response']);
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/doctor/ranking')->assertForbidden();
    }

    public function test_rating_sums_follow_moldova_month_boundaries_and_exclude_future_months(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-14T12:00:00Z'));
        $doctor = $this->user('doctor');
        $profile = DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $patient = $this->user('patient');
        foreach (['2026-10-31 21:30:00' => 2, '2026-10-31 22:30:00' => 5, '2026-11-30 22:30:00' => 4] as $at => $rating) {
            $item = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed']);
            DoctorReview::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $item->id, 'rating' => $rating])->forceFill(['created_at' => $at])->save();
        }
        $score = app(DoctorPerformance::class)->forDoctor($profile);
        $this->assertSame(5, $score['current_rating_sum']);
        $this->assertSame(2, $score['previous_rating_sum']);
        $this->assertEquals(60, $score['components']['rating']);
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }
}
