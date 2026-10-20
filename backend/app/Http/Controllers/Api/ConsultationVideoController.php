<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\VideoCallInvitation;
use App\Notifications\AppEventNotification;
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
                'patient_profile' => $consultationRequest->patientProfile ? ['id' => $consultationRequest->patientProfile->id, 'display_name' => $consultationRequest->patientProfile->display_name, 'patient_code' => $consultationRequest->patientProfile->patient_code] : null,
                'specialty' => $consultationRequest->specialty?->name,
                'scheduled_at' => $consultationRequest->scheduled_at,
                'doctor_started_at' => $consultationRequest->doctor_started_at,
                'conversation_id' => $chat?->id,
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function invite(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $this->authorizeParticipant($request, $consultationRequest);
        abort_unless($consultationRequest->status === 'accepted' && $consultationRequest->doctor_id
            && ! $consultationRequest->conclusion_sent_at && ! $consultationRequest->closed_at
            && ! $consultationRequest->completed_at && ! $consultationRequest->cancelled_at
            && app(ConsultationStateMachine::class)->readyForDoctor($consultationRequest), 422, 'Consultația trebuie confirmată înainte de invitația video.');
        $call = DB::transaction(function () use ($request, $consultationRequest) {
            $item = ConsultationRequest::lockForUpdate()->findOrFail($consultationRequest->id);
            $this->authorizeParticipant($request, $item);
            abort_unless($this->canRing($item), 422, 'Consultația nu mai este disponibilă pentru apel.');
            $callerIsPatient = (int) $request->user()->id === (int) $item->patient_id;
            $recipientId = $callerIsPatient ? $item->doctor_id : $item->patient_id;
            $existing = VideoCallInvitation::where('consultation_request_id', $item->id)->where('status', 'ringing')->where('expires_at', '>', now())->latest('id')->first();
            if ($existing && $this->validCall($existing)) {
                return $existing;
            }
            $existing?->update(['status' => 'cancelled', 'responded_at' => now()]);

            return VideoCallInvitation::create([
                'consultation_request_id' => $item->id, 'caller_id' => $request->user()->id,
                'recipient_id' => $recipientId, 'expires_at' => now()->addSeconds(75),
            ]);
        });
        if ($call->wasRecentlyCreated) {
            $call->loadMissing(['recipient', 'consultationRequest.patientProfile']);
            $call->recipient?->notify(new AppEventNotification(
                'Invitație la consultația video',
                $request->user()->name.' te sună pentru pacientul '.($call->consultationRequest->patientProfile?->display_name ?? 'din consultație').'.',
                '/consultations/'.$consultationRequest->id.'/video',
            ));
        }

        return response()->json(['message' => 'Apelul sună. Așteptăm răspunsul celuilalt participant.', 'call' => $this->serializeCall($call)])->header('Cache-Control', 'no-store');
    }

    public function incoming(Request $request): JsonResponse
    {
        $calls = VideoCallInvitation::with(['caller', 'recipient', 'consultationRequest.patientProfile'])
            ->where('recipient_id', $request->user()->id)->where('status', 'ringing')->where('expires_at', '>', now())
            ->latest('id')->limit(10)->get()->filter(fn ($call) => $this->validCall($call));

        return response()->json(['calls' => $calls->map(fn ($call) => $this->serializeCall($call))->values()])->header('Cache-Control', 'no-store');
    }

    public function currentCall(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $this->authorizeParticipant($request, $consultationRequest);
        $call = VideoCallInvitation::where('consultation_request_id', $consultationRequest->id)
            ->where(fn ($query) => $query->where('caller_id', $request->user()->id)->orWhere('recipient_id', $request->user()->id))
            ->latest('id')->first();

        return response()->json(['call' => $call ? $this->serializeCall($call) : null])->header('Cache-Control', 'no-store');
    }

    public function respondCall(Request $request, VideoCallInvitation $videoCallInvitation): JsonResponse
    {
        $validated = $request->validate(['action' => ['required', 'in:accept,decline,cancel']]);
        $call = DB::transaction(function () use ($request, $videoCallInvitation, $validated) {
            $item = ConsultationRequest::lockForUpdate()->findOrFail($videoCallInvitation->consultation_request_id);
            $call = VideoCallInvitation::lockForUpdate()->findOrFail($videoCallInvitation->id);
            $this->authorizeParticipant($request, $item);
            $isCancel = $validated['action'] === 'cancel';
            abort_unless((int) $request->user()->id === (int) ($isCancel ? $call->caller_id : $call->recipient_id), 403);
            abort_unless($call->status === 'ringing' && $call->expires_at->isFuture() && $this->validCall($call), 422, 'Apelul nu mai sună. Poți iniția un apel nou.');
            abort_if($validated['action'] === 'accept' && ! $this->available($item), 422, 'Medicul trebuie să deschidă consultația înainte să intrați în apel.');
            $call->update(['status' => match ($validated['action']) {
                'accept' => 'accepted', 'decline' => 'declined', default => 'cancelled'
            }, 'responded_at' => now()]);

            return $call;
        });

        return response()->json(['call' => $this->serializeCall($call)])->header('Cache-Control', 'no-store');
    }

    private function canRing(ConsultationRequest $item): bool
    {
        return $item->status === 'accepted' && $item->doctor_id && ! $item->conclusion_sent_at && ! $item->closed_at
            && ! $item->completed_at && ! $item->cancelled_at && app(ConsultationStateMachine::class)->readyForDoctor($item);
    }

    private function validCall(VideoCallInvitation $call): bool
    {
        $item = $call->consultationRequest;
        $participants = array_map('intval', array_filter([$item?->patient_id, $item?->doctor_id, $item?->consultation_kind === 'with_exam' ? $item?->operator_id : null]));

        return $item && $this->canRing($item) && in_array((int) $call->caller_id, $participants, true) && in_array((int) $call->recipient_id, $participants, true);
    }

    private function serializeCall(VideoCallInvitation $call): array
    {
        $call->loadMissing(['caller', 'recipient', 'consultationRequest.patientProfile']);
        $status = ! $this->validCall($call) ? 'cancelled' : ($call->status === 'ringing' && ! $call->expires_at->isFuture() ? 'missed' : $call->status);

        return ['id' => $call->id, 'request_id' => $call->consultation_request_id, 'caller_id' => $call->caller_id,
            'caller_name' => $call->caller?->name, 'recipient_id' => $call->recipient_id, 'recipient_name' => $call->recipient?->name,
            'patient_name' => $call->consultationRequest->patientProfile?->display_name,
            'status' => $status, 'expires_at' => $call->expires_at->toISOString()];
    }

    public function token(Request $request, ConsultationRequest $consultationRequest, LiveKitService $livekit): JsonResponse
    {
        return DB::transaction(function () use ($request, $consultationRequest, $livekit) {
            $consultation = ConsultationRequest::query()->lockForUpdate()->findOrFail($consultationRequest->id);
            $this->authorizeParticipant($request, $consultation);
            abort_unless($this->available($consultation), 422, 'Așteaptă ca medicul să deschidă consultația la ora confirmată.');
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
            && $consultation->doctor_started_at !== null
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
