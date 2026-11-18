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
use App\Services\PrescriptionAttachment;
use FPDF;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use setasign\Fpdi\PdfParser\PdfParser;
use setasign\Fpdi\PdfParser\StreamReader;
use setasign\Fpdi\PdfReader\PdfReader;
use Tests\TestCase;

class PrescriptionAttachmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_preview_and_publication_include_all_prescription_pages_and_preserve_original_download(): void
    {
        $request = $this->scenario();
        $source = $this->prescriptionPdf();
        $preview = $this->post('/api/v1/requests/'.$request->id.'/documents/preview', $this->payload(UploadedFile::fake()->createWithContent('reteta.pdf', $source)), ['Accept' => 'application/json'])->assertOk();
        $reader = $this->reader($preview->getContent());
        $this->assertSame(4, $reader->getPageCount());
        $this->assertEqualsWithDelta(148 * 72 / 25.4, $reader->getPage(3)->getWidthAndHeight()[0], 0.1);
        $this->assertEqualsWithDelta(297 * 72 / 25.4, $reader->getPage(4)->getWidthAndHeight()[0], 0.1);
        $this->assertSame(0, MedicalDocument::count());
        $this->assertSame([], Storage::disk('local')->allFiles());

        $this->post('/api/v1/requests/'.$request->id.'/complete', $this->payload(UploadedFile::fake()->createWithContent('reteta.pdf', $source)), ['Accept' => 'application/json'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        $snapshot = $document->content_snapshot;
        $this->assertTrue($snapshot['has_prescription']);
        $this->assertSame(2, $snapshot['prescription_page_count']);
        $this->assertSame('Rețeta scanată pentru Medicament demonstrativ este atașată în anexa nr. 1 la decizie.', $snapshot['sections']['Rețetă']);
        $this->assertArrayNotHasKey('pdf', $snapshot);
        $this->assertSame($source, Storage::disk('local')->get($document->prescription_path));
        $this->assertSame(4, $this->reader(Storage::disk('local')->get($document->pdf_path))->getPageCount());
        $this->assertArrayHasKey('Diagnostic clinic prezumtiv', $snapshot['parts']['protocol']);
        $this->assertArrayNotHasKey('Tratament medicamentos', $snapshot['parts']['protocol']);
        $this->assertArrayHasKey('Tratament medicamentos', $snapshot['parts']['decision']);
        $html = view('medical.consultation', ['record' => $snapshot])->render();
        $this->assertLessThan(strpos($html, 'Decizie medicală nr.'), strpos($html, 'Diagnostic clinic prezumtiv'));
        $this->assertGreaterThan(strpos($html, 'Decizie medicală nr.'), strpos($html, 'Tratament medicamentos'));

        Sanctum::actingAs($request->patient);
        $url = $this->getJson('/api/v1/requests/'.$request->id.'/documents')->assertOk()->json('documents.0.prescription_url');
        $this->get($url)->assertOk()->assertStreamedContent($source);
    }

    public function test_long_consultation_appends_prescription_after_all_medical_pages(): void
    {
        $request = $this->scenario();
        $payload = [...$this->payload(UploadedFile::fake()->createWithContent('reteta.pdf', $this->prescriptionPdf())),
            'doctor_history_notes' => str_repeat('Istoric demonstrativ. ', 150),
            'diagnosis' => str_repeat('Diagnostic demonstrativ. ', 120),
            'treatment_plan' => str_repeat('Tratament demonstrativ. ', 150),
            'recommendations' => str_repeat('Recomandări demonstrative. ', 140),
        ];
        $this->post('/api/v1/requests/'.$request->id.'/complete', $payload, ['Accept' => 'application/json'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        $reader = $this->reader(Storage::disk('local')->get($document->pdf_path));
        $count = $reader->getPageCount();
        $this->assertGreaterThan(4, $count);
        $this->assertSame(2, $document->content_snapshot['prescription_page_count']);
        $this->assertEqualsWithDelta(148 * 72 / 25.4, $reader->getPage($count - 1)->getWidthAndHeight()[0], 0.1);
        $this->assertEqualsWithDelta(297 * 72 / 25.4, $reader->getPage($count)->getWidthAndHeight()[0], 0.1);
    }

    public function test_png_and_jpeg_photographs_are_fitted_without_changing_the_separate_file(): void
    {
        foreach ([['reteta.png', 600, 900], ['reteta.jpg', 1200, 700]] as [$name, $width, $height]) {
            $request = $this->scenario();
            $file = UploadedFile::fake()->image($name, $width, $height);
            $original = $file->getContent();
            $this->post('/api/v1/requests/'.$request->id.'/complete', $this->payload($file), ['Accept' => 'application/json'])->assertOk();
            $document = MedicalDocument::where('consultation_request_id', $request->id)->firstOrFail();
            $reader = $this->reader(Storage::disk('local')->get($document->pdf_path));
            $this->assertSame(3, $reader->getPageCount());
            $this->assertSame($original, Storage::disk('local')->get($document->prescription_path));
            [$pageWidth, $pageHeight] = $reader->getPage(3)->getWidthAndHeight();
            $this->assertSame($width > $height, $pageWidth > $pageHeight);
        }
    }

    public function test_phone_photo_orientation_is_preserved_without_changing_original_bytes(): void
    {
        $request = $this->scenario();
        $image = UploadedFile::fake()->image('telefon.jpg', 1200, 700)->getContent();
        $exif = "Exif\0\0II".pack('vV', 42, 8).pack('v', 1).pack('vvVv', 0x0112, 3, 1, 6)."\0\0".pack('V', 0);
        $original = substr($image, 0, 2)."\xff\xe1".pack('n', strlen($exif) + 2).$exif.substr($image, 2);
        $this->post('/api/v1/requests/'.$request->id.'/complete', $this->payload(UploadedFile::fake()->createWithContent('telefon.jpg', $original)), ['Accept' => 'application/json'])->assertOk();
        $document = MedicalDocument::firstOrFail();
        [$width, $height] = $this->reader(Storage::disk('local')->get($document->pdf_path))->getPage(3)->getWidthAndHeight();
        $this->assertLessThan($height, $width);
        $this->assertSame($original, Storage::disk('local')->get($document->prescription_path));
    }

    public function test_invalid_dynamic_and_overlong_pdf_do_not_publish_or_release_payment(): void
    {
        $request = $this->scenario();
        $request->update(['payment_status' => 'held']);
        $annotated = new FPDF;
        $annotated->AddPage();
        $annotated->SetFont('Helvetica', '', 12);
        $annotated->Cell(50, 10, 'Prescription with annotation', link: 'https://example.com');
        $long = new FPDF;
        for ($page = 0; $page <= PrescriptionAttachment::MAX_PAGES; $page++) {
            $long->AddPage();
        }
        foreach (['%PDF-1.4 broken', $annotated->Output('S'), $long->Output('S')] as $source) {
            foreach (['documents/preview', 'complete'] as $action) {
                $this->post('/api/v1/requests/'.$request->id.'/'.$action, $this->payload(UploadedFile::fake()->createWithContent('reteta.pdf', $source)), ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('prescription');
            }
        }
        $this->assertSame('accepted', $request->fresh()->status);
        $this->assertSame('held', $request->fresh()->payment_status);
        $this->assertSame(0, MedicalDocument::count());
        $this->assertSame(0, Consultation::count());
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_prescription_flag_and_medication_name_cannot_create_a_nonexistent_annex(): void
    {
        $request = $this->scenario();
        $this->mock(ConsultationPdf::class)->shouldReceive('render')->once()->withArgs(function (array $snapshot): bool {
            $this->assertFalse($snapshot['has_prescription']);
            $this->assertSame(0, $snapshot['prescription_page_count']);
            $this->assertNull($snapshot['sections']['Rețetă']);

            return true;
        })->andReturn('%PDF-preview');
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/preview', ['diagnosis' => 'Test', 'higo_status' => 'not_performed', 'has_prescription' => true, 'prescription_notes' => 'Medicament demonstrativ'])->assertOk();
    }

    public function test_addendum_does_not_repeat_prescription_pages_and_keeps_base_original_intact(): void
    {
        $request = $this->scenario();
        $this->post('/api/v1/requests/'.$request->id.'/complete', $this->payload(UploadedFile::fake()->image('reteta.png')), ['Accept' => 'application/json'])->assertOk();
        $base = MedicalDocument::firstOrFail();
        $original = Storage::disk('local')->get($base->prescription_path);
        $this->postJson('/api/v1/requests/'.$request->id.'/documents/addendum', ['recommendations' => 'Completare demonstrativă'])->assertCreated();
        $addendum = MedicalDocument::where('parent_document_id', $base->id)->firstOrFail();
        $this->assertNull($addendum->prescription_path);
        $this->assertFalse($addendum->content_snapshot['has_prescription']);
        $this->assertSame(1, $this->reader(Storage::disk('local')->get($addendum->pdf_path))->getPageCount());
        $this->assertSame($original, Storage::disk('local')->get($base->prescription_path));
    }

    public function test_failed_combined_pdf_storage_removes_uploaded_original_and_keeps_request_open(): void
    {
        $request = $this->scenario();
        $disk = Storage::disk('local');
        $failingDisk = \Mockery::mock($disk)->makePartial();
        $failingDisk->shouldReceive('put')->withArgs(fn ($path) => str_starts_with($path, 'medical-documents/'))->once()->andReturn(false);
        Storage::shouldReceive('disk')->with('local')->andReturn($failingDisk);
        $this->post('/api/v1/requests/'.$request->id.'/complete', $this->payload(UploadedFile::fake()->image('reteta.png')), ['Accept' => 'application/json'])->assertStatus(500);
        $this->assertSame('accepted', $request->fresh()->status);
        $this->assertSame(0, MedicalDocument::count());
        $this->assertSame([], $disk->allFiles());
    }

    private function payload(UploadedFile $file): array
    {
        return ['higo_status' => 'not_performed', 'diagnosis' => 'Diagnostic demonstrativ', 'treatment_plan' => 'Tratament demonstrativ - fără date clinice reale.', 'prescription_notes' => 'Medicament demonstrativ', 'prescription' => $file];
    }

    private function prescriptionPdf(): string
    {
        $pdf = new FPDF;
        foreach ([['P', [148, 210]], ['L', [210, 297]]] as $index => [$orientation, $size]) {
            $pdf->AddPage($orientation, $size);
            $pdf->SetFont('Helvetica', '', 18);
            $pdf->Cell(0, 20, 'PRESCRIPTION DEMO - PAGE '.($index + 1));
        }

        return $pdf->Output('S');
    }

    private function reader(string $bytes): PdfReader
    {
        return new PdfReader(new PdfParser(StreamReader::createByString($bytes)));
    }

    private function scenario(): ConsultationRequest
    {
        $doctor = User::factory()->create(['name' => 'Medic demonstrativ']);
        $doctor->roles()->attach(Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']));
        DoctorProfile::create(['user_id' => $doctor->id, 'clinic_name' => 'Clinica demonstrativă', 'is_approved' => true]);
        $owner = User::factory()->create();
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Pacient', 'last_name' => 'Demonstrativ', 'birth_date' => '2000-01-01']);
        Sanctum::actingAs($doctor);

        return ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'payment_status' => 'paid', 'symptoms' => 'Exemplu de test', 'amount_minor' => 0]);
    }
}
