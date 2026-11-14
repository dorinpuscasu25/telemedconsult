<?php

namespace App\Jobs;

use App\Models\ConsultationRequest;
use App\Services\LiveKitService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class CloseConsultationVideo implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $timeout = 55;

    public function __construct(public int $consultationRequestId, public ?string $roomName = null, public ?array $participantIds = null) {}

    public function backoff(): array
    {
        return [5, 15, 30, 60];
    }

    public function handle(LiveKitService $livekit): void
    {
        $consultation = ConsultationRequest::find($this->consultationRequestId);
        $oldSession = $consultation && $this->roomName !== null && $this->roomName !== $livekit->roomName($consultation);
        if ($consultation && ($oldSession || in_array($consultation->status, ['completed', 'cancelled', 'rejected', 'expired'], true) || ($consultation->consultation_kind === 'with_exam' && ($consultation->higo_proposal['status'] ?? null) === 'accepted' && ! $consultation->objective_data_completed_at))) {
            $livekit->closeRoom($consultation, $this->roomName, $this->participantIds);
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::error('Închiderea camerei LiveKit a eșuat după reîncercări.', [
            'consultation_request_id' => $this->consultationRequestId,
            'exception_class' => $exception ? $exception::class : null,
        ]);
    }
}
