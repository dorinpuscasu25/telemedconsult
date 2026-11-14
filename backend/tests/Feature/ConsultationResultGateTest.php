<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorProfile;
use App\Models\MedicalDocument;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\ConsultationSettlement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationResultGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_result_is_blocked_everywhere_until_low_rating_review_closes_and_pays_once(): void
    {
        Storage::fake('local');
        [$patient, $doctor, $request, $profile, $document] = $this->completed();
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('result_locked', true)->assertJsonCount(0, 'documents');
        $this->getJson('/api/v1/patient/profiles/'.$profile->id.'/medical-record')->assertOk()->assertJsonPath('consultations.0.result_locked', true)->assertJsonPath('consultations.0.diagnosis', null)->assertJsonCount(0, 'consultations.0.documents');
        $export = $this->getJson('/api/v1/patient/profiles/'.$profile->id.'/export')->assertOk()->assertJsonCount(0, 'consultations')->assertJsonCount(0, 'documents');
        $this->assertArrayNotHasKey('conclusion_draft', $export->json('consultation_requests.0'));
        $url = URL::temporarySignedRoute('medical-document.file', now()->addMinutes(15), ['document' => $document->id]);
        $this->get($url)->assertForbidden();
        $conversation = Conversation::create(['consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        $data = $this->getJson('/api/v1/conversations')->assertOk()->json('data.0.consultation_request');
        $this->assertArrayNotHasKey('conclusion_draft', $data);
        $this->travel(5)->days();
        $this->assertSame(0, app(ConsultationSettlement::class)->settleDue()['closed']);
        $this->assertSame('held', $request->fresh()->payment_status);
        $payload = ['rating' => 1, 'comment' => 'Experiență nesatisfăcătoare'];
        $this->postJson('/api/v1/requests/'.$request->id.'/review', $payload)->assertCreated();
        $this->assertSame('captured', $request->fresh()->payment_status);
        $this->assertNotNull($request->fresh()->closed_at);
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('result_locked', false)->assertJsonCount(1, 'documents');
        $this->getJson('/api/v1/patient/profiles/'.$profile->id.'/medical-record')->assertOk()->assertJsonPath('consultations.0.diagnosis', 'Diagnostic privat');
        $this->getJson('/api/v1/patient/profiles/'.$profile->id.'/export')->assertOk()->assertJsonPath('consultations.0.diagnosis', 'Diagnostic privat')->assertJsonCount(1, 'documents');
        $this->postJson('/api/v1/requests/'.$request->id.'/review', $payload)->assertCreated();
        $this->assertSame(1, WalletTransaction::where('type', 'consultation_income')->where('user_id', $doctor->id)->count());
        $this->assertSame(8500, (int) Wallet::where('user_id', $doctor->id)->where('type', 'real')->value('balance_minor'));
    }

    public function test_doctor_can_preview_private_result_but_signed_patient_link_remains_blocked(): void
    {
        Storage::fake('local');
        [, $doctor, $request] = $this->completed();
        Sanctum::actingAs($doctor);
        $response = $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonCount(1, 'documents');
        $url = $response->json('documents.0.url');
        $this->get($url)->assertOk();
        $this->get(str_replace('viewer='.$doctor->id, 'viewer=9999', $url))->assertForbidden();
    }

    public function test_review_closes_payment_but_does_not_close_free_monitoring(): void
    {
        Storage::fake('local');
        [$patient, $doctor, $request] = $this->completed();
        $request->update(['free_chat_until' => now()->addDays(3), 'chat_expires_at' => now()->addDays(10)]);
        $conversation = Conversation::create(['consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/review', ['rating' => 4, 'comment' => 'Consultație efectuată'])->assertCreated();
        $this->getJson('/api/v1/conversations/'.$conversation->id)->assertOk()->assertJsonPath('data.chat.can_write', true);
        $this->assertSame('captured', $request->fresh()->payment_status);
        $this->travel(10)->days();
        $this->getJson('/api/v1/conversations/'.$conversation->id)->assertOk()->assertJsonPath('data.chat.can_write', false)->assertJsonPath('data.chat.can_reactivate', false);
    }

    public function test_paid_monitoring_costs_fifty_mdl_and_cannot_extend_past_ten_days_or_charge_twice(): void
    {
        Storage::fake('local');
        [$patient, $doctor, $request] = $this->completed();
        $request->update(['free_chat_until' => now()->subDays(6), 'chat_expires_at' => now()->addHours(10)]);
        Conversation::create(['consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        $wallet = Wallet::create(['user_id' => $patient->id, 'type' => 'real', 'balance_minor' => 10000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/review', ['rating' => 3, 'comment' => 'Consultație efectuată'])->assertCreated();
        $this->postJson('/api/v1/requests/'.$request->id.'/reactivate-chat')->assertOk();
        $this->assertSame(5000, $wallet->fresh()->balance_minor);
        $this->assertTrue($request->fresh()->chat_reactivated_until->equalTo($request->chat_expires_at));
        $this->postJson('/api/v1/requests/'.$request->id.'/reactivate-chat')->assertUnprocessable();
        $this->assertSame(5000, $wallet->fresh()->balance_minor);
        $this->travel(10)->hours();
        $this->postJson('/api/v1/requests/'.$request->id.'/reactivate-chat')->assertUnprocessable();
        $this->assertSame(1, WalletTransaction::where('type', 'chat_reactivation')->where('user_id', $patient->id)->count());
    }

    private function completed(): array
    {
        $patient = $this->user('patient');
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Test']);
        $request = ConsultationRequest::create(['patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'completed_at' => now(), 'conclusion_sent_at' => now(), 'amount_minor' => 10000, 'provider_amount_minor' => 8500, 'platform_fee_minor' => 1500, 'payment_status' => 'held', 'conclusion_draft' => ['diag' => 'Diagnostic privat']]);
        $consultation = Consultation::create(['patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $request->id, 'status' => 'completed', 'diagnosis' => 'Diagnostic privat']);
        Storage::disk('local')->put('result.pdf', 'PDF');
        $document = MedicalDocument::create(['consultation_id' => $consultation->id, 'consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'consultation_summary', 'title' => 'Rezultat', 'status' => 'published', 'pdf_path' => 'result.pdf', 'published_at' => now()]);

        return [$patient, $doctor, $request, $profile, $document];
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
