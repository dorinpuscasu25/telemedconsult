<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorAvailability;
use App\Models\DoctorInvestigationRequirement;
use App\Models\DoctorProfile;
use App\Models\DoctorProfileView;
use App\Models\DoctorVacation;
use App\Models\InvestigationType;
use App\Models\PlatformSetting;
use App\Models\Specialty;
use App\Models\User;
use App\Models\WithdrawalRequest;
use App\Notifications\AppEventNotification;
use App\Services\PlatformConfig;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

class DoctorOperationsController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile']);
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $now = CarbonImmutable::now();
        $currentMonthStart = $now->startOfMonth();
        $currentMonthEnd = $now->endOfMonth();
        $previousMonthStart = $now->subMonth()->startOfMonth();
        $previousMonthEnd = $now->subMonth()->endOfMonth();

        $completedConsultations = Consultation::query()
            ->where('doctor_id', $doctor->id)
            ->where('status', 'completed')
            ->get();

        $currentMonthConsultations = $completedConsultations
            ->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($currentMonthStart, $currentMonthEnd));

        $currentMonthRevenue = (float) $currentMonthConsultations->sum('price');
        $previousMonthRevenue = (float) $completedConsultations
            ->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($previousMonthStart, $previousMonthEnd))
            ->sum('price');

        $acceptedRequests = ConsultationRequest::query()
            ->where('doctor_id', $doctor->id)
            ->whereNotNull('accepted_at')
            ->get();

        $averageResponseMinutes = $acceptedRequests
            ->map(fn (ConsultationRequest $item) => $item->created_at?->diffInMinutes($item->accepted_at))
            ->filter(fn (?int $minutes) => $minutes !== null)
            ->avg();

        $pendingRequests = ConsultationRequest::query()
            ->with(['patient', 'specialty'])
            ->where('type', 'doctor')
            ->where('status', 'new')
            ->where(function ($query) use ($doctor) {
                $query->whereNull('doctor_id')->orWhere('doctor_id', $doctor->id);
            })
            ->latest()
            ->limit(5)
            ->get();

        return response()->json([
            'summary' => [
                'current_month_revenue' => $currentMonthRevenue,
                'previous_month_revenue' => $previousMonthRevenue,
                'revenue_change_percent' => $previousMonthRevenue > 0
                    ? round((($currentMonthRevenue - $previousMonthRevenue) / $previousMonthRevenue) * 100, 1)
                    : null,
                'current_month_consultations' => $currentMonthConsultations->count(),
                'rating' => (float) ($doctor->doctorProfile?->rating ?? 0),
                'reviews_count' => (int) ($doctor->doctorProfile?->reviews_count ?? 0),
                'average_response_minutes' => $averageResponseMinutes !== null ? (int) round($averageResponseMinutes) : null,
            ],
            'pending_requests' => $pendingRequests->map(fn (ConsultationRequest $item) => [
                'id' => (string) $item->id,
                'patient' => $item->patient ? [
                    'id' => (string) $item->patient->id,
                    'name' => $item->patient->name,
                    'email' => $item->patient->email,
                ] : null,
                'specialty' => $item->specialty?->name,
                'symptoms' => $item->symptoms,
                'created_at' => $item->created_at,
            ])->values(),
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile.specialty', 'doctorProfile.investigationRequirements.investigationType', 'doctorVacations', 'doctorAvailabilities']);
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        return response()->json([
            'user' => [
                'id' => (string) $doctor->id,
                'name' => $doctor->name,
                'email' => $doctor->email,
                'phone' => $doctor->phone,
            ],
            'profile' => $doctor->doctorProfile ? $this->serializeDoctorProfile($doctor->doctorProfile) : null,
            'vacations' => $doctor->doctorVacations()
                ->whereDate('ends_on', '>=', now()->toDateString())
                ->orderBy('starts_on')
                ->get(),
            'availability' => $doctor->doctorAvailabilities()
                ->orderBy('weekday')
                ->orderBy('starts_at')
                ->get(),
            'specialties' => Specialty::orderBy('name')->get(),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'specialty_id' => ['nullable', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'bio' => ['nullable', 'string', 'max:4000'],
            'experience_years' => ['nullable', 'integer', 'min:0', 'max:80'],
            'consultation_price' => ['nullable', 'integer', 'min:0'],
            'video_price' => ['nullable', 'integer', 'min:0'],
            'video_duration_minutes' => ['nullable', 'integer', 'min:5', 'max:180'],
            'google_meet_account' => ['nullable', 'email', 'max:255'],
            'service_catalog' => ['nullable', 'array'],
            'required_investigation_ids' => ['nullable', 'array'],
            'required_investigation_ids.*' => ['integer', Rule::exists('investigation_types', 'id')],
            'optional_investigation_ids' => ['nullable', 'array'],
            'optional_investigation_ids.*' => ['integer', Rule::exists('investigation_types', 'id')],
            'platforms' => ['nullable', 'array'],
            'platforms.*.name' => ['required_with:platforms', 'string', 'max:100'],
            'platforms.*.value' => ['required_with:platforms', 'string', 'max:255'],
            'is_available' => ['nullable', 'boolean'],
        ]);

        $doctor->forceFill([
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? null,
        ])->save();

        $profile = $doctor->doctorProfile()->updateOrCreate(
            ['user_id' => $doctor->id],
            [
                'specialty_id' => $validated['specialty_id'] ?? null,
                'license_number' => $validated['license_number'] ?? null,
                'bio' => $validated['bio'] ?? null,
                'experience_years' => $validated['experience_years'] ?? 0,
                'consultation_price' => $validated['consultation_price'] ?? 0,
                'video_price' => $validated['video_price'] ?? null,
                'video_duration_minutes' => $validated['video_duration_minutes'] ?? (int) app(PlatformConfig::class)->number('video.default_duration_minutes', 15),
                'google_meet_account' => $validated['google_meet_account'] ?? null,
                'platforms' => $validated['platforms'] ?? [],
                'service_catalog' => $validated['service_catalog'] ?? [],
                'required_investigations' => $doctor->doctorProfile?->required_investigations ?? [],
                'is_available' => $validated['is_available'] ?? true,
                'is_approved' => $doctor->doctorProfile?->is_approved ?? true,
            ],
        );

        if (array_key_exists('required_investigation_ids', $validated) || array_key_exists('optional_investigation_ids', $validated)) {
            $this->syncDoctorInvestigations($doctor->id, $profile, $validated);
        }

        return response()->json([
            'message' => 'Profil medic actualizat.',
            'user' => $doctor->fresh(),
            'profile' => $this->serializeDoctorProfile($profile->fresh(['specialty', 'investigationRequirements.investigationType'])),
        ]);
    }

    /**
     * Rebuild the doctor's required/optional investigation set from the catalog,
     * and keep the denormalized required_investigations JSON in sync (names only)
     * so existing patient/operator displays keep working.
     */
    private function syncDoctorInvestigations(int $doctorId, DoctorProfile $profile, array $validated): void
    {
        DoctorInvestigationRequirement::where('doctor_id', $doctorId)->delete();

        $rows = collect();

        collect($validated['required_investigation_ids'] ?? [])->unique()->each(fn ($id) => $rows->put((int) $id, 'required'));
        collect($validated['optional_investigation_ids'] ?? [])->unique()->each(function ($id) use ($rows) {
            // A required investigation wins if the same id was sent in both lists.
            if (! $rows->has((int) $id)) {
                $rows->put((int) $id, 'optional');
            }
        });

        $rows->each(fn (string $requirement, int $investigationTypeId) => DoctorInvestigationRequirement::create([
            'doctor_id' => $doctorId,
            'investigation_type_id' => $investigationTypeId,
            'requirement' => $requirement,
        ]));

        $requiredNames = InvestigationType::whereIn('id', $rows->filter(fn (string $requirement) => $requirement === 'required')->keys())
            ->orderBy('name')
            ->pluck('name')
            ->map(fn (string $name) => ['name' => $name])
            ->values()
            ->all();

        $profile->forceFill(['required_investigations' => $requiredNames])->save();
    }

    private function serializeDoctorProfile(DoctorProfile $profile): array
    {
        return [
            ...$profile->toArray(),
            'required_investigation_ids' => $profile->investigationRequirements
                ->where('requirement', 'required')
                ->pluck('investigation_type_id')
                ->values(),
            'optional_investigation_ids' => $profile->investigationRequirements
                ->where('requirement', 'optional')
                ->pluck('investigation_type_id')
                ->values(),
        ];
    }

    public function stats(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile']);
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $now = CarbonImmutable::now();
        $consultations = Consultation::query()
            ->where('doctor_id', $doctor->id)
            ->where('status', 'completed')
            ->get();

        $currentMonthRevenue = $consultations
            ->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($now->startOfMonth(), $now->endOfMonth()))
            ->sum('price');

        $previousMonthRevenue = $consultations
            ->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($now->subMonth()->startOfMonth(), $now->subMonth()->endOfMonth()))
            ->sum('price');

        $withdrawals = WithdrawalRequest::query()
            ->where('user_id', $doctor->id)
            ->latest()
            ->get();

        $withdrawnMinor = $withdrawals
            ->where('status', 'approved')
            ->sum(fn (WithdrawalRequest $withdrawal) => $withdrawal->approved_amount_minor ?? $withdrawal->amount_minor);
        $totalRevenueMinor = $consultations->sum('price') * 100;
        $profileViews = DoctorProfileView::where('doctor_id', $doctor->id)->count();

        $monthlyRevenue = collect(range(5, 0))
            ->map(function (int $monthsBack) use ($consultations, $now) {
                $month = $now->subMonths($monthsBack);

                return [
                    'name' => $month->locale('ro')->isoFormat('MMM'),
                    'total' => (float) $consultations
                        ->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($month->startOfMonth(), $month->endOfMonth()))
                        ->sum('price'),
                ];
            })
            ->values();

        $weeklyConsultations = collect(range(6, 0))
            ->map(function (int $daysBack) use ($consultations, $now) {
                $day = $now->subDays($daysBack);

                return [
                    'name' => $day->locale('ro')->isoFormat('dd'),
                    'count' => $consultations
                        ->filter(fn (Consultation $consultation) => $consultation->completed_at?->isSameDay($day))
                        ->count(),
                ];
            })
            ->values();

        return response()->json([
            'summary' => [
                'current_month_revenue' => (float) $currentMonthRevenue,
                'previous_month_revenue' => (float) $previousMonthRevenue,
                'revenue_change_percent' => $previousMonthRevenue > 0
                    ? round((($currentMonthRevenue - $previousMonthRevenue) / $previousMonthRevenue) * 100, 1)
                    : null,
                'total_consultations' => $consultations->count(),
                'rating' => (float) ($doctor->doctorProfile?->rating ?? 0),
                'reviews_count' => (int) ($doctor->doctorProfile?->reviews_count ?? 0),
                'profile_views' => $profileViews,
                'available_balance' => max(0, ($totalRevenueMinor - $withdrawnMinor) / 100),
            ],
            'revenue' => $monthlyRevenue,
            'consultations' => $weeklyConsultations,
            'withdrawals' => $withdrawals->map(fn (WithdrawalRequest $withdrawal) => [
                'id' => $withdrawal->id,
                'date' => $withdrawal->created_at,
                'amount' => $withdrawal->amount_minor / 100,
                'approved_amount' => $withdrawal->approved_amount_minor ? $withdrawal->approved_amount_minor / 100 : null,
                'status' => $withdrawal->status,
                'admin_note' => $withdrawal->admin_note,
                'payout_sent_at' => $withdrawal->payout_sent_at,
                'payout_method' => $withdrawal->payout_method,
                'payout_reference' => $withdrawal->payout_reference,
            ])->values(),
        ]);
    }

    public function storeWithdrawal(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');
        $config = app(PlatformConfig::class);
        $day = (int) now()->format('j');
        abort_if(
            $day < (int) $config->number('payout.request_day_start', 1) || $day > (int) $config->number('payout.request_day_end', 10),
            422,
            'Cererile de retragere pot fi depuse doar între zilele 1 și 10 ale lunii.'
        );

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:500', 'max:1000000'],
        ]);
        $amountMinor = (int) round(((float) $validated['amount']) * 100);
        $availableMinor = $this->availableBalanceMinor($doctor->id);

        abort_if($amountMinor > $availableMinor, 422, 'Suma solicitată depășește balanța disponibilă.');

        $withdrawal = WithdrawalRequest::create([
            'user_id' => $doctor->id,
            'amount_minor' => $amountMinor,
            'currency' => 'MDL',
            'iban' => '',
            'payout_period' => now()->format('Y-m'),
            'status' => 'pending',
        ]);

        $this->notifyAdmins(
            'Cerere de retragere nouă',
            $doctor->name.' a solicitat retragerea sumei de '.number_format($amountMinor / 100, 2).' MDL.',
            '/admin/transactions',
            $this->settingBool('notify_withdrawals', true),
            'warning'
        );

        return response()->json([
            'message' => 'Cererea de extragere a fost trimisă.',
            'withdrawal' => $withdrawal,
        ], 201);
    }

    public function storeVacation(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $validated = $request->validate([
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $overlaps = DoctorVacation::query()
            ->where('doctor_id', $doctor->id)
            ->whereDate('starts_on', '<=', $validated['ends_on'])
            ->whereDate('ends_on', '>=', $validated['starts_on'])
            ->exists();

        abort_if($overlaps, 422, 'Există deja un concediu în acest interval.');

        $vacation = DoctorVacation::create([
            'doctor_id' => $doctor->id,
            'starts_on' => $validated['starts_on'],
            'ends_on' => $validated['ends_on'],
            'reason' => $validated['reason'] ?? null,
        ]);

        return response()->json([
            'message' => 'Concediu adăugat.',
            'vacation' => $vacation,
        ], 201);
    }

    public function destroyVacation(Request $request, DoctorVacation $doctorVacation): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');
        abort_unless($doctorVacation->doctor_id === $doctor->id || $doctor->hasRole('admin'), 403);

        $doctorVacation->delete();

        return response()->json(['message' => 'Concediu șters.']);
    }

    public function updateAvailability(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $validated = $request->validate([
            'slots' => ['required', 'array', 'min:1'],
            'slots.*.weekday' => ['required', 'integer', 'min:0', 'max:6'],
            'slots.*.starts_at' => ['required', 'date_format:H:i'],
            'slots.*.ends_at' => ['required', 'date_format:H:i'],
            'slots.*.is_active' => ['nullable', 'boolean'],
        ]);

        $slots = collect($validated['slots'])
            ->filter(fn (array $slot) => $slot['starts_at'] < $slot['ends_at'])
            ->values();

        abort_if($slots->isEmpty(), 422, 'Adăugați cel puțin un interval valid.');

        $doctor->doctorAvailabilities()->delete();
        $slots->each(function (array $slot) use ($doctor) {
            DoctorAvailability::create([
                'doctor_id' => $doctor->id,
                'weekday' => $slot['weekday'],
                'starts_at' => $slot['starts_at'],
                'ends_at' => $slot['ends_at'],
                'is_active' => $slot['is_active'] ?? true,
            ]);
        });

        return response()->json([
            'message' => 'Programul a fost salvat.',
            'availability' => $doctor->doctorAvailabilities()->orderBy('weekday')->orderBy('starts_at')->get(),
        ]);
    }

    private function availableBalanceMinor(int $doctorId): int
    {
        $consultationRevenueMinor = (int) (Consultation::query()
            ->where('doctor_id', $doctorId)
            ->where('status', 'completed')
            ->sum('price') * 100);

        $processedWithdrawalsMinor = (int) WithdrawalRequest::query()
            ->where('user_id', $doctorId)
            ->where('status', 'approved')
            ->selectRaw('COALESCE(SUM(COALESCE(approved_amount_minor, amount_minor)), 0) as total')
            ->value('total');

        return max(0, $consultationRevenueMinor - $processedWithdrawalsMinor);
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
