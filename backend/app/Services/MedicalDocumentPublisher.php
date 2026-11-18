<?php

namespace App\Services;

use App\Models\Consultation;
use App\Models\MedicalDocument;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MedicalDocumentPublisher
{
    public const ADDENDUM_DAYS = PatientRecordAccess::MONITORING_DAYS;

    public const PRESCRIPTION_INSTRUCTIONS = 'Deschideți rețeta separat. Pentru imprimare folosiți Ctrl+P (Windows/Android cu tastatură) sau ⌘+P (Mac), ori opțiunea Imprimare din browser. Alegeți „Încadrare în pagină” pentru a păstra rețeta întreagă.';

    public function snapshot(Consultation $consultation, array $content = [], ?MedicalDocument $parent = null): array
    {
        $consultation->loadMissing(['patientProfile', 'doctor.doctorProfile.specialty']);
        $patient = $consultation->patientProfile;
        $profile = $consultation->doctor?->doctorProfile;
        $signature = $profile?->signature_path;
        $hasPrescription = ! $parent && isset($content['prescription']);
        $sections = $parent ? ['Completare / recomandări' => $content['recommendations'] ?? ''] : [
            'Istoricul bolii și acuzele pacientului' => implode("\n\n", array_filter([filled($consultation->current_illness_history) ? 'Istoricul declarat: '.$consultation->current_illness_history : null, $consultation->patient_complaints])),
            'Completările medicului la istoricul bolii' => $consultation->doctor_history_notes,
            'Examen obiectiv' => $this->objectiveExam($consultation),
            'Date obiective înregistrate' => $this->objectiveText($consultation),
            'Diagnostic clinic prezumtiv' => $consultation->diagnosis,
            'Tratament medicamentos' => $consultation->treatment_plan,
            'Recomandări de stil de viață, alimentație și hidratare' => $consultation->recommendations,
            'Investigații recomandate' => $consultation->investigation_recommendations,
            'Rețetă' => $hasPrescription ? (filled($consultation->prescription_notes) ? 'Rețeta scanată pentru '.$consultation->prescription_notes : 'Rețeta scanată').' este atașată în anexa nr. 1 la decizie.' : null,
        ];

        return [
            'consents' => $parent?->content_snapshot['consents'] ?? app(ConsultationConsents::class)->evidence($consultation->consultation_request_id),
            'protocol_number' => $parent?->content_snapshot['protocol_number'] ?? 'PV-'.now('Europe/Chisinau')->format('Y').'-'.$consultation->consultation_request_id,
            'decision_number' => $parent?->content_snapshot['decision_number'] ?? 'DEC-'.now('Europe/Chisinau')->format('Y').'-'.$consultation->id,
            'higo_evidence' => $parent?->content_snapshot['higo_evidence'] ?? ['status' => $consultation->higo_status, 'exam_id' => $consultation->higo_exam_id, 'exams' => $consultation->higo_reviewed ? app(HigoReviewEvidence::class)->exams($consultation->request) : [], 'performed_at' => $consultation->higo_exam_performed_at, 'reviewed_at' => $consultation->higo_reviewed_at, 'doctor_id' => $consultation->doctor_id],
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
            'parts' => $parent ? null : ['protocol' => array_slice($sections, 0, 5, true), 'decision' => array_slice($sections, 5, null, true)],
            'signature_image' => $signature && Storage::disk('local')->exists($signature)
                ? 'data:'.($profile->signature_mime ?: 'image/png').';base64,'.base64_encode(Storage::disk('local')->get($signature)) : null,
            'prescription_instructions' => self::PRESCRIPTION_INSTRUCTIONS,
            'has_prescription' => $hasPrescription,
            'prescription_page_count' => $hasPrescription ? $content['prescription']['page_count'] : 0,
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
        $prescription = $content['prescription'] ?? null;
        $prescriptionPath = null;
        try {
            $bytes = app(ConsultationPdf::class)->render($snapshot);
            if ($prescription) {
                $bytes = app(PrescriptionAttachment::class)->append($bytes, $prescription['pdf']);
                $prescriptionPath = $prescription['file']->store('medical-prescriptions', 'local');
                if (! $prescriptionPath) {
                    throw new \RuntimeException('Rețeta nu a putut fi salvată. Reîncearcă publicarea.');
                }
            }
            if (! Storage::disk('local')->put($path, $bytes)) {
                throw new \RuntimeException('Documentul PDF nu a putut fi salvat. Reîncearcă publicarea.');
            }
            $document->forceFill(['content_snapshot' => $snapshot, 'pdf_path' => $path, 'prescription_path' => $prescriptionPath, 'prescription_mime' => $prescription['mime'] ?? null])->save();
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete(array_filter([$path, $prescriptionPath]));
            throw $exception;
        }
        if (! $parent) {
            $consultation->forceFill(['signed_pdf_path' => $path])->save();
        }

        return $document;
    }

    private function objectiveExam(Consultation $consultation): string
    {
        $sections = [$consultation->objective_exam];
        if ($consultation->higo_status === 'not_performed') {
            $sections[] = 'Examinarea cu dispozitivul HIGO nu a fost efectuată.';
        }
        if ($consultation->higo_reviewed) {
            $sections[] = ($consultation->higo_exam_performed_at ? 'Examinare HIGO din '.$consultation->higo_exam_performed_at->format('d.m.Y H:i').'. ' : '').'Medicul confirmă că a luat cunoștință de toate datele examinărilor efectuate cu dispozitivul HIGO pentru această consultație. Fotografiile, înregistrările video și celelalte fișiere ale examinării se păstrează în format digital în fișa pacientului și nu sunt incluse în acest PDF.';
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
