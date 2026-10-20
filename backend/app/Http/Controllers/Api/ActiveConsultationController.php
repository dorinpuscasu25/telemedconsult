<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Services\ConsultationStateMachine;
use App\Services\LiveKitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ActiveConsultationController extends Controller
{
    public function index(Request $request, ConsultationStateMachine $stateMachine, LiveKitService $livekit): JsonResponse
    {
        $validated = $request->validate(['role' => ['required', Rule::in(['patient', 'doctor', 'operator'])]]);
        $user = $request->user();
        abort_unless($user->hasRole($validated['role']), 403);
        $column = $validated['role'].'_id';
        $consultations = ConsultationRequest::query()
            ->with(['patient:id,name', 'doctor:id,name', 'patientProfile:id,first_name,last_name,pseudonymized,patient_code'])
            ->where($column, $user->id)
            ->whereIn('status', ['accepted', 'rescheduled'])
            ->whereNull('conclusion_sent_at')->whereNull('closed_at')->whereNull('cancelled_at')->whereNull('completed_at')
            ->orderByDesc('doctor_started_at')->latest('accepted_at')->latest('id')->get();
        $chats = Conversation::whereIn('consultation_request_id', $consultations->modelKeys())
            ->where($column, $user->id)->get(['id', 'consultation_request_id'])->keyBy('consultation_request_id');

        return response()->json(['data' => $consultations->map(fn ($item) => [
            'id' => (string) $item->id,
            'status' => $item->status,
            'doctor_started_at' => $item->doctor_started_at,
            'scheduled_at' => $item->scheduled_at,
            'doctor_name' => $item->doctor?->name,
            'patient_code' => $item->patientProfile?->patient_code,
            'patient_name' => $item->patientProfile
                ? $item->patientProfile->display_name
                : $item->patient?->name,
            'conversation_id' => $chats->get($item->id)?->id,
            'video_available' => $item->status === 'accepted' && $item->doctor_id !== null && $stateMachine->readyForDoctor($item)
                && $item->doctor_started_at !== null
                && $livekit->configured() && ($validated['role'] !== 'operator' || $item->consultation_kind === 'with_exam'),
        ])])->header('Cache-Control', 'no-store');
    }
}
