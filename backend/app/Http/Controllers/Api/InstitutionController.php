<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\MedicalInstitutionInvitation;
use App\Models\User;
use App\Models\WithdrawalRequest;
use App\Notifications\AppEventNotification;
use App\Rules\ValidPhoneNumber;
use App\Services\InstitutionLedger;
use App\Services\InstitutionMembership;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

/**
 * Panoul unei instituții medicale: medicii ei, invitațiile, împărțirea banilor
 * și plățile — către medici și de la platformă.
 */
class InstitutionController extends Controller
{
    public function __construct(
        private readonly InstitutionLedger $ledger,
        private readonly InstitutionMembership $membership,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $monthStart = CarbonImmutable::now()->startOfMonth();
        $monthEarnings = InstitutionEarning::where('medical_institution_id', $institution->id)->where('created_at', '>=', $monthStart);

        $monthly = collect(range(5, 0))->map(function (int $monthsBack) use ($institution) {
            $month = CarbonImmutable::now()->subMonths($monthsBack);
            $rows = InstitutionEarning::where('medical_institution_id', $institution->id)
                ->whereBetween('created_at', [$month->startOfMonth(), $month->endOfMonth()]);

            return [
                'name' => $month->locale('ro')->isoFormat('MMM'),
                'institution' => (int) (clone $rows)->sum('institution_amount_minor') / 100,
                'doctors' => (int) (clone $rows)->sum('doctor_amount_minor') / 100,
            ];
        })->values();

        $pendingDoctorWithdrawals = WithdrawalRequest::where('payer', InstitutionLedger::PAYER_INSTITUTION)
            ->where('medical_institution_id', $institution->id)
            ->where('status', 'pending');

        return response()->json([
            'institution' => $this->serializeInstitution($institution),
            'summary' => [
                ...$this->ledger->summary($institution),
                'doctors_count' => $institution->doctorProfiles()->count(),
                'pending_invitations' => $institution->invitations()->where('status', 'pending')->where('expires_at', '>', now())->count(),
                'month_consultations' => (clone $monthEarnings)->count(),
                'month_gross' => (int) (clone $monthEarnings)->sum('gross_amount_minor') / 100,
                'month_institution' => (int) (clone $monthEarnings)->sum('institution_amount_minor') / 100,
                'month_doctors' => (int) (clone $monthEarnings)->sum('doctor_amount_minor') / 100,
                'pending_doctor_withdrawals' => (clone $pendingDoctorWithdrawals)->count(),
                'pending_doctor_withdrawals_amount' => (int) (clone $pendingDoctorWithdrawals)->sum('amount_minor') / 100,
            ],
            'monthly' => $monthly,
            'recent' => InstitutionEarning::with('doctor')
                ->where('medical_institution_id', $institution->id)
                ->latest()
                ->limit(8)
                ->get()
                ->map(fn (InstitutionEarning $earning) => $this->serializeEarning($earning))
                ->values(),
        ]);
    }

    public function doctors(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);

        $profiles = DoctorProfile::with(['user', 'specialty'])
            ->where('medical_institution_id', $institution->id)
            ->get();

        $totals = InstitutionEarning::where('medical_institution_id', $institution->id)
            ->selectRaw('doctor_id, COUNT(*) as consultations, SUM(doctor_amount_minor) as doctor_total, SUM(institution_amount_minor) as institution_total')
            ->groupBy('doctor_id')
            ->get()
            ->keyBy('doctor_id');

