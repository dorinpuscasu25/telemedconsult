<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationPendingLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_pending_direct_doctor_consultation_remains_available_after_old_deadline_and_reply_does_not_accept_it(): void
    {
        [$patient, $doctor, $request, $chat] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.status', 'new')->assertJsonPath('data.0.acceptance_expires_at', null);
        $this->postJson('/api/v1/conversations/'.$chat->id.'/messages', ['body' => 'Am primit mesajul.'])->assertCreated();
        $this->assertSame('new', $request->refresh()->status);
        $this->assertNull($request->acceptance_expires_at);
        $this->getJson('/api/v1/requests/'.$request->id.'/context')->assertOk()->assertJsonPath('request.can_accept', true)->assertJsonPath('request.can_start', false);
        $this->postJson('/api/v1/requests/'.$request->id.'/accept')->assertOk()->assertJsonPath('request.status', 'accepted');
        $this->getJson('/api/v1/requests/'.$request->id.'/context')->assertOk()->assertJsonPath('request.can_accept', false)->assertJsonPath('request.can_start', true);
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/'.$request->id.'/context')->assertOk()->assertJsonPath('request.can_start', false);
    }

    public function test_future_scheduled_direct_request_can_be_accepted_after_legacy_deadline_but_not_started_early(): void
    {
        [, $doctor, $request] = $this->scenario();
        $request->update(['scheduled_at' => now()->addDays(2)]);
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/accept')->assertOk();
        $this->getJson('/api/v1/requests/'.$request->id.'/context')->assertOk()->assertJsonPath('request.can_start', false);
        $this->postJson('/api/v1/requests/'.$request->id.'/start')->assertUnprocessable();
    }

    public function test_old_expired_and_refunded_request_is_never_resurrected_and_explains_closed_chat(): void
    {
        [, $doctor, $request, $chat] = $this->scenario();
        $request->update(['status' => 'expired', 'payment_status' => 'refunded']);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.status', 'expired');
        $this->getJson('/api/v1/conversations/'.$chat->id)->assertOk()
            ->assertJsonPath('data.chat.state', 'closed')->assertJsonPath('data.chat.can_reactivate', false);
        $this->postJson('/api/v1/conversations/'.$chat->id.'/messages', ['body' => 'Salut'])->assertUnprocessable()
            ->assertJsonPath('message', 'Solicitarea a expirat. Creează o solicitare nouă pentru a continua consultația.');
        $this->postJson('/api/v1/requests/'.$request->id.'/accept')->assertUnprocessable();
        $this->assertSame('refunded', $request->refresh()->payment_status);
    }

    public function test_completed_operator_phase_does_not_expire_while_waiting_for_doctor(): void
    {
        [, $doctor, $request] = $this->scenario();
        $request->update(['consultation_kind' => 'with_exam', 'type' => 'doctor', 'operator_accepted_at' => now()->subHours(3), 'objective_data_completed_at' => now()->subHours(2)]);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.status', 'new')->assertJsonPath('data.0.acceptance_expires_at', null);
        $this->postJson('/api/v1/requests/'.$request->id.'/start')->assertOk();
    }

    public function test_operator_assignment_still_times_out_when_no_operator_accepts(): void
    {
        [, $doctor, $request] = $this->scenario();
        $request->update(['consultation_kind' => 'with_exam', 'type' => 'doctor']);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.status', 'no_operator_available');
    }

    public function test_unassigned_pending_video_is_in_doctor_pool_but_accepted_unassigned_requests_are_not(): void
    {
        [, $doctor, $request] = $this->scenario();
        $request->update(['doctor_id' => null]);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonCount(1, 'data');
        $request->update(['status' => 'accepted']);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_only_assigned_doctor_can_explicitly_start_confirmed_consultation_early(): void
    {
        [$patient, $doctor, $request] = $this->scenario();
        $scheduledAt = now()->addDays(2);
        $request->update(['status' => 'accepted', 'scheduled_at' => $scheduledAt]);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => true])->assertForbidden();
        Sanctum::actingAs($this->userWithRole('doctor'));
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => true])->assertForbidden();
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests/'.$request->id.'/context')->assertOk()->assertJsonPath('request.can_start_early', true);
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => false])->assertUnprocessable();
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => 'invalid'])->assertUnprocessable();
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => true])->assertOk();
        $this->assertNotNull($request->refresh()->doctor_started_at);
        $this->assertSame($scheduledAt->getTimestamp(), $request->scheduled_at->getTimestamp());
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/'.$request->id.'/video')->assertOk()->assertJsonPath('available', true);
    }

    public function test_early_start_does_not_bypass_confirmation_or_home_examination(): void
    {
        [, $doctor, $request] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => true])->assertUnprocessable();
        $request->update(['status' => 'accepted', 'consultation_kind' => 'with_exam', 'scheduled_at' => now()->addDay()]);
        $this->postJson('/api/v1/requests/'.$request->id.'/start', ['start_early' => true])->assertUnprocessable();
        $this->assertNull($request->refresh()->doctor_started_at);
    }

    private function scenario(): array
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        $request = ConsultationRequest::create([
            'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video',
            'status' => 'new', 'payment_status' => 'none', 'acceptance_expires_at' => now()->subHours(3), 'created_at' => now()->subHours(4),
        ]);
        $chat = Conversation::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $request->id, 'status' => 'open']);

        return [$patient, $doctor, $request, $chat];
    }

    private function userWithRole(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }
}
