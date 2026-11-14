<?php

namespace Tests\Feature;

use App\Events\ConversationMessageSent;
use App\Events\ConversationUpdated;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VideoDelayNoticeTest extends TestCase
{
    use RefreshDatabase;

    public function test_delay_notice_targets_next_patient_chat_and_repeated_submit_does_not_duplicate(): void
    {
        [$doctor, $current, $next] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->getJson($this->base($current).'/next-patient')->assertOk()->assertJsonPath('next.id', $next->id)->assertJsonPath('next.patient_name', $next->patient->name);
        $currentChat = Conversation::create(['consultation_request_id' => $current->id, 'patient_id' => $current->patient_id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        $payload = ['minutes' => 10, 'next_request_id' => $next->id];
        $this->postJson($this->base($current).'/delay-notice', $payload)->assertOk()->assertJsonPath('next_request_id', $next->id);
        $this->postJson($this->base($current).'/delay-notice', $payload)->assertOk();
        $message = Message::sole();
        $this->assertSame($next->id, Conversation::findOrFail($message->conversation_id)->consultation_request_id);
        $this->assertStringContainsString('10 minute', $message->body);
        $this->assertSame(0, $currentChat->messages()->count());
        $this->assertSame('accepted', $current->fresh()->status);
        $this->assertTrue($next->scheduled_at->equalTo($next->fresh()->scheduled_at));
        Notification::assertCount(1);
        Event::assertDispatchedTimes(ConversationMessageSent::class, 1);
    }

    public function test_patient_other_doctor_and_changed_recipient_cannot_send_notice(): void
    {
        [$doctor, $current, $next] = $this->scenario();
        $payload = ['minutes' => 5, 'next_request_id' => $next->id];
        Sanctum::actingAs($current->patient);
        $this->getJson($this->base($current).'/next-patient')->assertForbidden();
        $this->postJson($this->base($current).'/delay-notice', $payload)->assertForbidden();
        Sanctum::actingAs($this->user('doctor'));
        $this->postJson($this->base($current).'/delay-notice', $payload)->assertForbidden();
        Sanctum::actingAs($doctor);
        $this->postJson($this->base($current).'/delay-notice', ['minutes' => 7, 'next_request_id' => $next->id])->assertUnprocessable();
        $this->postJson($this->base($current).'/delay-notice', ['minutes' => 5, 'next_request_id' => $current->id])->assertUnprocessable();
        $next->update(['status' => 'cancelled']);
        $this->getJson($this->base($current).'/next-patient')->assertOk()->assertJsonPath('next', null);
        $this->postJson($this->base($current).'/delay-notice', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('messages', 0);
    }

    private function scenario(): array
    {
        $this->travelTo(now()->startOfDay()->addHours(10));
        $doctor = $this->user('doctor');
        $base = ['doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted'];
        $current = ConsultationRequest::create($base + ['patient_id' => $this->user('patient')->id, 'scheduled_at' => now()->subMinutes(25), 'doctor_started_at' => now()->subMinutes(25)]);
        $next = ConsultationRequest::create($base + ['patient_id' => $this->user('patient')->id, 'scheduled_at' => now()->addMinutes(15)]);
        ConsultationRequest::create(array_replace($base, ['doctor_id' => $this->user('doctor')->id, 'patient_id' => $this->user('patient')->id, 'scheduled_at' => now()->addMinutes(5)]));
        Event::fake([ConversationMessageSent::class, ConversationUpdated::class]);
        Notification::fake();

        return [$doctor, $current, $next];
    }

    private function user(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => $roleName]);
        $user = User::factory()->create(['active_role_id' => $role->id]);
        $user->roles()->attach($role);

        return $user;
    }

    private function base(ConsultationRequest $request): string
    {
        return '/api/v1/requests/'.$request->id.'/video';
    }
}
