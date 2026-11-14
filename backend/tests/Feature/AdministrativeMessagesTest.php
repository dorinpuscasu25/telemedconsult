<?php

namespace Tests\Feature;

use App\Models\AdministrativeConversation;
use App\Models\AdministrativeMessage;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdministrativeMessagesTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_and_target_exchange_messages_with_private_attachments_and_unread_counts(): void
    {
        Notification::fake();
        Storage::fake('local');
        $admin = $this->user('admin');
        $doctor = $this->user('doctor');
        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/v1/administrative-conversations', ['target_id' => $doctor->id])->assertCreated()->json('id');
        $this->post('/api/v1/administrative-conversations/'.$id.'/messages', ['body' => 'Verifică actele', 'attachments' => [UploadedFile::fake()->create('document.pdf', 10, 'application/pdf')]], ['Accept' => 'application/json'])->assertCreated()->assertJsonMissingPath('message.attachments.0.path');
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/administrative-conversations')->assertOk()->assertJsonPath('data.0.unread_count', 1);
        $url = $this->getJson('/api/v1/administrative-conversations/'.$id)->assertOk()->json('messages.data.0.attachments.0.url');
        $this->get($url)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->getJson('/api/v1/administrative-conversations')->assertJsonPath('data.0.unread_count', 0);
        $this->postJson('/api/v1/administrative-conversations/'.$id.'/messages', ['body' => 'Am încărcat documentul.'])->assertCreated();
        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/administrative-conversations')->assertJsonPath('data.0.unread_count', 1);
        $this->getJson('/api/v1/administrative-conversations/'.$id)->assertOk()->assertJsonCount(2, 'messages.data');
        $this->assertSame(0, Conversation::count());
        $this->assertSame(0, ConsultationRequest::count());
    }

    public function test_other_provider_cannot_read_reply_or_obtain_a_file_and_signed_links_expire(): void
    {
        Notification::fake();
        Storage::fake('local');
        $admin = $this->user('admin');
        $target = $this->user('institution');
        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/v1/administrative-conversations', ['target_id' => $target->id])->json('id');
        $this->post('/api/v1/administrative-conversations/'.$id.'/messages', ['attachments' => [UploadedFile::fake()->create('a.pdf', 5, 'application/pdf')]], ['Accept' => 'application/json'])->assertCreated();
        $url = $this->getJson('/api/v1/administrative-conversations/'.$id)->json('messages.data.0.attachments.0.url');
        Sanctum::actingAs($this->user('operator'));
        $this->getJson('/api/v1/administrative-conversations/'.$id)->assertNotFound();
        $this->postJson('/api/v1/administrative-conversations/'.$id.'/messages', ['body' => 'Nu'])->assertNotFound();
        $this->getJson('/api/v1/administrative-conversations')->assertJsonCount(0, 'data');
        $this->get($url.'&viewer='.$target->id)->assertForbidden();
        $this->travel(6)->minutes();
        $this->get($url)->assertForbidden();
    }

    public function test_patient_is_excluded_and_invalid_files_do_not_create_messages(): void
    {
        Storage::fake('local');
        $admin = $this->user('admin');
        $patient = $this->user('patient');
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/administrative-conversations')->assertForbidden();
        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/administrative-conversations', ['target_id' => $patient->id])->assertForbidden();
        $target = $this->user('operator');
        $id = $this->postJson('/api/v1/administrative-conversations', ['target_id' => $target->id])->json('id');
        $this->post('/api/v1/administrative-conversations/'.$id.'/messages', ['attachments' => [UploadedFile::fake()->create('unsafe.svg', 2, 'image/svg+xml')]], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertSame(0, AdministrativeMessage::count());
        $this->assertSame([], Storage::disk('local')->allFiles('administrative-messages'));
        $this->postJson('/api/v1/administrative-conversations', ['target_id' => $target->id])->assertJsonPath('id', $id);
        $this->assertSame(1, AdministrativeConversation::count());
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
