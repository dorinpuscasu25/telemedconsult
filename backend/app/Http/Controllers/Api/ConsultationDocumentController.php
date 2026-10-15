<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\MedicalDocument;
use App\Notifications\AppEventNotification;
use App\Services\ConsultationPdf;
use App\Services\MedicalDocumentPublisher;
use App\Services\PlatformConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\HttpFoundation\Response;

class ConsultationDocumentController extends Controller
{
    public function index(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $this->authorizeParticipant($request, $consultationRequest);
        $consultation = Consultation::where('consultation_request_id', $consultationRequest->id)->first();
        $documents = $consultation ? MedicalDocument::where('consultation_id', $consultation->id)->orderBy('id')->get() : collect();
        $base = $documents->first(fn ($item) => $item->type === 'consultation_summary' && $item->published_at);
        $deadline = $base?->published_at?->addDays((int) ($base->content_snapshot['addendum_days'] ?? app(PlatformConfig::class)->number('consultations.addendum_days', 14)));

        return response()->json([
            'documents' => $documents->map(fn ($item) => self::serialize($item)),
            'can_addendum' => (bool) ($deadline && now()->lt($deadline) && (int) $consultationRequest->doctor_id === (int) $request->user()->id),
            'addendum_until' => $deadline,
            'prescription_instructions' => app(PlatformConfig::class)->get('prescription.instructions'),
        ])->header('Cache-Control', 'no-store');
    }

    public function addendum(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        abort_unless($request->user()->hasRole('doctor') && (int) $consultationRequest->doctor_id === (int) $request->user()->id, 403);
        $validated = $request->validate(['recommendations' => ['required', 'string', 'max:8000']]);
        $document = DB::transaction(function () use ($consultationRequest, $validated) {
            $consultation = Consultation::where('consultation_request_id', $consultationRequest->id)->lockForUpdate()->firstOrFail();
            $base = MedicalDocument::where('consultation_id', $consultation->id)->where('type', 'consultation_summary')->whereNotNull('published_at')->firstOrFail();
            abort_unless(now()->lt($base->published_at->addDays((int) ($base->content_snapshot['addendum_days'] ?? app(PlatformConfig::class)->number('consultations.addendum_days', 14)))), 422, 'Fereastra completărilor s-a încheiat. Creează o consultație nouă.');

            return app(MedicalDocumentPublisher::class)->publish($consultation, $validated, $base);
        });
        $consultationRequest->patient?->notify(new AppEventNotification('Completare consultație', 'Medicul a publicat o completare. O poți consulta în fișa pacientului.', '/patient/profile?patient_profile='.$consultationRequest->patient_profile_id));

        return response()->json(['document' => self::serialize($document)], 201);
    }

    public function file(MedicalDocument $document): Response
    {
        abort_unless($document->status === 'published' && $document->pdf_path && Storage::disk('local')->exists($document->pdf_path), 404);

        return Storage::disk('local')->response($document->pdf_path, 'consultatie-'.$document->id.'.pdf', ['Content-Type' => 'application/pdf', 'Cache-Control' => 'private, no-store']);
    }

    public function prescriptionFile(MedicalDocument $document): Response
    {
        abort_unless($document->prescription_path && Storage::disk('local')->exists($document->prescription_path), 404);

        return Storage::disk('local')->response($document->prescription_path, 'reteta-'.$document->id.'.'.($document->prescription_mime === 'application/pdf' ? 'pdf' : ($document->prescription_mime === 'image/png' ? 'png' : 'jpg')), ['Content-Type' => $document->prescription_mime, 'Cache-Control' => 'private, no-store']);
    }

    public function preview(Request $request, ConsultationRequest $consultationRequest): Response
    {
        abort_unless($request->user()->hasRole('doctor') && (int) $request->user()->id === (int) $consultationRequest->doctor_id, 403);
        $content = $request->validate([
            'diagnosis' => ['required', 'string', 'max:4000'], 'treatment_plan' => ['nullable', 'string', 'max:4000'],
            'recommendations' => ['nullable', 'string', 'max:4000'], 'prescription_notes' => ['nullable', 'string', 'max:4000'],
            'current_illness_history' => ['nullable', 'string', 'max:4000'], 'objective_exam' => ['nullable', 'string', 'max:4000'],
            'higo_reviewed' => ['nullable', 'boolean'],
        ]);
        $consultation = new Consultation([
            ...$content, 'patient_id' => $consultationRequest->patient_id, 'doctor_id' => $consultationRequest->doctor_id,
            'patient_profile_id' => $consultationRequest->patient_profile_id, 'patient_complaints' => $consultationRequest->symptoms,
            'objective_data_snapshot' => $consultationRequest->objectiveData()->pluck('payload')->all(),
        ]);
        $snapshot = app(MedicalDocumentPublisher::class)->snapshot($consultation);
        $snapshot['consultation_id'] = $consultationRequest->id;
        $snapshot['document_id'] = 'PREVIZUALIZARE';

        return response(app(ConsultationPdf::class)->render($snapshot), 200, ['Content-Type' => 'application/pdf', 'Cache-Control' => 'no-store']);
    }

    public static function serialize(MedicalDocument $item): array
    {
        return [
            'id' => $item->id, 'title' => $item->title, 'type' => $item->type, 'status' => $item->status,
            'parent_document_id' => $item->parent_document_id, 'published_at' => $item->published_at,
            'url' => $item->status === 'published' && $item->pdf_path ? URL::temporarySignedRoute('medical-document.file', now()->addMinutes(15), ['document' => $item->id]) : null,
            'prescription_url' => $item->prescription_path ? URL::temporarySignedRoute('medical-document.prescription', now()->addMinutes(15), ['document' => $item->id]) : null,
        ];
    }

    private function authorizeParticipant(Request $request, ConsultationRequest $consultation): void
    {
        abort_unless($request->user()->hasRole('admin') || in_array((int) $request->user()->id, array_map('intval', array_filter([$consultation->patient_id, $consultation->doctor_id, $consultation->operator_id])), true), 403);
    }
}