        return response()->json([
            'institution' => $this->serializeInstitution($institution),
            'doctors' => $profiles->map(fn (DoctorProfile $profile) => $this->serializeDoctor($institution, $profile, $totals->get($profile->user_id)))->sortBy('name')->values(),
            'invitations' => $institution->invitations()
                ->with('specialty')
                ->whereIn('status', ['pending'])
                ->latest()
                ->get()
                ->map(fn (MedicalInstitutionInvitation $invitation) => [
                    'id' => $invitation->id,
                    'email' => $invitation->email,
                    'name' => $invitation->name,
                    'specialty' => $invitation->specialty?->name,
                    'doctor_share_percent' => $invitation->doctor_share_percent,
                    'expires_at' => $invitation->expires_at,
                    'expired' => $invitation->expires_at->isPast(),
                    'created_at' => $invitation->created_at,
                ])
                ->values(),
        ]);
    }

    public function storeDoctor(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'specialty_id' => ['required', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'doctor_share_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
        ], [
            'email.unique' => 'Există deja un cont cu acest email. Trimite-i o invitație în loc să creezi un cont nou.',
        ]);

        $result = $this->membership->createDoctorAccount($institution, $validated);

        return response()->json([
            'message' => 'Contul medicului a fost creat.',
            'doctor' => $this->serializeDoctor($institution, $result['user']->doctorProfile()->with(['user', 'specialty'])->first(), null),
            // Afișată o singură dată managerului, ca s-o transmită medicului.
            'generated_password' => $result['password'],
        ], 201);
    }

    public function updateDoctor(Request $request, User $doctor): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $profile = $this->ownedDoctorProfile($institution, $doctor);
        $validated = $request->validate([
            'doctor_share_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $profile->forceFill(['institution_share_percent' => $validated['doctor_share_percent'] ?? null])->save();

        return response()->json([
            'message' => 'Procentul medicului a fost actualizat. Se aplică consultațiilor finalizate de acum înainte.',
            'doctor' => $this->serializeDoctor($institution, $profile->load(['user', 'specialty']), null),
        ]);
    }

    public function removeDoctor(Request $request, User $doctor): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $profile = $this->ownedDoctorProfile($institution, $doctor);
        $this->membership->detachDoctor($profile);

        $doctor->notify(new AppEventNotification(
            'Nu mai faci parte din '.$institution->name,
            'Contul tău rămâne activ ca medic independent. Sumele datorate de instituție rămân vizibile în Statistici.',
            '/doctor/stats',
            'warning',
        ));

        return response()->json(['message' => 'Medicul a fost eliminat din instituție.']);
    }

    public function storeInvitation(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'specialty_id' => ['nullable', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'doctor_share_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $result = $this->membership->invite($institution, $request->user(), $validated);

        return response()->json([
            'message' => 'Invitația a fost trimisă la '.$result['invitation']->email.'.',
            'invitation_id' => $result['invitation']->id,
            'invitation_url' => $this->membership->invitationUrl($result['token']),
        ], 201);
    }

    public function resendInvitation(Request $request, MedicalInstitutionInvitation $invitation): JsonResponse
    {
        $institution = $this->institutionFor($request);
        abort_unless((int) $invitation->medical_institution_id === (int) $institution->id, 404);
        abort_unless($invitation->status === 'pending', 422, 'Invitația nu mai poate fi retrimisă.');
        $token = $this->membership->resend($invitation);

        return response()->json([
            'message' => 'Invitația a fost retrimisă.',
            'invitation_url' => $this->membership->invitationUrl($token),
        ]);
    }

    public function revokeInvitation(Request $request, MedicalInstitutionInvitation $invitation): JsonResponse
    {
        $institution = $this->institutionFor($request);
        abort_unless((int) $invitation->medical_institution_id === (int) $institution->id, 404);
        $invitation->forceFill(['status' => 'revoked'])->save();

        return response()->json(['message' => 'Invitația a fost anulată.']);
    }

    public function withdrawals(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $rows = WithdrawalRequest::with(['user', 'processor'])
            ->where('medical_institution_id', $institution->id)
            ->latest()
            ->get();

        return response()->json([
            'summary' => $this->ledger->summary($institution),
            'doctor_requests' => $rows->where('payer', InstitutionLedger::PAYER_INSTITUTION)
                ->map(fn (WithdrawalRequest $withdrawal) => $this->serializeWithdrawal($withdrawal) + [
                    'doctor_balance' => $this->ledger->doctorBalanceMinor($institution->id, $withdrawal->user_id) / 100,
                ])
                ->values(),
            'platform_payouts' => $rows->where('payer', InstitutionLedger::PAYER_PLATFORM)
                ->map(fn (WithdrawalRequest $withdrawal) => $this->serializeWithdrawal($withdrawal))
                ->values(),
        ]);
    }

    /** Instituția aprobă (și marchează ca plătită) sau respinge cererea unui medic. */
    public function updateWithdrawal(Request $request, WithdrawalRequest $withdrawalRequest): JsonResponse
    {
        $institution = $this->institutionFor($request);
        abort_unless(
            (int) $withdrawalRequest->medical_institution_id === (int) $institution->id && $withdrawalRequest->payer === InstitutionLedger::PAYER_INSTITUTION,
            404
        );
        $validated = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected'])],
            'approved_amount' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:2000'],
            'payout_reference' => ['nullable', 'string', 'max:255'],
        ]);

        DB::transaction(function () use ($request, $institution, $withdrawalRequest, $validated) {
            $withdrawal = WithdrawalRequest::lockForUpdate()->findOrFail($withdrawalRequest->id);
            abort_unless($withdrawal->status === 'pending', 422, 'Cererea a fost deja procesată.');
            $approvedMinor = isset($validated['approved_amount'])
                ? (int) round((float) $validated['approved_amount'] * 100)
                : $withdrawal->amount_minor;

            if ($validated['status'] === 'approved') {
                $available = $this->ledger->doctorBalanceMinor($institution->id, $withdrawal->user_id, $withdrawal->id);
                abort_if($approvedMinor > $available, 422, 'Suma depășește ce îi datorează instituția medicului.');
            }

            $withdrawal->update([
                'status' => $validated['status'],
                'approved_amount_minor' => $validated['status'] === 'approved' ? $approvedMinor : 0,
                'admin_note' => $validated['note'] ?? null,
                'payout_sent_at' => $validated['status'] === 'approved' ? now() : null,
                'payout_method' => $validated['status'] === 'approved' ? 'transfer_institutie' : null,
                'payout_reference' => $validated['status'] === 'approved' ? ($validated['payout_reference'] ?? null) : null,
                'processed_at' => now(),
                'processed_by' => $request->user()->id,
            ]);
        });

        $withdrawalRequest->refresh();
        $withdrawalRequest->user?->notify(new AppEventNotification(
            $withdrawalRequest->status === 'approved' ? 'Plată confirmată de '.$institution->name : 'Cerere de plată respinsă',
            $withdrawalRequest->status === 'approved'
                ? $institution->name.' a marcat ca plătită suma de '.number_format($withdrawalRequest->approved_amount_minor / 100, 2).' MDL.'
                : ($withdrawalRequest->admin_note ?: $institution->name.' a respins cererea de plată.'),
            '/doctor/stats',
            $withdrawalRequest->status === 'approved' ? 'success' : 'warning',
        ));

        return response()->json([
            'message' => $withdrawalRequest->status === 'approved' ? 'Plata a fost marcată ca efectuată.' : 'Cererea a fost respinsă.',
            'withdrawal' => $this->serializeWithdrawal($withdrawalRequest),
        ]);
    }

    /** Instituția cere de la platformă banii câștigați prin medicii ei. */
    public function requestPayout(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1', 'max:10000000'],
        ]);
        abort_unless($institution->iban, 422, 'Completează IBAN-ul instituției în Setări înainte de a cere o plată.');
        $amountMinor = (int) round((float) $validated['amount'] * 100);
        $available = $this->ledger->institutionBalanceMinor($institution->id) - $this->ledger->institutionPendingMinor($institution->id);
        abort_if($amountMinor > $available, 422, 'Suma depășește soldul disponibil la platformă.');

        $withdrawal = WithdrawalRequest::create([
            'user_id' => $request->user()->id,
            'medical_institution_id' => $institution->id,
            'payer' => InstitutionLedger::PAYER_PLATFORM,
            'amount_minor' => $amountMinor,
            'currency' => 'MDL',
            'iban' => $institution->iban,
            'payout_period' => now()->format('Y-m'),
            'status' => 'pending',
        ]);

        $admins = User::whereHas('roles', fn ($query) => $query->where('name', 'admin'))->get();
        Notification::send($admins, new AppEventNotification(
            'Cerere de plată de la o instituție',
            $institution->name.' a solicitat '.number_format($amountMinor / 100, 2).' MDL.',
            '/admin/transactions',
            'warning',
        ));

        return response()->json([
            'message' => 'Cererea de plată a fost trimisă platformei.',
            'withdrawal' => $this->serializeWithdrawal($withdrawal),
        ], 201);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $validated = $request->validate([
            'legal_name' => ['nullable', 'string', 'max:255'],
            'fiscal_code' => ['nullable', 'string', 'max:32'],
            'iban' => ['nullable', 'string', 'max:64'],
            'bank_name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'address' => ['nullable', 'string', 'max:255'],
            'doctor_share_percent' => ['required', 'numeric', 'min:0', 'max:100'],
        ]);
        $institution->update($validated);

        return response()->json([
            'message' => 'Setările instituției au fost salvate.',
            'institution' => $this->serializeInstitution($institution->refresh()),
        ]);
    }

    private function institutionFor(Request $request): MedicalInstitution
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('institution'), 403, 'Ai nevoie de un cont de instituție medicală.');
        $institution = $user->managedInstitution();
        abort_unless($institution, 403, 'Contul nu este asociat unei instituții.');
        abort_unless($institution->isActive(), 403, 'Instituția este suspendată. Contactează administratorul platformei.');

        return $institution;
    }

    private function ownedDoctorProfile(MedicalInstitution $institution, User $doctor): DoctorProfile
    {
        $profile = DoctorProfile::where('user_id', $doctor->id)->first();
        abort_unless($profile && (int) $profile->medical_institution_id === (int) $institution->id, 404, 'Medicul nu face parte din instituție.');

        return $profile;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeInstitution(MedicalInstitution $institution): array
    {
        return [
            'id' => $institution->id,
            'name' => $institution->name,
            'legal_name' => $institution->legal_name,
            'fiscal_code' => $institution->fiscal_code,
            'iban' => $institution->iban,
            'bank_name' => $institution->bank_name,
            'email' => $institution->email,
            'phone' => $institution->phone,
            'address' => $institution->address,
            'doctor_share_percent' => $institution->doctor_share_percent,
            'status' => $institution->status,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeDoctor(MedicalInstitution $institution, DoctorProfile $profile, ?object $totals): array
    {
        return [
            'id' => $profile->user_id,
            'name' => $profile->user?->name,
            'email' => $profile->user?->email,
            'phone' => $profile->user?->phone,
            'specialty' => $profile->specialty?->name,
            'license_number' => $profile->license_number,
            'doctor_share_percent' => $profile->institution_share_percent,
            'effective_share_percent' => (float) ($profile->institution_share_percent ?? $institution->doctor_share_percent),
            'joined_at' => $profile->institution_joined_at,
            'is_available' => (bool) $profile->is_available,
            'consultations' => (int) ($totals->consultations ?? 0),
            'doctor_total' => (int) ($totals->doctor_total ?? 0) / 100,
            'institution_total' => (int) ($totals->institution_total ?? 0) / 100,
            'balance' => $this->ledger->doctorBalanceMinor($institution->id, $profile->user_id) / 100,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeEarning(InstitutionEarning $earning): array
    {
        return [
            'id' => $earning->id,
            'doctor' => $earning->doctor?->name,
            'consultation_request_id' => $earning->consultation_request_id,
            'gross' => $earning->gross_amount_minor / 100,
            'provider' => $earning->provider_amount_minor / 100,
            'doctor_share_percent' => $earning->doctor_share_percent,
            'doctor_amount' => $earning->doctor_amount_minor / 100,
            'institution_amount' => $earning->institution_amount_minor / 100,
            'date' => $earning->created_at,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeWithdrawal(WithdrawalRequest $withdrawal): array
    {
        return [
            'id' => $withdrawal->id,
            'doctor' => $withdrawal->user?->name,
            'doctor_id' => $withdrawal->user_id,
            'amount' => $withdrawal->amount_minor / 100,
            'approved_amount' => $withdrawal->approved_amount_minor !== null ? $withdrawal->approved_amount_minor / 100 : null,
            'status' => $withdrawal->status,
            'note' => $withdrawal->admin_note,
            'payout_reference' => $withdrawal->payout_reference,
            'date' => $withdrawal->created_at,
            'processed_at' => $withdrawal->processed_at,
            'processed_by' => $withdrawal->processor?->name,
        ];
    }
}
