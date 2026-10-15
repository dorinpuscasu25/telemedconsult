<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\MedicalDocument;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationDocumentsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_finalization_publishes_private_pdf_preserves_separate_sections_and_is_not_repeatable(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $payload = ['diagnosis' => 'Diagnostic de test', 'current_illness_history' => 'Debut în urmă cu două zile', 'objective_exam' => 'Observații confirmate de medic'];
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', $payload)->assertOk();
        $document = MedicalDocument::firstOrFail();
        $this->assertSame($request->patient_profile_id, $document->patient_profile_id);
        $this->assertSame($request->id, $document->consultation_request_id);
        $this->assertSame('published', $document->status);
        $this->assertSame('Debut în urmă cu două zile', $document->content_snapshot['sections']['Istoricul bolii actuale']);
        $this->assertSame('Simptome declarate', $document->content_snapshot['sections']['Acuze / simptome']);
        $this->assertStringStartsWith('%PDF', Storage::disk('local')->get($document->pdf_path));
        $this->assertArrayNotHasKey('medical_record', $document->content_snapshot);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', $payload)->assertUnprocessable();
        $this->assertSame(1, Consultation::count());
        $this->assertSame(1, MedicalDocument::count());
    }

    public function test_patient_can_update_both_sections_before_publication_but_not_after(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/anamnesis', ['symptoms' => 'Acuze actualizate', 'current_illness_history' => 'Istoric actualizat'])->assertOk();
        $this->assertSame('Istoric actualizat', $request->fresh()->current_illness_history);
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        Sanctum::actingAs($request->patient);
        $this->postJson('/api/v1/requests/'.$request->id.'/anamnesis', ['symptoms' => 'Schimbare după publicare'])->assertUnprocessable();
        $this->assertSame('Acuze actualizate', $request->fresh()->symptoms);
    }

    public function test_preview_has_no_financial_or_document_side_effects(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $response = $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => 'Test']);
        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->assertSame('accepted', $request->fresh()->status);
        $this->assertSame(0, MedicalDocument::count());
    }

    public function test_addendum_is_linked_to_immutable_original_and_rejected_at_deadline(): void
    {
        $this->freezeTime();
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        $base = MedicalDocument::firstOrFail();
        $original = Storage::disk('local')->get($base->pdf_path);
        $this->travel(13)->days();
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/addendum', ['recommendations' => 'Recomandări suplimentare'])->assertCreated()->assertJsonPath('document.parent_document_id', $base->id);
        $this->assertSame($original, Storage::disk('local')->get($base->pdf_path));
        $this->travel(1)->days();
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/addendum', ['recommendations' => 'Prea târziu'])->assertUnprocessable();
        $this->assertSame(2, MedicalDocument::count());
    }

    public function test_pdf_urls_are_only_issued_to_participants_and_unsigned_access_is_denied(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        $id = MedicalDocument::first()->id;
        $this->get('/api/v1/medical-documents/'.$id.'/file')->assertForbidden();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertForbidden();
        Sanctum::actingAs($request->patient);
        $url = $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->json('documents.0.url');
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_signature_snapshot_and_patient_name_do_not_change_after_publication(): void
    {
        $request = $this->scenario();
        $request->patientProfile->update(['pseudonymized' => true]);
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/doctor/signature', ['signature' => UploadedFile::fake()->image('parafa.png', 400, 100)])->assertOk();
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        $snapshot = $document->content_snapshot;
        $this->assertSame('Eva P.', $snapshot['patient_name']);
        $this->assertStringStartsWith('data:image/png;base64,', $snapshot['signature_image']);
        $request->patientProfile->update(['first_name' => 'Modificat']);
        $this->post('/api/v1/doctor/signature', ['signature' => UploadedFile::fake()->image('nou.png', 100, 400)])->assertOk();
        $this->assertSame($snapshot, $document->fresh()->content_snapshot);
    }

    public function test_prescription_is_private_and_associated_with_document(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test', 'prescription' => UploadedFile::fake()->image('reteta.png')], ['Accept' => 'application/json'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        Storage::disk('local')->assertExists($document->prescription_path);
        $this->get('/api/v1/medical-documents/'.$document->id.'/prescription')->assertForbidden();
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('documents.0.prescription_url', URL::temporarySignedRoute('medical-document.prescription', now()->addMinutes(15), ['document' => $document->id]));
    }

    private function scenario(): ConsultationRequest
    {
        $doctor = User::factory()->create(['name' => 'Medic de test']);
        $doctor->roles()->attach(Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']));
        DoctorProfile::create(['user_id' => $doctor->id, 'clinic_name' => 'Clinica de test']);
        $owner = User::factory()->create();
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Eva', 'last_name' => 'Pletosu', 'birth_date' => '2018-01-01', 'medical_record' => ['family_history' => [['name' => 'Nu se copiază în document']]]]);

        return ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'payment_status' => 'paid', 'symptoms' => 'Simptome declarate', 'amount_minor' => 0]);
    }
}
