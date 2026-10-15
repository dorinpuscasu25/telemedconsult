<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PatientChatContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_two_patients_have_separate_conversations_and_read_counts(): void
    {
        [$owner, $doctor, $first] = $this->scenario('Eva');
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Ion', 'last_name' => 'Pop']);
        $second = Conversation::create(['patient_id' => $owner->id, 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        $message = Message::create(['conversation_id' => $first->id, 'sender_id' => $doctor->id, 'body' => 'Mesaj despre Eva']);
        Message::create(['conversation_id' => $second->id, 'sender_id' => $doctor->id, 'body' => 'Mesaj despre Ion']);
        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/conversations?patient_profile='.$first->patient_profile_id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.patient_profile.display_name', 'Eva Pop')->assertJsonPath('data.0.unread_count', 1);
        $this->postJson('/api/v1/conversations/'.$first->id.'/read', ['last_message_id' => $message->id])->assertOk();
        $this->getJson('/api/v1/conversations?patient_profile='.$first->patient_profile_id)->assertJsonPath('data.0.unread_count', 0);
        $this->getJson('/api/v1/conversations?patient_profile='.$patient->id)->assertJsonPath('data.0.unread_count', 1);
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/conversations/'.$first->id)->assertForbidden();
        $this->postJson('/api/v1/conversations/'.$first->id.'/read', ['last_message_id' => $message->id])->assertForbidden();
    }

    public function test_multi_role_doctor_uses_active_role_and_sees_video_request(): void
    {
        [$owner, $doctor, $conversation] = $this->scenario('Eva');
        $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
        $doctor->roles()->sync([$role->id, Role::firstOrCreate(['name' => 'patient'], ['label' => 'Utilizator'])->id]);
        $doctor->forceFill(['active_role_id' => $role->id])->save();
        $request = ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $conversation->patient_profile_id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'new']);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.id', (string) $request->id);
        $this->getJson('/api/v1/doctor/dashboard')->assertOk()->assertJsonPath('pending_requests.0.id', (string) $request->id);
    }

    public function test_message_notifies_recipient_without_medical_text_and_links_exact_conversation(): void
    {
        [$owner, $doctor, $conversation] = $this->scenario('Eva');
        Notification::fake();
        Sanctum::actingAs($owner);
        $this->postJson('/api/v1/conversations/'.$conversation->id.'/messages', ['body' => 'Conținut medical privat'])->assertCreated();
        Notification::assertSentTo($doctor, AppEventNotification::class, function ($notification) use ($doctor, $conversation) {
            $data = $notification->toArray($doctor);
            $this->assertSame('/doctor/chat?conversation='.$conversation->id, $data['url']);
            $this->assertStringNotContainsString('Conținut medical privat', $data['body']);

            return true;
        });
        Notification::assertNotSentTo($owner, AppEventNotification::class);
    }

    public function test_pseudonymized_patient_hides_full_surname_and_identity_in_doctor_chat(): void
    {
        [$owner, $doctor, $conversation] = $this->scenario('Eva');
        $conversation->patientProfile->update(['pseudonymized' => true, 'identity_number' => '1234567890123']);
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/conversations')->assertOk()->assertJsonPath('data.0.patient_profile.display_name', 'Eva P.')->assertJsonMissingPath('data.0.patient_profile.last_name')->assertJsonMissingPath('data.0.patient_profile.identity_number');
    }

    public function test_new_chat_attachments_use_private_storage_and_expiring_links(): void
    {
        Storage::fake('local');
        [$owner, $doctor, $conversation] = $this->scenario('Eva');
        Sanctum::actingAs($owner);
        $response = $this->post('/api/v1/conversations/'.$conversation->id.'/attachments', ['file' => UploadedFile::fake()->image('test.png')], ['Accept' => 'application/json'])->assertCreated();
        $url = $response->json('message.metadata.url');
        $this->assertStringContainsString('signature=', $url);
        $this->assertArrayNotHasKey('path', $response->json('message.metadata'));
        $this->get($url)->assertOk();
        $this->get('/api/v1/chat-attachments/'.$response->json('message.id'))->assertForbidden();
    }

    private function scenario(string $name): array
    {
        $owner = User::factory()->create();
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']));
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => $name, 'last_name' => 'Pop']);
        $conversation = Conversation::create(['patient_id' => $owner->id, 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);

        return [$owner, $doctor, $conversation];
    }
}
