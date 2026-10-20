<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateMedicalRecordSectionRequest;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\MedicalDocument;
use App\Models\PatientInvestigation;
use App\Models\PatientProfile;
use App\Services\ObjectiveDataSchema;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
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
            'consultations' => $requests->map(function ($item) use ($conclusions, $chats, $documents) {
                $conclusion = $conclusions->get($item->id);

                return [
                    'id' => $item->id, 'consultation_id' => $conclusion?->id, 'status' => $item->status,
                    'date' => $item->completed_at ?? $item->scheduled_at ?? $item->created_at,
                    'doctor' => $item->doctor?->name, 'specialty' => $item->specialty?->name ?? $item->doctor?->doctorProfile?->specialty?->name,
                    'current_illness_history' => $conclusion?->current_illness_history ?? $item->current_illness_history,
                    'documents' => ($documents->get($item->id) ?? collect())->map(fn ($document) => ConsultationDocumentController::serialize($document))->values(), 'symptoms' => $conclusion?->patient_complaints ?? $item->symptoms,
                    'objective_exam' => $conclusion?->objective_exam, 'higo_reviewed' => (bool) $conclusion?->higo_reviewed,
                    'prescription_notes' => $conclusion?->prescription_notes,
                    'investigation_recommendations' => $conclusion?->investigation_recommendations,
                    'diagnosis' => $conclusion?->diagnosis, 'recommendations' => $conclusion?->recommendations,
                    'treatment_plan' => $conclusion?->treatment_plan, 'conversation_id' => $chats->get($item->id)?->id,
                    'objective_data' => $item->objectiveData->map(fn ($entry) => [
                        'id' => $entry->id, 'source' => $entry->source, 'completed_at' => $entry->completed_at,
                        'values' => collect($entry->payload)->map(fn ($value, $key) => ['key' => $key, 'label' => ObjectiveDataSchema::label($key), 'unit' => ObjectiveDataSchema::unit($key), 'value' => $value])->values(),
                    ]),
                    'exam_media' => $item->examMedia->filter(fn ($media) => $media->isStored())->map(fn ($media) => [
                        'id' => $media->id, 'kind' => $media->kind, 'exam_type' => $media->exam_type,
                        'url' => URL::temporarySignedRoute('exam-media.show', now()->addHour(), ['media' => $media->id]),
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
            $record[$validated['section']] = $validated['data'];
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
            'url' => $item->file_path ? URL::temporarySignedRoute('patient-investigation.file', now()->addHour(), ['investigation' => $item->id]) : null,
        ];
    }

    public function file(Request $request, PatientInvestigation $investigation): Response
    {
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

    private function authorizeRead(Request $request, PatientProfile $profile): void
    {
        $user = $request->user();
        $assigned = $profile->consultationRequests()->whereNotIn('status', ['rejected', 'cancelled', 'expired', 'no_operator_available'])
            ->where(fn ($query) => $query->where('doctor_id', $user->id)->orWhere('operator_id', $user->id))->exists();
        abort_unless((int) $profile->user_id === (int) $user->id || $user->hasRole('admin') || $assigned, 403);
    }
}
