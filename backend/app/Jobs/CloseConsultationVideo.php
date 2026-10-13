<?php

namespace App\Jobs;

use App\Models\ConsultationRequest;
use App\Services\LiveKitService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class CloseConsultationVideo implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public int $consultationRequestId) {}

    public function backoff(): array
    {
        return [5, 15, 30, 60];
    }

    public function handle(LiveKitService $livekit): void
    {
        $consultation = ConsultationRequest::find($this->consultationRequestId);
        if ($consultation && in_array($consultation->status, ['completed', 'cancelled', 'rejected', 'expired'], true)) {
            $livekit->closeRoom($consultation);
        }
    }
}
