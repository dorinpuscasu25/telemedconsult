<?php

namespace App\Services;

use App\Models\Consultation;
use App\Models\MedicalDocument;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MedicalDocumentPublisher
{
    public function snapshot(Consultation $consultation, array $content = [], ?MedicalDocument $parent = null): array
    {
        $consultation->loadMissing(['patientProfile', 'doctor.doctorProfile.specialty']);
        $patient = $consultation->patientProfile;
        $profile = $consultation->doctor?->doctorProfile;
        $signature = $profile?->signature_path;
        $sections = $parent ? ['Completare / recomandări' => $content['recommendations'] ?? ''] : [
            'Istoricul bolii actuale' => $consultation->current_illness_history,
            'Acuze / simptome' => $consultation->patient_complaints,
            'Examen obiectiv' => $consultation->objective_exam,
            'Date obiective înregistrate' => $this->objectiveText($consultation),
            'Diagnostic clinic' => $consultation->diagnosis,
            'Tratament' => $consultation->treatment_plan,
            'Recomandări / investigații' => $consultation->recommendations,
            'Rețetă' => $consultation->prescription_notes,
        ];
        if ($consultation->higo_reviewed && ! $parent) {
            $sections['Date HIGO'] = 'Medicul confirmă că a examinat datele disponibile din examinarea cu dispozitivul HIGO. Fișierele examinării sunt accesibile în fișa pacientului.';
        }

        return [
            'addendum_days' => (int) app(PlatformConfig::class)->number('consultations.addendum_days', 14),
            'clinic' => $profile?->clinic_name ?: app(PlatformConfig::class)->get('platform_name'),
            'clinic_details' => $profile?->clinic_details,
            'title' => $parent ? 'Completare consultație medicală' : 'Consultație medicală',
            'consultation_id' => $consultation->id,
            'parent_document_id' => $parent?->id,
            'patient_name' => $patient?->display_name ?: 'Pacient',
            'patient_code' => $patient?->patient_code ?: '-',
            'birth_date' => $patient?->birth_date?->format('d.m.Y'),
            'locality' => $patient?->locality,
            'doctor_name' => $consultation->doctor?->name ?: 'Medic',
            'specialty' => $profile?->specialty?->name,
            'published_at' => now()->timezone('Europe/Chisinau')->format('d.m.Y H:i'),
            'sections' => $sections,
            'signature_image' => $signature && Storage::disk('local')->exists($signature)
                ? 'data:'.($profile->signature_mime ?: 'image/png').';base64,'.base64_encode(Storage::disk('local')->get($signature)) : null,
            'prescription_instructions' => app(PlatformConfig::class)->get('prescription.instructions'),
        ];
    }

    public function publish(Consultation $consultation, array $content = [], ?MedicalDocument $parent = null): MedicalDocument
    {
        $snapshot = $this->snapshot($consultation, $content, $parent);
        $document = MedicalDocument::create([
            'consultation_id' => $consultation->id, 'consultation_request_id' => $consultation->consultation_request_id,
            'patient_id' => $consultation->patient_id, 'patient_profile_id' => $consultation->patient_profile_id,
            'doctor_id' => $consultation->doctor_id, 'type' => $parent ? 'consultation_addendum' : 'consultation_summary',
            'title' => $snapshot['title'].' #'.$consultation->id, 'status' => 'published',
            'parent_document_id' => $parent?->id, 'published_at' => now(),
            'signature_provider' => $snapshot['signature_image'] ? 'uploaded_image' : null,
            'signature_payload' => ['applied_at' => $snapshot['signature_image'] ? now()->toISOString() : null],
            'fhir_payload' => $parent ? null : $consultation->fhir_payload,
        ]);
        $snapshot['document_id'] = $document->id;
        $path = 'medical-documents/'.Str::uuid().'.pdf';
        $bytes = app(ConsultationPdf::class)->render($snapshot);
        if (! Storage::disk('local')->put($path, $bytes)) {
            throw new \RuntimeException('Documentul PDF nu a putut fi salvat. Reîncearcă publicarea.');
        }
        $document->forceFill(['content_snapshot' => $snapshot, 'pdf_path' => $path])->save();
        if (! $parent) {
            $consultation->forceFill(['signed_pdf_path' => $path])->save();
        }

        return $document;
    }

    private function objectiveText(Consultation $consultation): string
    {
        $lines = [];
        foreach ($consultation->objective_data_snapshot ?? [] as $payload) {
            foreach ($payload as $key => $value) {
                if (is_scalar($value)) {
                    $lines[] = ObjectiveDataSchema::label($key).': '.$value.' '.ObjectiveDataSchema::unit($key);
                }
            }
        }

        return implode("\n", $lines);
    }
}
