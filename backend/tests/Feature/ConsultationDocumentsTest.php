<?php

namespace Tests\Feature;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\MedicalDocument;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\ConsultationPdf;
use App\Services\MedicalDocumentPublisher;
use App\Services\PlatformConfig;
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
        $this->assertSame('Simptome declarate', $document->content_snapshot['sections']['Acuzele pacientului (plângerile / simptomele)']);
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

    public function test_preview_preserves_patient_history_when_doctor_does_not_override_it(): void
    {
        $request = $this->scenario();
        $request->update(['current_illness_history' => 'Istoric completat de pacient, debut de trei zile']);
        Sanctum::actingAs($request->doctor);
        $this->mock(ConsultationPdf::class)->shouldReceive('render')->once()->withArgs(function (array $snapshot): bool {
            $this->assertSame('Istoric completat de pacient, debut de trei zile', $snapshot['sections']['Istoricul bolii actuale']);
            $this->assertSame('Simptome declarate', $snapshot['sections']['Acuzele pacientului (plângerile / simptomele)']);

            return true;
        })->andReturn('%PDF-preview');

        $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => 'Test'])->assertOk();
        $this->assertSame(0, MedicalDocument::count());
    }

    public function test_published_pdf_combines_clinical_sections_and_higo_acknowledgement_in_objective_exam(): void
    {
        $request = $this->scenario();
        $request->update(['current_illness_history' => 'Debut declarat de pacient']);
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', [
            'diagnosis' => 'Diagnostic de test',
            'objective_exam' => 'Observațiile medicului',
            'higo_reviewed' => true,
            'treatment_plan' => 'Tratament de test',
            'recommendations' => 'Recomandări pentru pacient',
            'investigation_recommendations' => 'Analize recomandate separat',
            'prescription_notes' => 'Indicații pentru rețetă',
        ])->assertOk();

        $document = MedicalDocument::firstOrFail();
        $sections = $document->content_snapshot['sections'];
        $this->assertSame('Debut declarat de pacient', $sections['Istoricul bolii actuale']);
        $this->assertSame('Simptome declarate', $sections['Acuzele pacientului (plângerile / simptomele)']);
        $this->assertStringStartsWith('Observațiile medicului', $sections['Examen obiectiv']);
        $this->assertStringContainsString('dispozitivul HIGO', $sections['Examen obiectiv']);
        $this->assertStringContainsString('nu sunt incluse în acest PDF', $sections['Examen obiectiv']);
        $this->assertSame('Diagnostic de test', $sections['Diagnostic clinic']);
        $this->assertSame('Tratament de test', $sections['Tratament']);
        $this->assertSame('Recomandări pentru pacient', $sections['Recomandări']);
        $this->assertSame('Analize recomandate separat', $sections['Investigații recomandate']);
        $this->assertSame('Analize recomandate separat', Consultation::firstOrFail()->investigation_recommendations);
        $this->assertSame('Indicații pentru rețetă', $sections['Rețetă']);

        Sanctum::actingAs($request->patient);
        $this->getJson('/api/v1/patient/profiles/'.$request->patient_profile_id.'/medical-record')->assertOk()
            ->assertJsonPath('consultations.0.investigation_recommendations', 'Analize recomandate separat')
            ->assertJsonPath('consultations.0.recommendations', 'Recomandări pentru pacient');
        $url = $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->json('documents.0.url');
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_pdf_does_not_claim_higo_review_without_doctor_confirmation(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test', 'objective_exam' => 'Observații'])->assertOk();
        $sections = MedicalDocument::firstOrFail()->content_snapshot['sections'];
        $this->assertSame('Observații', $sections['Examen obiectiv']);
        $this->assertArrayNotHasKey('Date HIGO', $sections);
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
        $html = view('medical.consultation', ['record' => $snapshot])->render();
        $this->assertStringContainsString($snapshot['published_at'], $html);
        $this->assertStringContainsString('Parafă și semnătură aplicate la', $html);
        $request->patientProfile->update(['first_name' => 'Modificat']);
        $this->post('/api/v1/doctor/signature', ['signature' => UploadedFile::fake()->image('nou.png', 100, 400)])->assertOk();
        $this->assertSame($snapshot, $document->fresh()->content_snapshot);
    }

    public function test_invalid_signature_upload_preserves_saved_image_and_allows_retry(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/doctor/signature', ['signature' => UploadedFile::fake()->image('parafa.png')])->assertOk();
        $originalPath = $request->doctor->doctorProfile->fresh()->signature_path;

        $this->postJson('/api/v1/doctor/signature', ['signature' => UploadedFile::fake()->create('invalid.txt', 1, 'text/plain')])->assertUnprocessable();
        $this->assertSame($originalPath, $request->doctor->doctorProfile->fresh()->signature_path);
        Storage::disk('local')->assertExists($originalPath);

        $this->post('/api/v1/doctor/signature', ['signature' => UploadedFile::fake()->image('retry.png')])->assertOk();
        $this->assertNotSame($originalPath, $request->doctor->doctorProfile->fresh()->signature_path);
    }

    public function test_invalid_preview_does_not_publish_and_valid_retry_succeeds(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => ''])->assertUnprocessable();
        $this->assertSame(0, MedicalDocument::count());
        $this->assertSame('accepted', $request->fresh()->status);

        $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => 'Diagnostic completat'])->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertSame(0, MedicalDocument::count());
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

    public function test_pharmacy_message_is_permanent_in_pdf_and_document_response(): void
    {
        $request = $this->scenario();
        app(PlatformConfig::class)->upsert('prescription.instructions', '');
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test', 'prescription' => UploadedFile::fake()->create('reteta.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        $this->assertTrue($document->content_snapshot['has_prescription']);
        $message = MedicalDocumentPublisher::PRESCRIPTION_INSTRUCTIONS;
        $this->assertSame($message, $document->content_snapshot['prescription_instructions']);
        $html = view('medical.consultation', ['record' => $document->content_snapshot])->render();
        $this->assertStringContainsString($message, $html);
        $this->assertStringNotContainsString('Nu se copiază în document', $html);
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('documents.0.prescription_instructions', $message);
    }

    public function test_addendum_cannot_extend_beyond_fourteen_days_even_with_older_settings(): void
    {
        $this->freezeTime();
        $request = $this->scenario();
        app(PlatformConfig::class)->upsert('consultations.addendum_days', 90);
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        $snapshot = $document->content_snapshot;
        $snapshot['addendum_days'] = 90;
        $document->update(['content_snapshot' => $snapshot]);
        $this->travel(14)->days();
        $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->assertJsonPath('can_addendum', false);
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/addendum', ['recommendations' => 'Prea târziu'])->assertUnprocessable();
    }

    public function test_investigation_preview_is_separate_and_rejects_overlong_content(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => 'Test', 'investigation_recommendations' => str_repeat('a', 4001)])
            ->assertUnprocessable()->assertJsonValidationErrors('investigation_recommendations');
        $this->mock(ConsultationPdf::class)->shouldReceive('render')->once()->withArgs(function (array $snapshot): bool {
            $this->assertSame('Analize separate', $snapshot['sections']['Investigații recomandate']);
            $this->assertSame('Recomandări generale', $snapshot['sections']['Recomandări']);

            return true;
        })->andReturn('%PDF-preview');
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => 'Test', 'recommendations' => 'Recomandări generale', 'investigation_recommendations' => 'Analize separate'])->assertOk();
        $this->assertSame(0, MedicalDocument::count());
    }

    public function test_clinic_logo_and_contacts_are_private_and_preserved_in_published_pdf(): void
    {
        $request = $this->scenario();
        $request->doctor->update(['phone' => '+37360000000']);
        $request->doctor->doctorProfile->update(['platforms' => ['Video', ['name' => 'Telegram', 'value' => '@clinica_demo']]]);
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('clinica.png', 800, 150)])->assertOk();
        $this->get('/api/v1/doctor/clinic-logo')->assertOk()->assertHeader('Content-Type', 'image/png')->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        $snapshot = $document->content_snapshot;
        $this->assertStringStartsWith('data:image/png;base64,', $snapshot['clinic_logo_image']);
        $this->assertSame('+37360000000', $snapshot['doctor_phone']);
        $this->assertSame('Telegram: @clinica_demo', $snapshot['doctor_contacts']);
        $html = view('medical.consultation', ['record' => $snapshot])->render();
        $this->assertStringContainsString('Sigla clinicii', $html);
        $this->assertStringContainsString('Telegram: @clinica_demo', $html);
        $this->post('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('nou.jpg')])->assertOk();
        $request->doctor->update(['phone' => '+37361111111']);
        $this->assertSame($snapshot, $document->fresh()->content_snapshot);

        Sanctum::actingAs($request->patient);
        $this->getJson('/api/v1/doctor/clinic-logo')->assertForbidden();
        $this->post('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('incercare.png')])->assertForbidden();
        $otherDoctor = User::factory()->create();
        $otherDoctor->roles()->attach(Role::where('name', 'doctor')->firstOrFail());
        DoctorProfile::create(['user_id' => $otherDoctor->id]);
        Sanctum::actingAs($otherDoctor);
        $this->getJson('/api/v1/doctor/clinic-logo')->assertNotFound();
    }

    public function test_invalid_clinic_logo_keeps_the_saved_image_and_valid_retry_replaces_it(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('clinica.png')])->assertOk();
        $original = $request->doctor->doctorProfile->fresh()->clinic_logo_path;
        foreach ([UploadedFile::fake()->create('invalid.txt', 1, 'text/plain'), UploadedFile::fake()->image('mare.png')->size(2049), UploadedFile::fake()->image('lat.png', 3001, 1)] as $file) {
            $this->postJson('/api/v1/doctor/clinic-logo', ['logo' => $file])->assertUnprocessable()->assertJsonValidationErrors('logo');
            $this->assertSame($original, $request->doctor->doctorProfile->fresh()->clinic_logo_path);
            Storage::disk('local')->assertExists($original);
        }
        $this->post('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('nou.jpg')])->assertOk();
        Storage::disk('local')->assertMissing($original);
        $this->assertNotSame($original, $request->doctor->doctorProfile->fresh()->clinic_logo_path);
    }

    public function test_failed_logo_storage_preserves_the_previous_image(): void
    {
        $request = $this->scenario();
        Sanctum::actingAs($request->doctor);
        $this->post('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('clinica.png')])->assertOk();
        $original = $request->doctor->doctorProfile->fresh()->clinic_logo_path;
        $disk = Storage::disk('local');
        $failingDisk = \Mockery::mock($disk)->makePartial();
        $failingDisk->shouldReceive('putFileAs')->once()->andReturn(false);
        Storage::shouldReceive('disk')->with('local')->andReturn($failingDisk);

        $this->postJson('/api/v1/doctor/clinic-logo', ['logo' => UploadedFile::fake()->image('retry.png')])->assertStatus(503);
        $this->assertSame($original, $request->doctor->doctorProfile->fresh()->clinic_logo_path);
        $this->assertTrue($disk->exists($original));
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
