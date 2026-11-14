<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\User;

class DoctorResponseTime
{
    public function record(ConsultationRequest $request, User $actor): void
    {
        if ((int) $request->doctor_id !== (int) $actor->id || ! $actor->hasRole('doctor')) {
            return;
        }
        $minutes = max(0, (now()->timestamp - $request->created_at->timestamp) / 60);
        ConsultationRequest::whereKey($request->id)->whereNull('doctor_responded_at')->update([
            'doctor_responded_at' => now(), 'doctor_response_minutes' => (int) ceil($minutes),
        ]);
    }
}
