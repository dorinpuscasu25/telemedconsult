<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CoordinatorController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $coordinator = $request->user()->loadMissing('roles', 'coordinatorProfile');
        abort_unless($coordinator->hasRole('coordinator') || $coordinator->hasRole('admin'), 403, 'Ai nevoie de rol coordonator.');

        $requests = ConsultationRequest::with(['patient', 'doctor', 'operator', 'coordinator', 'specialty'])
            ->whereIn('status', ['new', 'accepted', 'rescheduled'])
            ->latest()
            ->limit(100)
            ->get();

        return response()->json([
            'summary' => [
                'new_requests' => $requests->where('status', 'new')->count(),
                'rescheduled_requests' => $requests->where('status', 'rescheduled')->count(),
                'assigned_to_me' => $requests->where('coordinator_id', $coordinator->id)->count(),
                'unassigned' => $requests->whereNull('coordinator_id')->count(),
            ],
            'requests' => $requests->map(fn (ConsultationRequest $item) => $this->serializeRequest($item))->values(),
            'doctors' => User::whereHas('roles', fn ($query) => $query->where('name', 'doctor'))
                ->with('doctorProfile.specialty')
                ->orderBy('name')
                ->get()
                ->map(fn (User $doctor) => [
                    'id' => (string) $doctor->id,
                    'name' => $doctor->name,
                    'specialty' => $doctor->doctorProfile?->specialty?->name,
                    'is_available' => (bool) $doctor->doctorProfile?->is_available,
                ]),
            'operators' => User::whereHas('roles', fn ($query) => $query->where('name', 'operator'))
                ->with('operatorProfile')
                ->orderBy('name')
                ->get()
                ->map(fn (User $operator) => [
                    'id' => (string) $operator->id,
                    'name' => $operator->name,
                    'region' => $operator->operatorProfile?->region,
                    'is_available' => (bool) $operator->operatorProfile?->is_available,
                ]),
        ]);
    }

    public function claim(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $coordinator = $request->user()->loadMissing('roles');
        abort_unless($coordinator->hasRole('coordinator') || $coordinator->hasRole('admin'), 403);

        $consultationRequest->forceFill(['coordinator_id' => $coordinator->id])->save();

        return response()->json([
            'message' => 'Solicitarea a fost preluată.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'coordinator', 'specialty'])),
        ]);
    }

    public function assignProvider(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $coordinator = $request->user()->loadMissing('roles');
        abort_unless($coordinator->hasRole('coordinator') || $coordinator->hasRole('admin'), 403);
        abort_unless(in_array($consultationRequest->status, ['new', 'accepted', 'rescheduled'], true), 422, 'Solicitarea nu mai poate fi alocată.');

        $validated = $request->validate([
            'provider_type' => ['required', Rule::in(['doctor', 'operator'])],
            'provider_id' => ['required', 'exists:users,id'],
            'triage_notes' => ['nullable', 'string', 'max:3000'],
        ]);

        $provider = User::with('roles')->findOrFail($validated['provider_id']);
        abort_unless($provider->hasRole($validated['provider_type']), 422, 'Providerul ales nu are rolul potrivit.');

        $payload = [
            'coordinator_id' => $coordinator->id,
            'triage_notes' => $validated['triage_notes'] ?? $consultationRequest->triage_notes,
        ];

        if ($validated['provider_type'] === 'doctor') {
            $payload['doctor_id'] = $provider->id;
            $payload['type'] = 'doctor';
        } else {
            $payload['operator_id'] = $provider->id;
            $payload['type'] = 'operator';
        }

        $consultationRequest->forceFill($payload)->save();

        $provider->notify(new AppEventNotification(
            'Solicitare alocată',
            'Coordonatorul '.$coordinator->name.' ți-a alocat o solicitare nouă.',
            '/'.$validated['provider_type'],
            'info',
        ));

        return response()->json([
            'message' => 'Provider alocat.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'coordinator', 'specialty'])),
        ]);
    }

    private function serializeRequest(ConsultationRequest $item): array
    {
        return [
            'id' => (string) $item->id,
            'type' => $item->type,
            'status' => $item->status,
            'symptoms' => $item->symptoms,
            'triage_notes' => $item->triage_notes,
            'scheduled_at' => $item->scheduled_at,
            'created_at' => $item->created_at,
            'patient' => $item->patient ? ['id' => (string) $item->patient->id, 'name' => $item->patient->name, 'email' => $item->patient->email] : null,
            'doctor' => $item->doctor ? ['id' => (string) $item->doctor->id, 'name' => $item->doctor->name] : null,
            'operator' => $item->operator ? ['id' => (string) $item->operator->id, 'name' => $item->operator->name] : null,
            'coordinator' => $item->coordinator ? ['id' => (string) $item->coordinator->id, 'name' => $item->coordinator->name] : null,
            'specialty' => $item->specialty?->name,
        ];
    }
}
