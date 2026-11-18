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
use App\Models\InstitutionEarning;
use App\Models\InvestigationType;
use App\Models\MedicalInstitution;
use App\Models\PlatformSetting;
use App\Models\Specialty;
use App\Models\User;
use App\Models\WithdrawalRequest;
use App\Notifications\AppEventNotification;
use App\Rules\ValidPhoneNumber;
use App\Services\DoctorPerformance;
use App\Services\DoctorSchedule;
use App\Services\DoctorServiceCatalog;
use App\Services\InstitutionLedger;
use App\Services\PayoutRequestWindow;
use App\Services\PlatformConfig;
use App\Services\PublicImageStorage;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class DoctorOperationsController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile']);
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $now = CarbonImmutable::now('Europe/Chisinau');
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

        $income = $this->settledIncome($doctor);
        $currentMonthRevenue = (float) $income->filter(fn (array $row) => $row['date']->betweenIncluded($currentMonthStart, $currentMonthEnd))->sum('amount');
        $previousMonthRevenue = (float) $income->filter(fn (array $row) => $row['date']->betweenIncluded($previousMonthStart, $previousMonthEnd))->sum('amount');

        $performance = $doctor->doctorProfile ? app(DoctorPerformance::class)->forDoctor($doctor->doctorProfile) : null;
        $ranking = app(DoctorPerformance::class)->leaderboard();
        $averageResponseMinutes = $performance['average_response_minutes'] ?? null;

        $pendingRequests = ConsultationRequest::query()
            ->with(['patient', 'patientProfile', 'specialty'])
            ->whereIn('type', ['doctor', 'video'])
            ->whereIn('status', ['new', 'rescheduled'])
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
                'performance' => $performance,
                'ranking' => ['position' => $ranking->firstWhere('doctor_id', $doctor->id)['position'] ?? null, 'total' => $ranking->count()],
            ],
            'pending_requests' => $pendingRequests->map(fn (ConsultationRequest $item) => [
                'id' => (string) $item->id,
                'patient' => $item->patient ? [
                    'id' => (string) $item->patient->id,
                    'name' => $item->patient->name,
                    'email' => $item->patient->email,
                ] : null,
                // Titularul contului nu e pacientul: consultația e pentru
                // profilul ales la programare, deci el dă numele afișat.
                'patient_profile' => $item->patientProfile ? [
                    'id' => (string) $item->patientProfile->id,
                    'name' => $item->patientProfile->display_name,
                    'patient_code' => $item->patientProfile->patient_code,
                ] : null,
                'specialty' => $item->specialty?->name,
                'symptoms' => $item->symptoms,
                'created_at' => $item->created_at,
            ])->values(),
        ]);
    }

    public function ranking(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor'), 403);
        $rows = app(DoctorPerformance::class)->leaderboard();

        return response()->json(['data' => $rows, 'own_position' => $rows->firstWhere('doctor_id', $doctor->id)['position'] ?? null, 'total' => $rows->count()]);
    }

    public function profile(Request $request): JsonResponse
    {
        $doctor = $request->user()->load(['roles', 'doctorProfile.specialty', 'doctorProfile.investigationRequirements.investigationType', 'doctorVacations', 'doctorAvailabilities']);
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
            'services' => app(DoctorServiceCatalog::class)->serialize($doctor->doctorServices()->get()),
            'institution' => $doctor->doctorProfile?->medicalInstitution ? [
                'id' => $doctor->doctorProfile->medicalInstitution->id,
                'name' => $doctor->doctorProfile->medicalInstitution->name,
                'address' => $doctor->doctorProfile->medicalInstitution->address,
            ] : null,
            'has_signature' => (bool) $doctor->doctorProfile?->signature_path,
            'avatar' => $doctor->avatar_url,
            'has_clinic_logo' => (bool) $doctor->doctorProfile?->clinic_logo_path,
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber(unique: true, ignoreUserId: $doctor->id)],
            'specialty_id' => ['nullable', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'clinic_name' => ['nullable', 'string', 'max:255'],
            'clinic_details' => ['nullable', 'string', 'max:2000'],
            'accepts_points' => ['sometimes', 'boolean'],
            'points_payment_percent' => ['sometimes', 'integer', Rule::in([0, 10, 20, 30, 40, 50])],
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
            'platforms.*' => [function (string $attribute, mixed $value, \Closure $fail): void {
                if (is_string($value) && in_array($value, ['Video', 'Chat'], true)) {
                    return;
                }
                if (! is_array($value) || Validator::make(['contact' => $value], [
                    'contact' => ['array:name,value'],
                    'contact.name' => ['required', 'string', 'max:100'],
                    'contact.value' => ['required', 'string', 'max:255'],
                ])->fails()) {
                    $fail('Completează denumirea și datele de contact ale platformei video.');
                }
            }],
            'is_available' => ['nullable', 'boolean'],
            'payout_bank' => ['nullable', 'string', 'max:80'],
            'payout_iban' => ['nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9 ]+$/'],
        ], [
            'payout_iban.regex' => 'IBAN-ul poate conține doar litere și cifre.',
        ]);

        $doctor->forceFill([
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? null,
        ])->save();

        $existing = $doctor->doctorProfile;
        $profile = $doctor->doctorProfile()->updateOrCreate(
            ['user_id' => $doctor->id],
            [
                'specialty_id' => $validated['specialty_id'] ?? null,
                'license_number' => $validated['license_number'] ?? null,
                'clinic_name' => $validated['clinic_name'] ?? null,
                'clinic_details' => $validated['clinic_details'] ?? null,
                'accepts_points' => isset($validated['points_payment_percent']) ? $validated['points_payment_percent'] > 0 : ($validated['accepts_points'] ?? $doctor->doctorProfile?->accepts_points ?? false),
                'points_payment_percent' => $validated['points_payment_percent'] ?? $doctor->doctorProfile?->points_payment_percent,
                'bio' => $validated['bio'] ?? null,
                'experience_years' => $validated['experience_years'] ?? 0,
                // Prețurile vin din servicii; câmpurile vechi se schimbă doar când sunt trimise.
                'consultation_price' => array_key_exists('consultation_price', $validated) ? ($validated['consultation_price'] ?? 0) : ($existing?->consultation_price ?? 0),
                'video_price' => array_key_exists('video_price', $validated) ? $validated['video_price'] : $existing?->video_price,
                'video_duration_minutes' => $validated['video_duration_minutes'] ?? $existing?->video_duration_minutes ?? (int) app(PlatformConfig::class)->number('video.default_duration_minutes', 10),
                'google_meet_account' => array_key_exists('google_meet_account', $validated) ? $validated['google_meet_account'] : $existing?->google_meet_account,
                'platforms' => $validated['platforms'] ?? $existing?->platforms ?? [],
                'service_catalog' => $validated['service_catalog'] ?? $existing?->service_catalog ?? [],
                'required_investigations' => $doctor->doctorProfile?->required_investigations ?? [],
                'is_available' => $validated['is_available'] ?? $existing?->is_available ?? true,
                'is_approved' => $doctor->doctorProfile?->is_approved ?? true,
                'payout_bank' => array_key_exists('payout_bank', $validated) ? $validated['payout_bank'] : $existing?->payout_bank,
                'payout_iban' => array_key_exists('payout_iban', $validated) ? ($validated['payout_iban'] ? strtoupper(str_replace(' ', '', $validated['payout_iban'])) : null) : $existing?->payout_iban,
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
    public function uploadSignature(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('doctor'), 403);
        $request->validate(['signature' => ['required', 'image', 'mimes:jpg,jpeg,png', 'max:2048', 'dimensions:max_width=3000,max_height=3000']]);
        $profile = $request->user()->doctorProfile;
        abort_unless($profile, 422, 'Salvează mai întâi profilul medicului.');
        $file = $request->file('signature');
        $path = $file->store('doctor-signatures', 'local');
        $old = $profile->signature_path;
        $profile->forceFill(['signature_path' => $path, 'signature_mime' => $file->getMimeType()])->save();
        if ($old) {
            Storage::disk('local')->delete($old);
        }

        return response()->json(['message' => 'Parafa și semnătura au fost salvate.']);
    }

    public function signature(Request $request): Response
    {
        abort_unless($request->user()->hasRole('doctor'), 403);
        $profile = $request->user()->doctorProfile;
        abort_unless($profile?->signature_path, 404);

        return Storage::disk('local')->response($profile->signature_path, 'parafa', ['Content-Type' => $profile->signature_mime, 'Cache-Control' => 'no-store']);
    }

    public function uploadClinicLogo(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('doctor'), 403);
        $request->validate(['logo' => ['required', 'image', 'mimes:jpg,jpeg,png', 'mimetypes:image/jpeg,image/png', 'max:2048', 'dimensions:max_width=3000,max_height=3000']]);
        $profile = $request->user()->doctorProfile;
        abort_unless($profile, 422, 'Salvează mai întâi profilul medicului.');
        $file = $request->file('logo');
        $path = $file->store('clinic-logos', 'local');
        abort_unless(is_string($path) && $path !== '', 503, 'Sigla nu a putut fi salvată. Reîncearcă încărcarea.');
        $old = $profile->clinic_logo_path;
        try {
            $profile->forceFill(['clinic_logo_path' => $path, 'clinic_logo_mime' => $file->getMimeType()])->save();
        } catch (\Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }
        if ($old) {
            Storage::disk('local')->delete($old);
        }

        return response()->json(['message' => 'Sigla clinicii a fost salvată.']);
    }

    public function clinicLogo(Request $request): Response
    {
        abort_unless($request->user()->hasRole('doctor'), 403);
        $profile = $request->user()->doctorProfile;
        abort_unless($profile?->clinic_logo_path && Storage::disk('local')->exists($profile->clinic_logo_path), 404);

        return Storage::disk('local')->response($profile->clinic_logo_path, 'sigla-clinicii', ['Content-Type' => $profile->clinic_logo_mime, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

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
            'points_payment_percent' => $profile->effectivePointsPercent(),
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

    /**
     * Programul medicului pe zile, cu orele ocupate marcate, ca să poată
     * propune doar ore libere. `ignore` exclude cererea pentru care propune.
     */
    public function slots(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('roles');
        abort_unless($doctor->hasRole('doctor'), 403, 'Ai nevoie de rol medic.');
        $validated = $request->validate([
            'days' => ['nullable', 'integer', 'min:1', 'max:21'],
            'ignore' => ['nullable', 'integer'],
        ]);

        $ignore = isset($validated['ignore']) ? ConsultationRequest::where('doctor_id', $doctor->id)->findOrFail($validated['ignore']) : null;
        $schedule = app(DoctorSchedule::class);

        return response()->json($schedule->freeSlots($doctor, (int) ($validated['days'] ?? 8), null, true, $ignore?->id, $schedule->durationMinutes($ignore?->pricing_snapshot['service'] ?? null)));
    }

    /** Fotografia din profilul public; o vede pacientul în catalog. */
    public function uploadAvatar(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->hasRole('doctor'), 403);
        $request->validate(['avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:3072', 'dimensions:max_width=4000,max_height=4000']]);

        $url = app(PublicImageStorage::class)->persistReplacement(
            $request->file('avatar'),
            'avatars',
            function (?string $url) use ($user) {
                $user->forceFill(['avatar_url' => $url])->save();

                return $url;
            },
            $user->avatar_url,
        );

        return response()->json(['message' => 'Fotografia a fost salvată.', 'avatar' => $url]);
    }

    /** Medicul nu-și schimbă singur instituția: îi scrie administratorului. */
    public function requestInstitutionChange(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing('doctorProfile.medicalInstitution');
        abort_unless($doctor->hasRole('doctor'), 403);
        $validated = $request->validate(['message' => ['required', 'string', 'min:5', 'max:1000']], ['message.required' => 'Scrie în ce instituție lucrezi.']);

        $this->notifyAdmins(
            'Medicul cere schimbarea instituției',
            $doctor->name.' ('.($doctor->doctorProfile?->medicalInstitution?->name ?? 'fără instituție').'): '.$validated['message'],
            '/admin/doctors',
            true,
        );

        return response()->json(['message' => 'Mesajul a ajuns la administrator.']);
    }

    public function stats(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile.medicalInstitution']);
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');

        $now = CarbonImmutable::now('Europe/Chisinau');
        $consultations = Consultation::query()
            ->where('doctor_id', $doctor->id)
            ->where('status', 'completed')
            ->get();

        $monthConsultations = $consultations->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($now->startOfMonth(), $now->endOfMonth()));
        $income = $this->settledIncome($doctor);
        $currentMonthRevenue = $income->filter(fn (array $row) => $row['date']->betweenIncluded($now->startOfMonth(), $now->endOfMonth()))->sum('amount');
        $previousMonthRevenue = $income->filter(fn (array $row) => $row['date']->betweenIncluded($now->subMonth()->startOfMonth(), $now->subMonth()->endOfMonth()))->sum('amount');

        $withdrawals = WithdrawalRequest::query()
            ->with('institution')
            ->where('user_id', $doctor->id)
            ->latest()
            ->get();

        $profileViews = DoctorProfileView::where('doctor_id', $doctor->id)->count();

        $monthlyRevenue = collect(range(5, 0))->map(function (int $monthsBack) use ($income, $now): array {
            $month = $now->subMonths($monthsBack);

            return ['name' => $month->locale('ro')->isoFormat('MMM'), 'total' => (float) $income->filter(fn (array $row) => $row['date']->betweenIncluded($month->startOfMonth(), $month->endOfMonth()))->sum('amount')];
        })->values();
        $byService = $income->filter(fn (array $row) => $row['date']->betweenIncluded($now->startOfMonth(), $now->endOfMonth()))->groupBy('service')
            ->map(fn (Collection $group, string $name) => ['name' => $name, 'count' => $group->count(), 'total' => (float) $group->sum('amount')])->sortByDesc('total')->values();

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

        $institutionBalances = $this->institutionBalances($doctor);

        return response()->json([
            'summary' => [
                'current_month_revenue' => (float) $currentMonthRevenue,
                'previous_month_revenue' => (float) $previousMonthRevenue,
                'revenue_change_percent' => $previousMonthRevenue > 0
                    ? round((($currentMonthRevenue - $previousMonthRevenue) / $previousMonthRevenue) * 100, 1)
                    : null,
                'total_consultations' => $consultations->count(),
                'performance' => $doctor->doctorProfile ? app(DoctorPerformance::class)->forDoctor($doctor->doctorProfile) : null,
                'rating' => (float) ($doctor->doctorProfile?->rating ?? 0),
                'reviews_count' => (int) ($doctor->doctorProfile?->reviews_count ?? 0),
                'profile_views' => $profileViews,
                'available_balance' => $this->availableBalanceMinor($doctor->id) / 100,
                'payout_window' => app(PayoutRequestWindow::class)->current(),
                'payout_account' => $doctor->doctorProfile?->payout_iban
                    ? trim(($doctor->doctorProfile->payout_bank ?? '').' ···· '.substr($doctor->doctorProfile->payout_iban, -4))
                    : null,
            ],
            'institution' => collect($institutionBalances)->firstWhere('is_current', true),
            'institution_balances' => $institutionBalances,
            'revenue' => $monthlyRevenue,
            'by_service' => $byService,
            'current_month_consultations' => $monthConsultations->count(),
            'previous_month_consultations' => $consultations
                ->filter(fn (Consultation $consultation) => $consultation->completed_at?->betweenIncluded($now->subMonth()->startOfMonth(), $now->subMonth()->endOfMonth()))
                ->count(),
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
                'payer' => $withdrawal->payer,
                'institution' => $withdrawal->institution?->name,
            ])->values(),
        ]);
    }

    public function storeWithdrawal(Request $request): JsonResponse
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile.medicalInstitution']);
        abort_unless($doctor->hasRole('doctor') || $doctor->hasRole('admin'), 403, 'Ai nevoie de rol medic.');
        $institution = $doctor->doctorProfile?->medicalInstitution;

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1', 'max:1000000'],
            'institution_id' => ['nullable', 'integer', 'exists:medical_institutions,id'],
            'source' => ['nullable', Rule::in([InstitutionLedger::PAYER_PLATFORM, InstitutionLedger::PAYER_INSTITUTION])],
        ]);
        $source = $validated['source'] ?? ($institution ? InstitutionLedger::PAYER_INSTITUTION : InstitutionLedger::PAYER_PLATFORM);
        $amountMinor = (int) round(((float) $validated['amount']) * 100);

        // Medicul afiliat cere partea lui de la instituție, care decide singură
        // când și cum plătește; regulile de calendar ale platformei nu se aplică.
        if ($source === InstitutionLedger::PAYER_INSTITUTION) {
            [$institution, $withdrawal] = DB::transaction(function () use ($doctor, $validated, $amountMinor): array {
                $doctor = User::whereKey($doctor->id)->lockForUpdate()->firstOrFail();
                $institutionId = $validated['institution_id'] ?? $doctor->doctorProfile?->medical_institution_id;
                abort_unless($institutionId, 422, 'Alege instituția de la care soliciți plata.');
                $institution = MedicalInstitution::findOrFail($institutionId);
                abort_unless((int) $doctor->doctorProfile?->medical_institution_id === (int) $institutionId
                    || InstitutionEarning::where('doctor_id', $doctor->id)->where('medical_institution_id', $institutionId)->exists(), 404);
                $ledger = app(InstitutionLedger::class);
                $availableMinor = $ledger->doctorBalanceMinor($institution->id, $doctor->id) - $ledger->doctorPendingMinor($institution->id, $doctor->id);
                abort_if($amountMinor > $availableMinor, 422, 'Suma solicitată depășește suma disponibilă la instituție.');
                $withdrawal = WithdrawalRequest::create([
                    'user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'payer' => InstitutionLedger::PAYER_INSTITUTION,
                    'amount_minor' => $amountMinor, 'currency' => 'MDL', 'iban' => '', 'payout_period' => now()->format('Y-m'), 'status' => 'pending',
                ]);
                DB::afterCommit(fn () => Notification::send($institution->managers()->get(), new AppEventNotification('Cerere de plată de la medic', $doctor->name.' a solicitat '.number_format($amountMinor / 100, 2).' MDL.', '/institution/payouts', 'warning')));

                return [$institution, $withdrawal];
            }, attempts: 3);

            return response()->json([
                'message' => 'Cererea a fost trimisă către '.$institution->name.'.',
                'withdrawal' => $withdrawal,
            ], 201);
        }

        $window = app(PayoutRequestWindow::class)->current();
        abort_if(
            ! $window['open'],
            422,
            $window['valid'] ? 'Cererile de retragere de la platformă pot fi depuse în zilele '.$window['start_day'].'–'.$window['end_day'].' ale lunii (ora Chișinăului).' : 'Perioada pentru cereri de plată nu este configurată corect. Contactează administratorul.'
        );
        abort_if($amountMinor < 50000, 422, 'Suma minimă pentru extragere este 500 MDL.');
        $availableMinor = $this->availableBalanceMinor($doctor->id);

        abort_if($amountMinor > $availableMinor, 422, 'Suma solicitată depășește balanța disponibilă.');

        $withdrawal = WithdrawalRequest::create([
            'user_id' => $doctor->id,
            'amount_minor' => $amountMinor,
            'currency' => 'MDL',
            'iban' => $doctor->doctorProfile?->payout_iban ?? '',
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

    /**
     * @return array{id: int, name: string, doctor_share_percent: float, balance: float, pending: float, earned_total: float}|null
     */
    private function institutionBalances(User $doctor): array
    {
        $earnings = InstitutionEarning::where('doctor_id', $doctor->id)->selectRaw('medical_institution_id, SUM(doctor_amount_minor) as total')->groupBy('medical_institution_id')->pluck('total', 'medical_institution_id');
        $paid = WithdrawalRequest::where('user_id', $doctor->id)->where('payer', InstitutionLedger::PAYER_INSTITUTION)->where('status', 'approved')
            ->selectRaw('medical_institution_id, SUM(COALESCE(approved_amount_minor, amount_minor)) as total')->groupBy('medical_institution_id')->pluck('total', 'medical_institution_id');
        $pending = WithdrawalRequest::where('user_id', $doctor->id)->where('payer', InstitutionLedger::PAYER_INSTITUTION)->where('status', 'pending')
            ->selectRaw('medical_institution_id, SUM(amount_minor) as total')->groupBy('medical_institution_id')->pluck('total', 'medical_institution_id');
        $currentId = $doctor->doctorProfile?->medical_institution_id;
        $ids = $earnings->keys()->merge($paid->keys())->merge($pending->keys())->push($currentId)->filter()->unique();

        return MedicalInstitution::whereIn('id', $ids)->orderBy('name')->get()->map(fn ($institution) => [
            'id' => $institution->id, 'name' => $institution->name, 'is_current' => (int) $institution->id === (int) $currentId,
            'doctor_share_percent' => (int) $institution->id === (int) $currentId ? (float) $doctor->doctorProfile->effectiveInstitutionSharePercent() : null,
            'balance' => max(0, (int) $earnings->get($institution->id, 0) - (int) $paid->get($institution->id, 0)) / 100,
            'pending' => (int) $pending->get($institution->id, 0) / 100, 'earned_total' => (int) $earnings->get($institution->id, 0) / 100,
        ])->all();
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

        $slots = collect($validated['slots'])->values();
        foreach ($slots as $index => $slot) {
            if ($slot['ends_at'] !== '00:00' && $slot['starts_at'] >= $slot['ends_at']) {
                throw ValidationException::withMessages([
                    "slots.$index.ends_at" => ['Ora de sfârșit trebuie să fie după început. Folosește 00:00 pentru sfârșitul zilei; pentru alte intervale peste noapte adaugă separat ziua următoare.'],
                ]);
            }
        }

        abort_if($slots->isEmpty(), 422, 'Adăugați cel puțin un interval valid.');

        DB::transaction(function () use ($doctor, $slots) {
            $doctor->doctorAvailabilities()->delete();
            $slots->each(fn (array $slot) => DoctorAvailability::create([
                'doctor_id' => $doctor->id,
                'weekday' => $slot['weekday'],
                'starts_at' => $slot['starts_at'],
                'ends_at' => $slot['ends_at'],
                'is_active' => $slot['is_active'] ?? true,
            ]));
        });

        return response()->json([
            'message' => 'Programul a fost salvat.',
            'availability' => $doctor->doctorAvailabilities()->orderBy('weekday')->orderBy('starts_at')->get(),
        ]);
    }

    private function settledIncome(User $doctor): Collection
    {
        $shares = InstitutionEarning::where('doctor_id', $doctor->id)->pluck('doctor_amount_minor', 'consultation_request_id');

        return ConsultationRequest::where('doctor_id', $doctor->id)->where('payment_status', 'captured')->get()->map(function (ConsultationRequest $item) use ($shares): array {
            $amount = $shares->has($item->id) ? (int) $shares->get($item->id) : (int) $item->provider_amount_minor;

            return ['amount' => $amount / 100, 'date' => $item->closed_at ?? $item->completed_at ?? $item->created_at,
                'service' => $item->pricing_snapshot['service']['name'] ?? match ($item->consultation_kind) {
                    'with_exam' => 'Consultație cu examinare la domiciliu', 'preliminary' => 'Consultație în chat', default => 'Consultație video + chat'
                }];
        });
    }

    private function availableBalanceMinor(int $doctorId): int
    {
        return app(InstitutionLedger::class)->platformDoctorBalanceMinor($doctorId);
    }

    private function notifyAdmins(string $title, string $body, string $url, bool $enabled, string $level = 'info'): void
    {
        if (! $enabled) {
            return;
        }
        $admins = User::where('status', 'active')->whereHas('roles', fn ($query) => $query->where('name', 'admin'))->get();
        Notification::send($admins, new AppEventNotification($title, $body, $url, $level, category: str_contains($url, 'transactions') ? 'payments' : 'requests'));
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
