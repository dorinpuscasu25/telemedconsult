<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\MedicalDocument;
use App\Models\Message;
use App\Models\PatientProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RepairPatientContextsTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_public_attachments_are_copied_before_public_copy_is_removed(): void
    {
        Storage::fake('public');
        Storage::fake('local');
        $owner = User::factory()->create();
        $chat = Conversation::create(['patient_id' => $owner->id]);
        $path = 'chat-attachments/test.pdf';
        Storage::disk('public')->put($path, 'test bytes');
        $message = Message::create(['conversation_id' => $chat->id, 'sender_id' => $owner->id, 'type' => 'file', 'body' => 'Test', 'metadata' => ['path' => $path, 'url' => '/storage/'.$path, 'mime_type' => 'application/pdf']]);
        $this->artisan('patients:repair-contexts')->assertSuccessful();
        $this->assertSame('test bytes', Storage::disk('local')->get($path));
        Storage::disk('public')->assertMissing($path);
        $this->assertStringContainsString('signature=', $message->fresh()->metadata['url']);
        $this->artisan('patients:repair-contexts')->assertSuccessful();
        $this->assertSame('test bytes', Storage::disk('local')->get($path));
    }

    public function test_only_unambiguous_legacy_links_are_repaired_and_repeat_is_safe(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $profile = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Eva', 'last_name' => 'Pop']);
        $request = ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'completed']);
        $chat = Conversation::create(['patient_id' => $owner->id, 'consultation_request_id' => $request->id]);
        $unknown = Conversation::create(['patient_id' => $other->id, 'consultation_request_id' => $request->id]);
        $consultation = Consultation::create(['patient_id' => $owner->id, 'patient_profile_id' => $profile->id, 'consultation_request_id' => $request->id, 'status' => 'completed', 'doctor_id' => $other->id]);
        $document = MedicalDocument::create(['patient_id' => $owner->id, 'consultation_id' => $consultation->id, 'title' => 'Document vechi']);
        $this->artisan('patients:repair-contexts')->assertSuccessful();
        $this->assertSame($profile->id, $chat->fresh()->patient_profile_id);
        $this->assertSame($profile->id, $document->fresh()->patient_profile_id);
        $this->assertSame($request->id, $document->fresh()->consultation_request_id);
        $this->assertNull($unknown->fresh()->patient_profile_id);
        $this->artisan('patients:repair-contexts')->expectsOutput('Legături refăcute: 0')->assertSuccessful();
    }
}
