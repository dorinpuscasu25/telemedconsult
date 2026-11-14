<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\HigoExamPayload;
use Illuminate\Validation\ValidationException;

class HigoReviewEvidence
{
    public function exams(ConsultationRequest $request): array
    {
        return HigoExamPayload::with('objectiveData')->where('consultation_request_id', $request->id)
            ->where('patient_profile_id', $request->patient_profile_id)->where('status', HigoExamPayload::STATUS_MAPPED)
            ->whereHas('objectiveData', fn ($query) => $query->whereNotNull('completed_at'))->latest('id')->get()
            ->map(fn ($exam) => ['id' => (string) $exam->id, 'external_id' => $exam->external_id, 'performed_at' => $exam->objectiveData->completed_at->toIso8601String()])->all();
    }

    public function resolve(ConsultationRequest $request, array $input): array
    {
        $exams = $this->exams($request);
        if ($input['higo_status'] === 'not_performed') {
            if ($exams !== []) {
                throw ValidationException::withMessages(['higo_status' => ['Există o examinare HIGO pentru această consultație. Consultă datele și selectează examinarea.']]);
            }

            return ['higo_status' => 'not_performed', 'higo_reviewed' => false, 'higo_exam_id' => null, 'higo_exam_performed_at' => null, 'higo_reviewed_at' => null];
        }
        $exam = collect($exams)->firstWhere('id', (string) ($input['higo_exam_id'] ?? ''));
        if (! $exam) {
            throw ValidationException::withMessages(['higo_exam_id' => ['Selectează examinarea HIGO a acestei consultații, cu date disponibile.']]);
        }

        return ['higo_status' => 'reviewed', 'higo_reviewed' => true, 'higo_exam_id' => (int) $exam['id'], 'higo_exam_performed_at' => $exam['performed_at'], 'higo_reviewed_at' => now()];
    }
}
