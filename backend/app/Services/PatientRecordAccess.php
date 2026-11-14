<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\PatientProfile;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

class PatientRecordAccess
{
    public const MONITORING_DAYS = 10;

    public function expiresAt(ConsultationRequest $request): ?CarbonInterface
    {
        $published = $request->conclusion_sent_at ?? $request->completed_at;

        return $published?->copy()->addDays(self::MONITORING_DAYS);
    }

    public function windowOpen(ConsultationRequest $request): bool
    {
        if (in_array($request->status, ['cancelled', 'rejected', 'expired', 'no_operator_available'], true)) {
            return false;
        }
        $deadline = $this->expiresAt($request);

        return $deadline ? $deadline->isFuture() : in_array($request->status, ['new', 'accepted', 'rescheduled'], true);
    }

    public function canReadProfile(?User $viewer, PatientProfile $profile): bool
    {
        if (! $viewer) {
            return false;
        }
        if ((int) $viewer->id === (int) $profile->user_id || $viewer->hasRole('admin')) {
            return true;
        }

        return $profile->consultationRequests()->whereNotIn('status', ['cancelled', 'rejected', 'expired', 'no_operator_available'])
            ->where(fn ($query) => $query->where('doctor_id', $viewer->id)->orWhere('operator_id', $viewer->id))
            ->get()->contains(fn ($request) => ((int) $request->operator_id === (int) $viewer->id && $viewer->hasRole('operator')) || $this->windowOpen($request));
    }

    public function canReadRequest(?User $viewer, ConsultationRequest $request): bool
    {
        if (! $viewer) {
            return false;
        }
        if ((int) $request->patient_id === (int) $viewer->id || $viewer->hasRole('admin')) {
            return true;
        }
        if (! in_array((int) $viewer->id, array_map('intval', array_filter([$request->doctor_id, $request->operator_id])), true)) {
            return false;
        }
        if ((int) $request->operator_id === (int) $viewer->id && $viewer->hasRole('operator')) {
            return true;
        }

        return $this->windowOpen($request) || ($request->patientProfile && $this->canReadProfile($viewer, $request->patientProfile));
    }

    public function canReadConversation(?User $viewer, Conversation $conversation): bool
    {
        if (! $viewer || ! in_array((int) $viewer->id, array_map('intval', array_filter([$conversation->patient_id, $conversation->doctor_id, $conversation->operator_id])), true)) {
            return false;
        }
        if ((int) $conversation->patient_id === (int) $viewer->id || ! $conversation->consultation_request_id || $viewer->hasRole('admin')) {
            return true;
        }
        $request = $conversation->consultationRequest;

        return $request && ((int) $conversation->operator_id === (int) $viewer->id || $this->windowOpen($request));
    }

    public function signedViewer(Request $request): ?User
    {
        return $request->filled('viewer') ? User::find($request->integer('viewer')) : null;
    }

    public function fileUrl(string $route, array $parameters, ?User $viewer = null): ?string
    {
        $viewer ??= auth('sanctum')->user();

        return $viewer ? URL::temporarySignedRoute($route, now()->addMinutes(15), [...$parameters, 'viewer' => $viewer->id]) : null;
    }

    public function conversation(Conversation $conversation, ?User $viewer): array
    {
        $data = $conversation->toArray();
        if (isset($data['consultation_request'])) {
            unset($data['consultation_request']['conclusion_draft']);
        }
        $canRead = $this->canReadConversation($viewer, $conversation);
        $data['record_access_expired'] = ! $canRead;
        if (! $canRead) {
            $data['messages'] = [];
            $data['patient_profile'] = null;
            $data['consultation_request'] = null;
            $data['chat'] = ['state' => 'closed', 'can_write' => false, 'can_reactivate' => false, 'message' => 'Perioada de monitorizare s-a încheiat.'];
        } elseif ($conversation->patientProfile && ! $this->canReadProfile($viewer, $conversation->patientProfile)) {
            $data['patient_profile'] = null;
        }

        return $data;
    }
}
