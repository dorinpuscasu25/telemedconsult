<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\DoctorProfileView;
use App\Models\DoctorReview;
use App\Models\OperatorReview;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

class PatientEngagementController extends Controller
{
    public function complaints(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $complaints = Complaint::with(['reportedUser'])
            ->where('patient_id', $user->id)
            ->latest()
            ->get()
            ->map(fn (Complaint $complaint) => $this->serializeComplaint($complaint));

        $requests = ConsultationRequest::with(['doctor', 'operator'])
            ->where('patient_id', $user->id)
            ->latest()
            ->limit(50)
            ->get()
            ->map(fn (ConsultationRequest $item) => [
                'id' => (string) $item->id,
                'label' => sprintf(
                    '%s #%s - %s',
                    $item->type === 'operator' ? 'Operator' : 'Medic',
                    $item->id,
                    $item->doctor?->name ?? $item->operator?->name ?? 'Nealocat'
                ),
                'doctor_id' => $item->doctor_id,
                'operator_id' => $item->operator_id,
                'status' => $item->status,
            ]);

        return response()->json(['data' => $complaints, 'requests' => $requests]);
    }

    public function storeComplaint(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $validated = $request->validate([
            'consultation_request_id' => ['nullable', Rule::exists('consultation_requests', 'id')->where(fn ($query) => $query->where('patient_id', $user->id))],
            'reported_user_id' => ['nullable', 'exists:users,id'],
            'subject' => ['required', 'string', 'max:255'],
            'description' => ['required', 'string', 'max:4000'],
        ]);

        if (! empty($validated['consultation_request_id']) && empty($validated['reported_user_id'])) {
            $source = ConsultationRequest::find($validated['consultation_request_id']);
            $validated['reported_user_id'] = $source?->doctor_id ?: $source?->operator_id;
        }

        $complaint = Complaint::create([
            'patient_id' => $user->id,
            'reported_user_id' => $validated['reported_user_id'] ?? null,
            'consultation_request_id' => $validated['consultation_request_id'] ?? null,
            'subject' => $validated['subject'],
            'description' => $validated['description'],
            'status' => 'new',
        ]);

        $this->notifyAdmins(
            'Reclamație nouă',
            $user->name.' a trimis o reclamație: '.$complaint->subject,
            '/admin/complaints',
            $this->settingBool('notify_complaints', true),
            'warning'
        );

        return response()->json([
            'message' => 'Reclamația a fost trimisă.',
            'complaint' => $this->serializeComplaint($complaint->fresh('reportedUser')),
        ], 201);
    }

    public function reviewableRequests(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $doctorReviewedRequestIds = DoctorReview::where('patient_id', $user->id)
            ->whereNotNull('consultation_request_id')
            ->pluck('consultation_request_id');
        $operatorReviewedRequestIds = OperatorReview::where('patient_id', $user->id)
            ->whereNotNull('consultation_request_id')
            ->pluck('consultation_request_id');

        $requests = ConsultationRequest::with(['doctor.doctorProfile.specialty'])
            ->where('patient_id', $user->id)
            ->where('status', 'completed')
            ->where(function ($query) use ($doctorReviewedRequestIds, $operatorReviewedRequestIds) {
                $query->where(function ($doctorQuery) use ($doctorReviewedRequestIds) {
                    $doctorQuery->whereNotNull('doctor_id')->whereNotIn('id', $doctorReviewedRequestIds);
                })->orWhere(function ($operatorQuery) use ($operatorReviewedRequestIds) {
                    $operatorQuery->whereNotNull('operator_id')->whereNotIn('id', $operatorReviewedRequestIds);
                });
            })
            ->latest('completed_at')
            ->limit(20)
            ->get()
            ->map(fn (ConsultationRequest $item) => [
                'id' => (string) $item->id,
                'doctor_id' => (string) $item->doctor_id,
                'doctor_name' => $item->doctor?->name,
                'operator_id' => $item->operator_id ? (string) $item->operator_id : null,
                'operator_name' => $item->operator?->name,
                'specialty' => $item->doctor?->doctorProfile?->specialty?->name,
                'completed_at' => $item->completed_at,
            ]);

        return response()->json(['data' => $requests]);
    }

