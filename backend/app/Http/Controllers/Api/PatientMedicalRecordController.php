<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReclassifyPatientInvestigationRequest;
use App\Http\Requests\UpdateMedicalRecordSectionRequest;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\MedicalDocument;
use App\Models\PatientInvestigation;
use App\Models\PatientProfile;
use App\Services\ConsultationResultAccess;
use App\Services\MedicalRecordSchema;
use App\Services\ObjectiveDataSchema;
use App\Services\PatientRecordAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class PatientMedicalRecordController extends Controller
{
    public function show(Request $request, PatientProfile $patientProfile): JsonResponse
    {
        $this->authorizeRead($request, $patientProfile);
        $requests = ConsultationRequest::with(['specialty', 'doctor.doctorProfile.specialty', 'operator', 'objectiveData', 'examMedia'])
            ->where('patient_profile_id', $patientProfile->id)->latest()->get();
        $conclusions = Consultation::where('patient_profile_id', $patientProfile->id)->get()->keyBy('consultation_request_id');
        $documents = MedicalDocument::where('patient_profile_id', $patientProfile->id)->orderBy('id')->get()->groupBy('consultation_request_id');
        $chats = Conversation::where('patient_profile_id', $patientProfile->id)->get()->keyBy('consultation_request_id');

        return response()->json([
            'patient_profile' => ['id' => (string) $patientProfile->id, 'name' => $patientProfile->display_name, 'patient_code' => $patientProfile->patient_code, 'birth_date' => $patientProfile->birth_date?->toDateString(), 'gender' => $patientProfile->gender, 'medical_record' => $patientProfile->medical_record ?? (object) []],
            'medical_record' => $patientProfile->medical_record ?? (object) [],
            'documents' => $patientProfile->investigations()->orderByDesc('performed_at')->latest()->get()->map(fn ($item) => self::document($item)),
            'consultations' => $requests->map(function ($item) use ($conclusions, $chats, $documents, $request) {
                $conclusion = $conclusions->get($item->id);
                $locked = $item->status === 'completed' && ! app(ConsultationResultAccess::class)->canRead($item, $request->user());

                return [
                    'id' => $item->id, 'consultation_id' => $conclusion?->id, 'status' => $item->status,
                    'result_locked' => $locked,
                    'date' => $item->completed_at ?? $item->scheduled_at ?? $item->created_at,
                    'doctor' => $item->doctor?->name, 'specialty' => $item->specialty?->name ?? $item->doctor?->doctorProfile?->specialty?->name,
                    'current_illness_history' => $locked ? $item->current_illness_history : ($conclusion?->current_illness_history ?? $item->current_illness_history),
                    'documents' => $locked ? [] : ($documents->get($item->id) ?? collect())->map(fn ($document) => ConsultationDocumentController::serialize($document))->values(), 'symptoms' => $locked ? $item->symptoms : ($conclusion?->patient_complaints ?? $item->symptoms),
                    'doctor_history_notes' => $locked ? null : $conclusion?->doctor_history_notes,
                    'objective_exam' => $locked ? null : $conclusion?->objective_exam, 'higo_reviewed' => ! $locked && (bool) $conclusion?->higo_reviewed,
                    'prescription_notes' => $locked ? null : $conclusion?->prescription_notes,
                    'investigation_recommendations' => $locked ? null : $conclusion?->investigation_recommendations,
                    'diagnosis' => $locked ? null : $conclusion?->diagnosis, 'recommendations' => $locked ? null : $conclusion?->recommendations,
                    'treatment_plan' => $locked ? null : $conclusion?->treatment_plan, 'conversation_id' => $chats->get($item->id)?->id,
                    'objective_data' => $item->objectiveData->map(fn ($entry) => [
                        'id' => $entry->id, 'source' => $entry->source, 'completed_at' => $entry->completed_at,
                        'values' => collect($entry->payload)->map(fn ($value, $key) => ['key' => $key, 'label' => ObjectiveDataSchema::label($key), 'unit' => ObjectiveDataSchema::unit($key), 'value' => $value])->values(),
                    ]),
                    'exam_media' => $item->examMedia->filter(fn ($media) => $media->isStored())->map(fn ($media) => [
                        'id' => $media->id, 'kind' => $media->kind, 'exam_type' => $media->exam_type,
                        'url' => app(PatientRecordAccess::class)->fileUrl('exam-media.show', ['media' => $media->id]),
                    ])->values(),
                ];
            })->sortByDesc('date')->values(),
        ])->header('Cache-Control', 'no-store');
    }

    public function update(UpdateMedicalRecordSectionRequest $request, PatientProfile $patientProfile): JsonResponse
    {
        $validated = $request->validated();
        DB::transaction(function () use ($patientProfile, $validated) {
            $profile = PatientProfile::lockForUpdate()->findOrFail($patientProfile->id);
            $record = $profile->medical_record ?? [];
            $section = $validated['section'];
            $flags = is_array($record[MedicalRecordSchema::NOTHING_TO_REPORT] ?? null) ? $record[MedicalRecordSchema::NOTHING_TO_REPORT] : [];

            if ($validated['nothing_to_report'] ?? false) {
                unset($record[$section]);
                $flags[$section] = true;
            } else {
                $record[$section] = $validated['data'];
                unset($flags[$section]);
            }

            if ($flags === []) {
                unset($record[MedicalRecordSchema::NOTHING_TO_REPORT]);
            } else {
                $record[MedicalRecordSchema::NOTHING_TO_REPORT] = $flags;
            }

            $profile->forceFill(['medical_record' => $record])->save();
        });

        return response()->json(['message' => 'Secțiune salvată.', 'medical_record' => $patientProfile->fresh()->medical_record]);
    }

    public static function document(PatientInvestigation $item): array
    {
        return [
            'id' => $item->id, 'title' => $item->title, 'type' => $item->type, 'notes' => $item->notes,
            'consultation_request_id' => $item->consultation_request_id,
            'performed_at' => $item->performed_at?->toDateString(), 'created_at' => $item->created_at,
            'mime_type' => $item->mime_type,
            'url' => $item->file_path ? app(PatientRecordAccess::class)->fileUrl('patient-investigation.file', ['investigation' => $item->id]) : null,
        ];
    }

    public function file(Request $request, PatientInvestigation $investigation): Response
    {
        abort_unless(app(PatientRecordAccess::class)->canReadProfile(app(PatientRecordAccess::class)->signedViewer($request), $investigation->patientProfile), 403, 'Accesul la fișa pacientului a expirat.');
        abort_unless($investigation->file_path, 404);
        $disk = Storage::disk($investigation->file_disk ?: 'public');
        abort_unless($disk->exists($investigation->file_path), 404);

        return $disk->response($investigation->file_path, basename($investigation->file_path), [
            'Content-Type' => $investigation->mime_type ?: 'application/octet-stream',
            'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function destroyDocument(Request $request, PatientProfile $patientProfile, PatientInvestigation $investigation): JsonResponse
    {
        abort_unless((int) $patientProfile->user_id === (int) $request->user()->id || $request->user()->hasRole('admin'), 403);
        abort_unless((int) $investigation->patient_profile_id === (int) $patientProfile->id, 404);
        if ($investigation->file_path) {
            Storage::disk($investigation->file_disk ?: 'public')->delete($investigation->file_path);
        }
        $investigation->delete();

        return response()->json(['message' => 'Document șters.']);
    }

    public function reclassifyDocument(ReclassifyPatientInvestigationRequest $request, PatientProfile $patientProfile, PatientInvestigation $investigation): JsonResponse
    {
        abort_unless((int) $investigation->patient_profile_id === (int) $patientProfile->id, 404);
        abort_unless(in_array($investigation->type, ['investigation', 'analysis', 'functional', 'imaging'], true), 422, 'Fotografiile clinice se păstrează în secțiunea examinării.');
        $investigation->update($request->validated());

        return response()->json(['document' => self::document($investigation)]);
    }

    private function authorizeRead(Request $request, PatientProfile $profile): void
    {
        abort_unless(app(PatientRecordAccess::class)->canReadProfile($request->user(), $profile), 403, 'Accesul la fișa pacientului a expirat.');
    }
}
