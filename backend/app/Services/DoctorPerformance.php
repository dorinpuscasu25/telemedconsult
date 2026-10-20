<?php

namespace App\Services;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;

class DoctorPerformance
{
    public function forDoctor(DoctorProfile $profile): array
    {
        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();
        $completed = Consultation::where('doctor_id', $profile->user_id)->where('status', 'completed');
        $current = (clone $completed)->whereBetween('completed_at', [$monthStart, $monthEnd])->count();
        $previous = (clone $completed)->where('completed_at', '<', $monthStart)->count();
        $response = ConsultationRequest::where('doctor_id', $profile->user_id)->whereNotNull('doctor_response_minutes')->avg('doctor_response_minutes');
        $average = (int) round((float) $response);
        $components = [
            'current_month' => $current * 4,
            'previous_consultations' => $previous * 1.5,
            'rating' => (float) $profile->rating * 10,
            'response' => max(0, 60 - min(60, $average)),
        ];

        return [
            'score' => round(array_sum($components), 2),
            'current_month_consultations' => $current,
            'previous_total_consultations' => $previous,
            'rating' => (float) $profile->rating,
            'average_response_minutes' => $response !== null ? $average : null,
            'components' => $components,
            'response_uses_default' => $response === null,
        ];
    }
}
