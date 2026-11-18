<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorProfile;
use App\Models\DoctorReview;
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

    public function test_published_result_is_available_everywhere_before_review_and_low_rating_does_not_pay_twice(): void
    {
        Storage::fake('local');
        [$patient, $doctor, $request, $profile, $document] = $this->completed();
        Sanctum::actingAs($patient);
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('result_locked', false)->assertJsonPath('review_required', false)->assertJsonPath('can_review', true)->assertJsonCount(1, 'documents');
        $this->getJson('/api/v1/patient/profiles/'.$profile->id.'/medical-record')->assertOk()->assertJsonPath('consultations.0.result_locked', false)->assertJsonPath('consultations.0.diagnosis', 'Diagnostic privat')->assertJsonCount(1, 'consultations.0.documents');
        $export = $this->getJson('/api/v1/patient/profiles/'.$profile->id.'/export')->assertOk()->assertJsonCount(1, 'consultations')->assertJsonCount(1, 'documents');
        $this->assertArrayNotHasKey('conclusion_draft', $export->json('consultation_requests.0'));
        $url = URL::temporarySignedRoute('medical-document.file', now()->addMinutes(15), ['document' => $document->id]);
        $this->get($url)->assertOk();
        $conversation = Conversation::create(['consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'status' => 'open']);
        $data = $this->getJson('/api/v1/conversations')->assertOk()->json('data.0.consultation_request');
        $this->assertArrayNotHasKey('conclusion_draft', $data);
        $this->travel(5)->days();
        $this->assertSame(0, app(ConsultationSettlement::class)->settleDue()['closed']);
        $this->assertSame('captured', $request->fresh()->payment_status);
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

    public function test_doctor_can_read_published_result_and_tampered_viewer_is_rejected(): void
    {
        Storage::fake('local');
        [, $doctor, $request] = $this->completed();
        Sanctum::actingAs($doctor);
        $response = $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonCount(1, 'documents');
        $url = $response->json('documents.0.url');
        $this->get($url)->assertOk();
        $this->get(str_replace('viewer='.$doctor->id, 'viewer=9999', $url))->assertForbidden();
    }

    public function test_payment_at_publication_and_optional_review_do_not_close_free_monitoring(): void
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

    public function test_separate_reviews_reward_ten_points_each_once_even_after_editing_or_recreating_review(): void
    {
        Storage::fake('local');
        [$patient, , $request] = $this->completed();
        $request->update(['operator_id' => $this->user('operator')->id]);
        Sanctum::actingAs($patient);
        $payload = ['provider_type' => 'doctor', 'rating' => 1, 'comment' => 'Experiență dificilă'];
        $this->postJson('/api/v1/requests/'.$request->id.'/review', $payload)->assertCreated()->assertJsonPath('bonus_points_awarded', 10);
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('review_providers.doctor', false)->assertJsonPath('review_providers.operator', true);
        $this->postJson('/api/v1/requests/'.$request->id.'/review', [...$payload, 'rating' => 4])->assertCreated()->assertJsonPath('bonus_points_awarded', 0);
        $this->postJson('/api/v1/requests/'.$request->id.'/review', [...$payload, 'provider_type' => 'operator'])->assertCreated()->assertJsonPath('bonus_points_awarded', 10);
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('can_review', false)->assertJsonCount(1, 'documents');
        DoctorReview::where('consultation_request_id', $request->id)->delete();
        $this->postJson('/api/v1/requests/'.$request->id.'/review', $payload)->assertCreated()->assertJsonPath('bonus_points_awarded', 0);
        $this->assertSame(2000, (int) Wallet::where('user_id', $patient->id)->where('type', 'points')->value('balance_minor'));
        $this->assertSame(2, WalletTransaction::where('user_id', $patient->id)->where('type', 'review_bonus')->count());
        $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('points_wallet.balance', 20);
        Sanctum::actingAs($this->user('admin'));
        $issued = $this->getJson('/api/v1/admin/financial')->assertOk()->json('bonus_report.issued');
        $reviewBonus = collect($issued)->firstWhere('type', 'review_bonus');
        $this->assertEquals(20, $reviewBonus['amount']);
        $this->assertSame(2, $reviewBonus['count']);
    }

    public function test_scheduler_settles_legacy_published_result_without_review_once(): void
    {
        Storage::fake('local');
        [, $doctor, $request] = $this->completed(settle: false);
        $this->assertSame(1, app(ConsultationSettlement::class)->settleDue()['closed']);
        $this->assertSame(0, app(ConsultationSettlement::class)->settleDue()['closed']);
        $this->assertSame('captured', $request->fresh()->payment_status);
        $this->assertSame(8500, (int) Wallet::where('user_id', $doctor->id)->where('type', 'real')->value('balance_minor'));
    }

    private function completed(bool $settle = true): array
    {
        $patient = $this->user('patient');
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Test']);
        $request = ConsultationRequest::create(['patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'completed', 'completed_at' => now(), 'conclusion_sent_at' => now(), 'amount_minor' => 10000, 'provider_amount_minor' => 8500, 'platform_fee_minor' => 1500, 'payment_status' => 'held', 'conclusion_draft' => ['diag' => 'Diagnostic privat']]);
        $consultation = Consultation::create(['patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $request->id, 'status' => 'completed', 'diagnosis' => 'Diagnostic privat']);
        Storage::disk('local')->put('result.pdf', 'PDF');
        $document = MedicalDocument::create(['consultation_id' => $consultation->id, 'consultation_request_id' => $request->id, 'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'consultation_summary', 'title' => 'Rezultat', 'status' => 'published', 'pdf_path' => 'result.pdf', 'published_at' => now()]);
        if ($settle) {
            app(ConsultationSettlement::class)->close($request);
        }

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
