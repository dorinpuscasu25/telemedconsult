<?php

namespace Tests\Feature;

use App\Events\ConversationMessageSent;
use App\Events\ConversationUpdated;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorProfile;
use App\Models\HigoExamMedia;
use App\Models\HigoExamPayload;
use App\Models\MedicalDocument;
use App\Models\Message;
use App\Models\PatientInvestigation;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\PatientRecordAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PatientRecordAccessExpiryTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_context_draft_and_lists_respect_exact_ten_day_deadline(): void
    {
        [$patient, $doctor, $profile, $request, $conversation] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->getJson($this->recordUrl($profile))->assertOk();
        $this->getJson("/api/v1/requests/{$request->id}/conclusion-draft")->assertOk();
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.record_access_expired', false);
        $this->travelTo($request->conclusion_sent_at->copy()->addDays(10));
        $this->getJson($this->recordUrl($profile))->assertForbidden();
        $this->getJson("/api/v1/requests/{$request->id}/conclusion-draft")->assertForbidden();
        $this->getJson("/api/v1/requests/{$request->id}/context")->assertOk()->assertJsonPath('request.record_access_expired', true)->assertJsonPath('request.symptoms', null);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.record_access_expired', true)->assertJsonPath('data.0.symptoms', null)->assertJsonPath('data.0.patient_profile.record_access_expired', true)->assertJsonPath('data.0.objective_data', [])->assertJsonPath('data.0.exam_media', []);
        $this->getJson('/api/v1/conversations')->assertOk()->assertJsonPath('data.0.messages', [])->assertJsonPath('data.0.patient_profile', null)->assertJsonPath('data.0.record_access_expired', true);
        $this->getJson("/api/v1/conversations/{$conversation->id}")->assertOk()->assertJsonPath('data.record_access_expired', true)->assertJsonPath('data.messages', []);
        Sanctum::actingAs($patient);
        $this->getJson($this->recordUrl($profile))->assertOk();
        $this->getJson("/api/v1/conversations/{$conversation->id}")->assertOk();
    }

    public function test_signed_investigation_higo_and_attachment_urls_cannot_extend_access(): void
    {
        [$patient, $doctor, $profile, $request, $conversation] = $this->scenario();
        $this->travelTo($request->conclusion_sent_at->copy()->addDays(10)->subMinutes(5));
        Storage::disk('local')->put('exam.pdf', '%PDF-demo');
        $investigation = PatientInvestigation::create(['patient_profile_id' => $profile->id, 'type' => 'analysis', 'title' => 'Rezultat', 'file_disk' => 'local', 'file_path' => 'exam.pdf', 'performed_at' => now()->toDateString(), 'mime_type' => 'application/pdf']);
        $payload = HigoExamPayload::create(['external_id' => 'expiry-exam', 'received_at' => now(), 'status' => 'mapped', 'consultation_request_id' => $request->id, 'patient_profile_id' => $profile->id, 'raw' => []]);
        $media = HigoExamMedia::create(['higo_media_id' => 'demo-media-1', 'higo_exam_payload_id' => $payload->id, 'consultation_request_id' => $request->id, 'exam_type' => 'THROAT_EXAM', 'kind' => 'image', 'content_type' => 'image/jpeg', 'disk' => 'local', 'path' => 'exam.pdf']);
        $message = Message::create(['conversation_id' => $conversation->id, 'sender_id' => $patient->id, 'body' => 'Fișier', 'type' => 'file', 'metadata' => ['disk' => 'local', 'path' => 'exam.pdf', 'file_name' => 'examen.pdf']]);
        $access = app(PatientRecordAccess::class);
        $doctorUrls = [
            $access->fileUrl('patient-investigation.file', ['investigation' => $investigation->id], $doctor),
            $access->fileUrl('exam-media.show', ['media' => $media->id], $doctor),
            $access->fileUrl('chat-attachment.file', ['message' => $message->id], $doctor),
        ];
        foreach ($doctorUrls as $url) {
            $this->get($url)->assertOk();
        }
        $patientUrl = $access->fileUrl('patient-investigation.file', ['investigation' => $investigation->id], $patient);
        $this->travel(5)->minutes();
        foreach ($doctorUrls as $url) {
            $this->get($url)->assertForbidden();
        }
        $this->get($patientUrl)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_new_consultation_with_same_doctor_reopens_chart_but_not_expired_chat(): void
    {
        [, $doctor, $profile, $request, $conversation] = $this->scenario();
        $this->travelTo($request->conclusion_sent_at->copy()->addDays(10));
        Sanctum::actingAs($doctor);
        $this->getJson($this->recordUrl($profile))->assertForbidden();
        $renewal = ConsultationRequest::create(['patient_id' => $request->patient_id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Consultație nouă']);
        $this->getJson($this->recordUrl($profile))->assertOk();
        $this->getJson("/api/v1/conversations/{$conversation->id}")->assertOk()->assertJsonPath('data.record_access_expired', true)->assertJsonPath('data.messages', []);
        $renewal->update(['status' => 'cancelled']);
        $this->getJson($this->recordUrl($profile))->assertForbidden();
    }

    public function test_doctor_keeps_own_published_pdf_after_chart_expiry_and_cannot_addendum(): void
    {
        [, $doctor, $profile, $request] = $this->scenario();
        Storage::disk('local')->put('published.pdf', '%PDF-published');
        $conclusion = Consultation::create(['consultation_request_id' => $request->id, 'patient_id' => $request->patient_id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'status' => 'completed']);
        $document = MedicalDocument::create(['consultation_id' => $conclusion->id, 'consultation_request_id' => $request->id, 'patient_id' => $request->patient_id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'consultation_summary', 'title' => 'Rezultat', 'status' => 'published', 'published_at' => $request->conclusion_sent_at, 'pdf_path' => 'published.pdf']);
        $this->travelTo($request->conclusion_sent_at->copy()->addDays(10));
        Sanctum::actingAs($doctor);
        $response = $this->getJson("/api/v1/requests/{$request->id}/documents")->assertOk()->assertJsonPath('can_addendum', false);
        $this->get($response->json('documents.0.url'))->assertOk();
        $this->assertSame($document->id, $response->json('documents.0.id'));
    }

    public function test_realtime_events_never_broadcast_chart_body_or_attachment_links(): void
    {
        [$patient, , , , $conversation] = $this->scenario();
        $message = Message::create(['conversation_id' => $conversation->id, 'sender_id' => $patient->id, 'body' => 'Informație medicală privată', 'metadata' => ['disk' => 'local', 'path' => 'private.pdf']]);
        $this->assertSame(['conversation_id' => $conversation->id], (new ConversationUpdated($conversation->load('patientProfile', 'messages')))->broadcastWith());
        $this->assertSame(['conversation_id' => $conversation->id, 'message_id' => $message->id], (new ConversationMessageSent($conversation, $message))->broadcastWith());
    }

    private function scenario(): array
    {
        $this->travelTo(now()->startOfSecond());
        $patient = $this->user('patient');
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        Queue::fake();
        Storage::fake('local');
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Exemplu', 'status' => 'active', 'medical_summary' => 'Rezumat privat', 'medical_record' => ['birth' => ['blood_group' => 'O']]]);
        $request = ConsultationRequest::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'patient_profile_id' => $profile->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'completed', 'symptoms' => 'Declarație privată', 'conclusion_sent_at' => now(), 'completed_at' => now(), 'chat_expires_at' => now()->addDays(10)]);
        $conversation = Conversation::create(['patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'patient_profile_id' => $profile->id, 'consultation_request_id' => $request->id, 'status' => 'open']);

        return [$patient, $doctor, $profile, $request, $conversation];
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }

    private function recordUrl(PatientProfile $profile): string
    {
        return "/api/v1/patient/profiles/{$profile->id}/medical-record";
    }
}
