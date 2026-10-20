<?php

namespace App\Services;

use App\Models\Consultation;
use App\Models\MedicalDocument;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MedicalDocumentPublisher
{
    public const ADDENDUM_DAYS = 14;

    public const PRESCRIPTION_INSTRUCTIONS = 'Spuneți-ne din ce rețea de farmacii ați luat medicamentul pe rețetă, pentru a transmite rețeta originală în rețeaua respectivă.';

    public function snapshot(Consultation $consultation, array $content = [], ?MedicalDocument $parent = null): array
    {
        $consultation->loadMissing(['patientProfile', 'doctor.doctorProfile.specialty']);
        $patient = $consultation->patientProfile;
        $profile = $consultation->doctor?->doctorProfile;
        $signature = $profile?->signature_path;
        $sections = $parent ? ['Completare / recomandări' => $content['recommendations'] ?? ''] : [
            'Istoricul bolii actuale' => $consultation->current_illness_history,
            'Acuzele pacientului (plângerile / simptomele)' => $consultation->patient_complaints,
            'Examen obiectiv' => $this->objectiveExam($consultation),
            'Date obiective înregistrate' => $this->objectiveText($consultation),
            'Diagnostic clinic' => $consultation->diagnosis,
            'Tratament' => $consultation->treatment_plan,
            'Recomandări' => $consultation->recommendations,
            'Investigații recomandate' => $consultation->investigation_recommendations,
            'Rețetă' => $consultation->prescription_notes,
        ];

        return [
            'addendum_days' => self::ADDENDUM_DAYS,
            'clinic' => $profile?->clinic_name ?: app(PlatformConfig::class)->get('platform_name'),
            'clinic_details' => $profile?->clinic_details,
            'clinic_logo_image' => $profile?->clinic_logo_path && Storage::disk('local')->exists($profile->clinic_logo_path)
                ? 'data:'.($profile->clinic_logo_mime ?: 'image/png').';base64,'.base64_encode(Storage::disk('local')->get($profile->clinic_logo_path)) : null,
            'title' => $parent ? 'Completare consultație medicală' : 'Consultație medicală',
            'consultation_id' => $consultation->id,
            'parent_document_id' => $parent?->id,
            'patient_name' => $patient?->display_name ?: 'Pacient',
            'patient_code' => $patient?->patient_code ?: '-',
            'birth_date' => $patient?->birth_date?->format('d.m.Y'),
            'locality' => $patient?->locality,
            'doctor_name' => $consultation->doctor?->name ?: 'Medic',
            'doctor_phone' => $consultation->doctor?->phone,
            'doctor_contacts' => collect($profile?->platforms ?? [])->filter(fn ($item) => is_array($item) && filled($item['name'] ?? null) && filled($item['value'] ?? null))->map(fn ($item) => $item['name'].': '.$item['value'])->implode(' · '),
            'specialty' => $profile?->specialty?->name,
            'published_at' => now()->timezone('Europe/Chisinau')->format('d.m.Y H:i'),
            'sections' => $sections,
            'signature_image' => $signature && Storage::disk('local')->exists($signature)
                ? 'data:'.($profile->signature_mime ?: 'image/png').';base64,'.base64_encode(Storage::disk('local')->get($signature)) : null,
            'prescription_instructions' => self::PRESCRIPTION_INSTRUCTIONS,
            'has_prescription' => (bool) ($content['has_prescription'] ?? false),
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

    private function objectiveExam(Consultation $consultation): string
    {
        $sections = [$consultation->objective_exam];
        if ($consultation->higo_reviewed) {
            $sections[] = 'Medicul confirmă că a luat cunoștință de datele examinării efectuate cu dispozitivul HIGO. Fotografiile, înregistrările video și celelalte fișiere ale examinării se păstrează în format digital în fișa pacientului și nu sunt incluse în acest PDF.';
        }

        return implode("\n\n", array_filter($sections, fn ($section) => filled($section)));
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
