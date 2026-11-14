<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\PerformanceAward;
use App\Models\Role;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PerformanceAwardsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_publishes_immutable_historical_winners_without_transferring_money(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 14));
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $patient = $this->user('patient');
        $item = ConsultationRequest::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'type' => 'video', 'status' => 'completed']);
        Consultation::create(['doctor_id' => $doctor->id, 'patient_id' => $patient->id, 'consultation_request_id' => $item->id, 'status' => 'completed', 'completed_at' => '2026-10-15 12:00:00']);
        Sanctum::actingAs($this->user('admin'));
        $id = $this->postJson('/api/v1/admin/performance-awards', ['period' => '2026-10', 'prizes' => [['position' => 1, 'amount' => 1000]]])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/admin/performance-awards/'.$id.'/publish')->assertOk()->assertJsonPath('data.results.0.doctor_id', $doctor->id)->assertJsonPath('data.results.0.score', 4);
        $this->postJson('/api/v1/admin/performance-awards/'.$id.'/publish')->assertConflict();
        $this->postJson('/api/v1/admin/performance-awards', ['period' => '2026-10', 'prizes' => [['position' => 1, 'amount' => 1]]])->assertConflict();
        $this->assertSame(0, WalletTransaction::count());
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/performance-awards')->assertOk()->assertJsonPath('data.0.results.0.amount_minor', 100000)->assertJsonMissingPath('data.0.ranking_snapshot');
    }

    public function test_only_admin_manages_prizes_and_current_month_cannot_be_published(): void
    {
        Sanctum::actingAs($this->user('doctor'));
        $input = ['period' => now('Europe/Chisinau')->format('Y-m'), 'prizes' => [['position' => 1, 'amount' => 100]]];
        $this->postJson('/api/v1/admin/performance-awards', $input)->assertForbidden();
        Sanctum::actingAs($this->user('admin'));
        $id = $this->postJson('/api/v1/admin/performance-awards', $input)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/admin/performance-awards/'.$id.'/publish')->assertUnprocessable();
        $this->assertSame('draft', PerformanceAward::find($id)->status);
        $this->postJson('/api/v1/admin/performance-awards', ['period' => '2026-10', 'prizes' => [['position' => 1, 'amount' => 100], ['position' => 1, 'amount' => 100]]])->assertUnprocessable();
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/performance-awards')->assertForbidden();
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
