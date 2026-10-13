<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
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
        $consultationRequest->loadMissing(['patient', 'patientProfile', 'doctor', 'operator', 'specialty']);
        $participants = collect([$consultationRequest->patient, $consultationRequest->doctor, ...($consultationRequest->consultation_kind === 'with_exam' ? [$consultationRequest->operator] : [])])
            ->filter()
            ->unique('id')->map(fn ($user) => ['id' => $user->id, ...$livekit->participantDetails($consultationRequest, $user)])->values();
        $chat = Conversation::where('consultation_request_id', $consultationRequest->id)
            ->where(fn ($query) => $query->where('patient_id', $request->user()->id)->orWhere('doctor_id', $request->user()->id)->orWhere('operator_id', $request->user()->id))->first();

        return response()->json([
            'available' => $this->available($consultationRequest),
            'configured' => $livekit->configured(),
            'status' => $consultationRequest->status,
            'participant' => $livekit->participantDetails($consultationRequest, $request->user()),
            'consultation' => [
                'participants' => $participants,
                'specialty' => $consultationRequest->specialty?->name,
                'scheduled_at' => $consultationRequest->scheduled_at,
                'doctor_started_at' => $consultationRequest->doctor_started_at,
                'conversation_id' => $chat?->id,
            ],
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
                'participant' => $livekit->participantDetails($consultation, $request->user()),
            ])->header('Cache-Control', 'no-store');
        });
    }

    private function available(ConsultationRequest $consultation): bool
    {
        return $consultation->status === 'accepted' && $consultation->doctor_id !== null
            && ! $consultation->conclusion_sent_at && ! $consultation->closed_at && ! $consultation->completed_at && ! $consultation->cancelled_at
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
