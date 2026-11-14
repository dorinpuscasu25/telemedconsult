<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorReview;
use App\Models\OperatorReview;
use App\Models\User;

class ConsultationResultAccess
{
    public function reviewsComplete(ConsultationRequest $request): bool
    {
        $doctorDone = ! $request->doctor_id || DoctorReview::where('patient_id', $request->patient_id)->where('consultation_request_id', $request->id)->exists();
        $operatorDone = ! $request->operator_id || OperatorReview::where('patient_id', $request->patient_id)->where('consultation_request_id', $request->id)->exists();

        return $doctorDone && $operatorDone;
    }

    public function unlocked(ConsultationRequest $request): bool
    {
        return $request->closed_at !== null && $this->reviewsComplete($request);
    }

    public function canRead(ConsultationRequest $request, ?User $viewer): bool
    {
        if ($viewer && (int) $viewer->id !== (int) $request->patient_id) {
            return $viewer->hasRole('admin') || in_array((int) $viewer->id, array_map('intval', array_filter([$request->doctor_id, $request->operator_id])), true);
        }

        return $this->unlocked($request);
    }

    public function conversation(Conversation $conversation, ?User $viewer = null): array
    {
        $data = $conversation->toArray();
        if (isset($data['consultation_request'])) {
            unset($data['consultation_request']['conclusion_draft']);
        }

        return $data;
    }
}