    public function storeReview(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless((int) $consultationRequest->patient_id === (int) $user->id || $user->hasRole('admin'), 403);
        abort_unless($consultationRequest->status === 'completed', 422, 'Poți evalua doar consultațiile finalizate.');

        $validated = $request->validate([
            'provider_type' => ['nullable', Rule::in(['doctor', 'operator', 'both'])],
            'operator_rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'operator_comment' => ['nullable', 'string', 'max:2000'],
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['required', 'string', 'max:2000'],
        ]);

        $review = DB::transaction(function () use ($consultationRequest, $user, $validated) {
            $review = null;
            $providerType = $validated['provider_type'] ?? 'both';

            if ($consultationRequest->doctor_id && in_array($providerType, ['doctor', 'both'], true)) {
                $review = DoctorReview::updateOrCreate(
                    [
                        'patient_id' => $user->id,
                        'consultation_request_id' => $consultationRequest->id,
                    ],
                    [
                        'doctor_id' => $consultationRequest->doctor_id,
                        'rating' => $validated['rating'],
                        'comment' => $validated['comment'],
                    ],
                );

                $this->refreshDoctorRating($consultationRequest->doctor_id);
            }

            if ($consultationRequest->operator_id && in_array($providerType, ['operator', 'both'], true)) {
                OperatorReview::updateOrCreate(
                    [
                        'patient_id' => $user->id,
                        'consultation_request_id' => $consultationRequest->id,
                    ],
                    [
                        'operator_id' => $consultationRequest->operator_id,
                        'patient_profile_id' => $consultationRequest->patient_profile_id,
                        'rating' => $validated['operator_rating'] ?? $validated['rating'],
                        'comment' => $validated['operator_comment'] ?? $validated['comment'],
                    ],
                );
            }

            $doctorDone = ! $consultationRequest->doctor_id || DoctorReview::where('patient_id', $user->id)->where('consultation_request_id', $consultationRequest->id)->exists();
            $operatorDone = ! $consultationRequest->operator_id || OperatorReview::where('patient_id', $user->id)->where('consultation_request_id', $consultationRequest->id)->exists();

            if ($doctorDone && $operatorDone) {
                $consultationRequest->forceFill(['closed_at' => now()])->save();
            }

            return $review;
        });

        $doctor = User::find($consultationRequest->doctor_id);
        if ($doctor && $review) {
            $doctor->notify(new AppEventNotification(
                'Recenzie nouă',
                $user->name.' a lăsat o evaluare de '.$review->rating.'/5.',
                '/doctor/stats',
                'success',
            ));
        }

        return response()->json(['message' => 'Recenzia a fost salvată.', 'review' => $review?->fresh()], 201);
    }

    public function doctorReviews(User $doctor): JsonResponse
    {
        $reviews = DoctorReview::with('patient')
            ->where('doctor_id', $doctor->id)
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn (DoctorReview $review) => [
                'id' => $review->id,
                'patient' => $review->patient?->name,
                'rating' => $review->rating,
                'comment' => $review->comment,
                'created_at' => $review->created_at,
            ]);

        return response()->json(['data' => $reviews]);
    }

    public function storeDoctorProfileView(Request $request, User $doctor): JsonResponse
    {
        abort_unless($doctor->doctorProfile()->exists(), 404);

        $viewerId = $request->user()?->id;
        $ipHash = $request->ip() ? hash('sha256', $request->ip()) : null;

        $alreadyTracked = DoctorProfileView::query()
            ->where('doctor_id', $doctor->id)
            ->where('created_at', '>=', now()->subHours(12))
            ->when($viewerId, fn ($query) => $query->where('viewer_id', $viewerId))
            ->when(! $viewerId && $ipHash, fn ($query) => $query->where('ip_hash', $ipHash))
            ->exists();

        if (! $alreadyTracked) {
            DoctorProfileView::create([
                'doctor_id' => $doctor->id,
                'viewer_id' => $viewerId,
                'ip_hash' => $ipHash,
            ]);
        }

        return response()->json(['ok' => true]);
    }

    private function serializeComplaint(Complaint $complaint): array
    {
        return [
            'id' => $complaint->id,
            'reportedUser' => $complaint->reportedUser?->name,
            'consultation_request_id' => $complaint->consultation_request_id,
            'date' => $complaint->created_at,
            'status' => $complaint->status,
            'subject' => $complaint->subject,
            'description' => $complaint->description,
            'resolution_note' => $complaint->resolution_note,
            'coupon_code' => $complaint->coupon_code,
            'coupon_amount' => $complaint->coupon_amount_minor ? $complaint->coupon_amount_minor / 100 : null,
        ];
    }

    private function refreshDoctorRating(int $doctorId): void
    {
        $stats = DoctorReview::where('doctor_id', $doctorId)
            ->selectRaw('AVG(rating) as rating, COUNT(*) as reviews_count')
            ->first();

        DoctorProfile::where('user_id', $doctorId)->update([
            'rating' => round((float) $stats->rating, 1),
            'reviews_count' => (int) $stats->reviews_count,
        ]);
    }

    private function notifyAdmins(string $title, string $body, string $url, bool $sendEmail, string $level = 'info'): void
    {
        $admins = User::whereHas('roles', fn ($query) => $query->where('name', 'admin'))->get();
        Notification::send($admins, new AppEventNotification($title, $body, $url, $level, $sendEmail));
    }

    private function settingBool(string $key, bool $default): bool
    {
        $setting = PlatformSetting::where('key', $key)->first();

        if ($setting === null) {
            return $default;
        }

        return filter_var($setting->value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }
}
