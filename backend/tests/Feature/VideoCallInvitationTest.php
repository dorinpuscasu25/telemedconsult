<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Role;
use App\Models\User;
use App\Models\VideoCallInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VideoCallInvitationTest extends TestCase
{
    use RefreshDatabase;

    public function test_call_rings_only_for_recipient_and_duplicates_reuse_same_invitation(): void
    {
        [$patient, $doctor, $request] = $this->scenario();
        Sanctum::actingAs($doctor);
        $first = $this->postJson($this->inviteUrl($request))->assertOk()->assertJsonPath('call.status', 'ringing')->json('call.id');
        $this->postJson($this->inviteUrl($request))->assertOk()->assertJsonPath('call.id', $first);
        $this->getJson('/api/v1/video-calls/incoming')->assertOk()->assertJsonCount(0, 'calls');
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/video-calls/incoming')->assertOk()->assertJsonPath('calls.0.id', $first)->assertJsonPath('calls.0.caller_name', $doctor->name);
        $this->assertDatabaseCount('video_call_invitations', 1);
        $this->postJson($this->inviteUrl($request))->assertOk()->assertJsonPath('call.id', $first);
    }

    public function test_recipient_can_accept_or_decline_and_caller_can_only_cancel(): void
    {
        [$patient, $doctor, $request] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson($this->inviteUrl($request))->json('call.id');
        $this->postJson($this->respondUrl($id), ['action' => 'accept'])->assertForbidden();
        Sanctum::actingAs($patient);
        $this->postJson($this->respondUrl($id), ['action' => 'cancel'])->assertForbidden();
        $this->postJson($this->respondUrl($id), ['action' => 'accept'])->assertOk()->assertJsonPath('call.status', 'accepted');
        $this->postJson($this->respondUrl($id), ['action' => 'decline'])->assertUnprocessable();
        $this->getJson('/api/v1/video-calls/incoming')->assertJsonCount(0, 'calls');
        Sanctum::actingAs($doctor);
        $id = $this->postJson($this->inviteUrl($request))->json('call.id');
        $this->postJson($this->respondUrl($id), ['action' => 'cancel'])->assertOk()->assertJsonPath('call.status', 'cancelled');
        $this->assertSame('accepted', $request->refresh()->status);
        $this->assertNull($request->cancelled_at);
    }

    public function test_expiry_and_closed_or_reassigned_consultation_stop_the_ring(): void
    {
        $this->freezeTime();
        [$patient, $doctor, $request] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson($this->inviteUrl($request))->json('call.id');
        $this->travel(75)->seconds();
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/video-calls/incoming')->assertJsonCount(0, 'calls');
        $this->postJson($this->respondUrl($id), ['action' => 'accept'])->assertUnprocessable();
        $this->getJson('/api/v1/requests/'.$request->id.'/video/call')->assertJsonPath('call.status', 'missed');
        Sanctum::actingAs($doctor);
        $this->postJson($this->inviteUrl($request))->assertOk();
        $request->update(['status' => 'completed']);
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/video-calls/incoming')->assertJsonCount(0, 'calls');
        $this->getJson('/api/v1/requests/'.$request->id.'/video/call')->assertJsonPath('call.status', 'cancelled');
        $request->update(['status' => 'accepted', 'doctor_id' => $this->user('doctor')->id]);
        $this->getJson('/api/v1/video-calls/incoming')->assertJsonCount(0, 'calls');
    }

    public function test_unrelated_user_cannot_read_or_respond_and_factory_creates_valid_call(): void
    {
        [$patient, $doctor, $request] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson($this->inviteUrl($request))->json('call.id');
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/video-calls/incoming')->assertJsonCount(0, 'calls');
        $this->getJson('/api/v1/requests/'.$request->id.'/video/call')->assertForbidden();
        $this->postJson($this->respondUrl($id), ['action' => 'accept'])->assertForbidden();
        $this->assertModelExists(VideoCallInvitation::factory()->create());
    }

    private function scenario(): array
    {
        $patient = $this->user('patient');
        $doctor = $this->user('doctor');
        $request = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'doctor_started_at' => now()]);
        Notification::fake();

        return [$patient, $doctor, $request];
    }

    private function user(string $role): User
    {
        $role = Role::firstOrCreate(['name' => $role], ['label' => $role]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }

    private function inviteUrl(ConsultationRequest $request): string
    {
        return '/api/v1/requests/'.$request->id.'/video/invite';
    }

    private function respondUrl(int $id): string
    {
        return '/api/v1/video-calls/'.$id.'/respond';
    }
}
