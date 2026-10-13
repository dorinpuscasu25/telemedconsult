<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Services\ConsultationStateMachine;
use App\Services\LiveKitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConsultationVideoController extends Controller
{
    public function status(Request $request, ConsultationRequest $consultationRequest, LiveKitService $livekit): JsonResponse
    {
        $this->authorizeParticipant($request, $consultationRequest);

        return response()->json([
            'available' => $this->available($consultationRequest),
            'configured' => $livekit->configured(),
            'status' => $consultationRequest->status,
        ])->header('Cache-Control', 'no-store');
    }

    public function token(Request $request, ConsultationRequest $consultationRequest, LiveKitService $livekit): JsonResponse
    {
        return DB::transaction(function () use ($request, $consultationRequest, $livekit) {
            $consultation = ConsultationRequest::query()->lockForUpdate()->findOrFail($consultationRequest->id);
            $this->authorizeParticipant($request, $consultation);
            abort_unless($this->available($consultation), 422, 'Apelul este disponibil după acceptare și până la finalizarea consultației.');
            abort_unless($livekit->configured(), 503, 'Consultațiile video nu sunt încă configurate. Contactează administratorul.');

            return response()->json([
                'server_url' => config('services.livekit.url'),
                'participant_token' => $livekit->joinToken($consultation, $request->user()),
            ])->header('Cache-Control', 'no-store');
        });
    }

    private function available(ConsultationRequest $consultation): bool
    {
        return $consultation->status === 'accepted' && $consultation->doctor_id !== null
            && ! $consultation->conclusion_sent_at && ! $consultation->closed_at
            && app(ConsultationStateMachine::class)->readyForDoctor($consultation);
    }

    private function authorizeParticipant(Request $request, ConsultationRequest $consultation): void
    {
        $ids = [$consultation->patient_id, $consultation->doctor_id];
        if ($consultation->consultation_kind === 'with_exam') {
            $ids[] = $consultation->operator_id;
        }
        abort_unless(in_array((int) $request->user()->id, array_map('intval', array_filter($ids)), true), 403);
    }
}
