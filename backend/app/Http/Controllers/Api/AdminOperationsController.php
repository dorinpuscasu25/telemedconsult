<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdminFinancialReportRequest;
use App\Http\Requests\ConfirmAdminWalletRequest;
use App\Http\Requests\IssueAdminWalletConfirmationRequest;
use App\Models\Complaint;
use App\Models\ConsultationRequest;
use App\Models\ContractTemplate;
use App\Models\DoctorProfileView;
use App\Models\FirstTopupPromotionGrant;
use App\Models\MedicalInstitution;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WithdrawalRequest;
use App\Notifications\AppEventNotification;
use App\Services\AdminFinancialReport;
use App\Services\AdminWalletConfirmationService;
use App\Services\BonusCirculationReport;
use App\Services\DoctorPerformance;
use App\Services\FinancialReportScope;
use App\Services\FirstTopupPromotion;
use App\Services\InstitutionLedger;
use App\Services\PlatformConfig;
use App\Services\WalletAdjustment;
use App\Services\WalletLedger;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminOperationsController extends Controller
{
    public function financial(AdminFinancialReportRequest $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $scope = new FinancialReportScope($request->validated());
        $report = new AdminFinancialReport($scope);

        $transactionPage = $scope->transactions()->with('wallet.user')
            ->latest()->orderByDesc('id')
            ->paginate(200, ['*'], 'transactions_page');
        $transactions = $transactionPage->getCollection()->map(fn (WalletTransaction $transaction) => [
            'id' => $transaction->id,
            'date' => $transaction->created_at,
            'user' => $transaction->wallet?->user?->name ?? 'Utilizator',
            'type' => $this->displayTransactionDescription($transaction->description),
            'amount' => $transaction->amount_minor / 100,
            'fee' => $this->platformFeeFor($transaction) / 100,
            'status' => $transaction->status,
            'currency' => $transaction->currency,
            'wallet_type' => $transaction->wallet?->type ?? $transaction->wallet_type ?? 'real',
        ]);

        // Cererile medicilor afiliați le procesează instituția, nu adminul.
        $withdrawals = $scope->withdrawals()->with(['user', 'processor', 'institution'])
            ->latest()
            ->get()
            ->map(fn (WithdrawalRequest $withdrawal) => [
                'id' => $withdrawal->id,
                'doctor' => $withdrawal->medical_institution_id ? ($withdrawal->institution?->name ?? 'Instituție') : ($withdrawal->user?->name ?? 'Utilizator'),
                'beneficiary_type' => $withdrawal->medical_institution_id ? 'institution' : 'doctor',
                'requested_by' => $withdrawal->user?->name,
                'institution_iban' => $withdrawal->institution?->iban,
                'amount' => $withdrawal->amount_minor / 100,
                'approved_amount' => $withdrawal->approved_amount_minor !== null ? $withdrawal->approved_amount_minor / 100 : null,
                'currency' => $withdrawal->currency,
                'date' => $withdrawal->created_at,
                'status' => $withdrawal->status,
                'admin_note' => $withdrawal->admin_note,
                'iban' => $withdrawal->iban,
                'contract_number' => $withdrawal->contract_number,
                'payout_period' => $withdrawal->payout_period,
                'payout_sent_at' => $withdrawal->payout_sent_at,
                'payout_method' => $withdrawal->payout_method,
                'payout_reference' => $withdrawal->payout_reference,
                'processed_at' => $withdrawal->processed_at,
                'processed_by' => $withdrawal->processor?->name,
            ]);

        return response()->json([
            'filters' => ['from' => $request->validated('from'), 'to' => $request->validated('to'), 'institution_id' => $scope->institutionId()],
            'timezone' => 'Europe/Chisinau',
            'institutions' => MedicalInstitution::orderBy('name')->get(['id', 'name', 'status']),
            'summary' => $report->summary(),
            'by_service' => $report->byService(),
            'by_institution' => $report->byInstitution(),
            'transaction_count' => $transactionPage->total(),
            'transaction_pagination' => ['current_page' => $transactionPage->currentPage(), 'last_page' => $transactionPage->lastPage()],
            'bonus_report' => $this->bonusReport($scope),
            'transactions' => $transactions,
            'withdrawals' => $withdrawals,
        ]);
    }

    /** Sursele de bonusuri, cu denumirea afișată în raport. */
    private const BONUS_SOURCES = [
        'first_topup_promotion' => 'Promoția 500 puncte',
        'registration_bonus' => 'Bonus de înregistrare',
        'topup_bonus' => 'Bonus la alimentare',
        'patient_card_bonus' => 'Bonus la pachetul de cartele',
        'review_bonus' => 'Bonus pentru recenzii',
        'referral_topup_commission' => 'Afiliere din alimentare (link personal)',
        'affiliate_bonus' => 'Afiliere din alimentare (cod medic / operator)',
        WalletAdjustment::TYPE_CREDIT => 'Compensări admin',
    ];

    /**
     * Evidența lei reali vs bonusuri: cât s-a încasat în lei, cât s-a achitat
     * din bonusuri, cât s-a plătit medicilor/operatorilor și ce rămâne platformei.
     *
     * @return array<string, mixed>
     */
    private function bonusReport(FinancialReportScope $scope): array
    {
        $captured = $scope->consultations();
        $sum = fn (string $column) => (int) (clone $captured)->sum($column);
        $realMinor = $sum('real_amount_minor');
        $pointsMinor = $sum('points_amount_minor');
        $promoMinor = $sum('promo_amount_minor');
        $providerMinor = $sum('provider_amount_minor');

        $issued = $scope->transactions()->where('status', 'completed')->whereHas('wallet', fn ($query) => $query->whereIn('type', [WalletLedger::POINTS, WalletLedger::PROMO]))
            ->where('amount_minor', '>', 0)
            ->whereIn('type', array_keys(self::BONUS_SOURCES))
            ->selectRaw('type, sum(amount_minor) as total, count(*) as count')
            ->groupBy('type')
            ->get()
            ->keyBy('type');
        $adminDebitMinor = (int) $scope->transactions()->where('status', 'completed')->whereHas('wallet', fn ($query) => $query->where('type', WalletLedger::POINTS))->where('type', WalletAdjustment::TYPE_DEBIT)->sum('amount_minor');

        return [
            'institution_scoped' => $scope->institutionId() !== null,
            'consultations' => [
                'count' => (clone $captured)->count(),
                'total' => ($realMinor + $pointsMinor + $promoMinor) / 100,
                'paid_real' => $realMinor / 100,
                'paid_points' => $pointsMinor / 100,
                'paid_promo' => $promoMinor / 100,
                'provider_payouts' => $providerMinor / 100,
                'platform_net_real' => ($realMinor - $providerMinor) / 100,
            ],
            'issued' => collect(self::BONUS_SOURCES)->map(fn (string $label, string $type) => [
                'type' => $type,
                'label' => $label,
                'amount' => (int) ($issued[$type]->total ?? 0) / 100,
                'count' => (int) ($issued[$type]->count ?? 0),
            ])->values(),
            'issued_total' => (int) $issued->sum('total') / 100,
            'circulation_report' => app(BonusCirculationReport::class)->build($scope, array_keys(self::BONUS_SOURCES)),
            'admin_debits' => abs($adminDebitMinor) / 100,
            'in_circulation' => [
                'points' => (int) Wallet::where('type', WalletLedger::POINTS)->sum('balance_minor') / 100,
                'promo' => (int) Wallet::where('type', WalletLedger::PROMO)->sum('balance_minor') / 100,
            ],
            'promotion' => [
                'automatic_grants' => $scope->institutionId() ? null : $scope->period(FirstTopupPromotionGrant::whereNull('granted_by_admin_id'), 'created_at')->count(),
                'manual_grants' => $scope->institutionId() ? null : $scope->period(FirstTopupPromotionGrant::whereNotNull('granted_by_admin_id'), 'created_at')->count(),
                'max_grants' => app(FirstTopupPromotion::class)->maxGrants(),
            ],
            'recent' => (clone $captured)->select('consultation_requests.*')->selectRaw(FinancialReportScope::RECOGNIZED_AT.' as recognized_at')->with(['patient:id,name', 'doctor:id,name', 'operator:id,name'])->orderByRaw(FinancialReportScope::RECOGNIZED_AT.' DESC')->orderByDesc('id')->limit(100)->get()->map(fn (ConsultationRequest $item) => [
                'id' => $item->id,
                'date' => CarbonImmutable::parse($item->recognized_at, config('app.timezone', 'UTC'))->toIso8601String(),
                'patient' => $item->patient?->name,
                'provider' => $item->doctor?->name ?? $item->operator?->name,
                'total' => ($item->real_amount_minor + $item->points_amount_minor + $item->promo_amount_minor) / 100,
                'paid_real' => $item->real_amount_minor / 100,
                'paid_bonus' => ($item->points_amount_minor + $item->promo_amount_minor) / 100,
                'provider_amount' => $item->provider_amount_minor / 100,
                'platform_net_real' => ($item->real_amount_minor - $item->provider_amount_minor) / 100,
            ])->values(),
        ];
    }

    /**
     * Portofelele unui utilizator, așa cum le vede adminul: soldul în lei (doar
     * citire — e legat de bancă), bonusurile, promoția și ultimele mișcări.
     */
    public function userWallet(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        $wallets = Wallet::where('user_id', $user->id)->get()->keyBy('type');
        $balance = fn (string $type) => ($wallets[$type]->balance_minor ?? 0) / 100;
        $grant = FirstTopupPromotionGrant::where('user_id', $user->id)->first();

        return response()->json([
            'data' => [
                'user' => ['id' => (string) $user->id, 'name' => $user->name, 'email' => $user->email],
                'balance' => $balance(WalletLedger::REAL),
                'points_balance' => $balance(WalletLedger::POINTS),
                'promo_balance' => $balance(WalletLedger::PROMO),
                'currency' => $wallets[WalletLedger::REAL]->currency ?? 'MDL',
                'promotion' => [
                    'granted' => (bool) $grant,
                    'granted_at' => $grant?->created_at,
                    'manual' => (bool) $grant?->granted_by_admin_id,
                    'amount' => FirstTopupPromotion::AMOUNT_MINOR / 100,
                ],
                'transactions' => WalletTransaction::where('user_id', $user->id)->latest('id')->limit(30)->get()->map(fn (WalletTransaction $transaction) => [
                    'id' => (string) $transaction->id,
                    'date' => $transaction->created_at,
                    'amount' => $transaction->amount_minor / 100,
                    'wallet_type' => $transaction->wallet_type ?? WalletLedger::REAL,
                    'type' => $transaction->type,
                    'description' => $transaction->description,
                    'admin' => $transaction->metadata['admin_name'] ?? null,
                ])->values(),
            ],
        ]);
    }

    /**
     * Adaugă (sau scade) manual PUNCTE BONUS. Soldul în lei nu se ajustează din
     * admin — compensațiile se fac numai în bonusuri.
     */
    public function issueWalletConfirmation(IssueAdminWalletConfirmationRequest $request, User $user, AdminWalletConfirmationService $confirmations): JsonResponse
    {
        $confirmation = $confirmations->issue($request->user(), $user, $request->validated());

        return response()->json([
            'confirmation_id' => $confirmation->id, 'expires_at' => $confirmation->expires_at,
            'operation' => $confirmation->operation, 'amount' => $confirmation->payload['amount_minor'] / 100,
            'reason' => $confirmation->payload['reason'],
            'message' => 'Codul a fost trimis pe emailul administratorului. Soldul nu a fost modificat.',
        ], 201);
    }

    public function adjustUserWallet(ConfirmAdminWalletRequest $request, User $user, AdminWalletConfirmationService $confirmations): JsonResponse
    {
        $validated = $request->validated();
        $result = $confirmations->confirm($request->user(), $user, 'adjustment', $validated['confirmation_id'], $validated['code']);
        $amountMinor = $result['amount_minor'];

        $balance = (int) Wallet::where('user_id', $user->id)->where('type', WalletLedger::POINTS)->value('balance_minor');

        return response()->json([
            'message' => ($amountMinor > 0 ? 'Am adăugat ' : 'Am scăzut ')
                .number_format(abs($amountMinor) / 100, 2, ',', '.').' puncte bonus. Sold bonusuri: '
                .number_format($balance / 100, 2, ',', '.').' puncte.',
            'data' => [
                'points_balance' => $balance / 100,
                'transaction_id' => $result['transaction_id'],
            ],
        ]);
    }

    /** Acordă manual promoția de 500 de puncte unui utilizator deja înregistrat. */
    public function grantUserPromotion(ConfirmAdminWalletRequest $request, User $user, AdminWalletConfirmationService $confirmations): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless($user->hasRole('patient'), 422, 'Promoția se acordă doar conturilor de pacient.');

        $validated = $request->validated();
        $confirmations->confirm($request->user(), $user, 'promotion', $validated['confirmation_id'], $validated['code']);

        return response()->json([
            'message' => 'Am acordat '.(FirstTopupPromotion::AMOUNT_MINOR / 100).' puncte promoționale.',
            'data' => ['promo_balance' => (int) Wallet::where('user_id', $user->id)->where('type', WalletLedger::PROMO)->value('balance_minor') / 100],
        ]);
    }

    public function updateWithdrawal(Request $request, WithdrawalRequest $withdrawalRequest): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected'])],
            'approved_amount' => ['nullable', 'numeric', 'min:0'],
            'admin_note' => ['nullable', 'string', 'max:2000'],
            'payout_sent_at' => ['nullable', 'date'],
            'payout_method' => ['nullable', 'string', 'max:100'],
            'payout_reference' => ['nullable', 'string', 'max:255'],
        ]);

        abort_unless($withdrawalRequest->status === 'pending', 422, 'Cererea a fost deja procesată.');
        abort_if($withdrawalRequest->payer === InstitutionLedger::PAYER_INSTITUTION, 403, 'Această cerere este plătită de instituția medicului.');

        DB::transaction(function () use ($request, $withdrawalRequest, $validated) {
            $approvedAmountMinor = isset($validated['approved_amount'])
                ? (int) round((float) $validated['approved_amount'] * 100)
                : $withdrawalRequest->amount_minor;

            if ($validated['status'] === 'approved') {
                $availableMinor = $withdrawalRequest->medical_institution_id
                    ? app(InstitutionLedger::class)->institutionBalanceMinor($withdrawalRequest->medical_institution_id, $withdrawalRequest->id)
                    : $this->doctorAvailableBalanceMinor($withdrawalRequest);
                abort_if($approvedAmountMinor > $availableMinor, 422, $withdrawalRequest->medical_institution_id ? 'Suma depășește soldul instituției.' : 'Suma depășește balanța disponibilă a medicului.');
            }

            $withdrawalRequest->update([
                'status' => $validated['status'],
                'approved_amount_minor' => $validated['status'] === 'approved' ? $approvedAmountMinor : 0,
                'admin_note' => $validated['admin_note'] ?? null,
                'payout_sent_at' => $validated['status'] === 'approved'
                    ? ($validated['payout_sent_at'] ?? now())
                    : null,
                'payout_method' => $validated['status'] === 'approved' ? ($validated['payout_method'] ?? 'transfer_bancar') : null,
                'payout_reference' => $validated['status'] === 'approved' ? ($validated['payout_reference'] ?? null) : null,
                'processed_at' => now(),
                'processed_by' => $request->user()->id,
            ]);

            if ($validated['status'] === 'approved' && ! $withdrawalRequest->medical_institution_id) {
                $wallet = Wallet::firstOrCreate(
                    ['user_id' => $withdrawalRequest->user_id],
                    ['balance_minor' => 0, 'currency' => $withdrawalRequest->currency],
                );
                $wallet->decrement('balance_minor', $approvedAmountMinor);

                WalletTransaction::create([
                    'wallet_id' => $wallet->id,
                    'user_id' => $withdrawalRequest->user_id,
                    'amount_minor' => -$approvedAmountMinor,
                    'currency' => $withdrawalRequest->currency,
                    'type' => 'doctor_withdrawal',
                    'status' => 'completed',
                    'description' => 'Extragere marcată ca plătită manual',
                    'metadata' => [
                        'withdrawal_request_id' => $withdrawalRequest->id,
                        'payout_sent_at' => $withdrawalRequest->payout_sent_at,
                        'payout_method' => $withdrawalRequest->payout_method,
                        'payout_reference' => $withdrawalRequest->payout_reference,
                    ],
                ]);
            }
        });

        return response()->json(['message' => 'Cerere actualizată.', 'withdrawal' => $withdrawalRequest->fresh('user')]);
    }

    public function complaints(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => Complaint::with(['patient', 'reportedUser'])
                ->latest()
                ->get()
                ->map(fn (Complaint $complaint) => $this->serializeComplaint($complaint)),
        ]);
    }

    public function resolveComplaint(Request $request, Complaint $complaint): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'resolution_note' => ['nullable', 'string', 'max:3000'],
            'coupon_amount' => ['nullable', 'numeric', 'min:0', 'max:10000'],
        ]);

        $couponAmount = isset($validated['coupon_amount'])
            ? (int) round((float) $validated['coupon_amount'] * 100)
            : null;

        $complaint->update([
            'status' => 'resolved',
            'resolution_note' => $validated['resolution_note'] ?? null,
            'coupon_amount_minor' => $couponAmount,
            'coupon_code' => $couponAmount ? 'DOC-'.Str::upper(Str::random(8)) : null,
            'resolved_at' => now(),
        ]);

        $complaint->patient?->notify(new AppEventNotification(
            'Reclamație rezolvată',
            'Reclamația ta "'.$complaint->subject.'" a fost procesată de echipa telemedconsult.md.',
            '/patient/complaints',
            'success',
        ));

        return response()->json([
            'message' => 'Reclamație rezolvată.',
            'complaint' => $this->serializeComplaint($complaint->fresh(['patient', 'reportedUser'])),
        ]);
    }

    public function contracts(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => ContractTemplate::latest('updated_at')->get()->map(fn (ContractTemplate $contract) => [
                'id' => $contract->id,
                'title' => $contract->title,
                'type' => $contract->type,
                'content' => $contract->content,
                'status' => $contract->status,
                'lastUpdated' => $contract->updated_at,
            ]),
        ]);
    }

    public function storeContract(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['nullable', 'string', 'max:100'],
            'content' => ['required', 'string'],
            'status' => ['nullable', Rule::in(['active', 'draft', 'archived'])],
        ]);

        $contract = ContractTemplate::create([
            ...$validated,
            'type' => $validated['type'] ?? 'general',
            'status' => $validated['status'] ?? 'active',
            'updated_by' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Contract creat.', 'contract' => $contract], 201);
    }

    public function updateContract(Request $request, ContractTemplate $contractTemplate): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['nullable', 'string', 'max:100'],
            'content' => ['required', 'string'],
            'status' => ['nullable', Rule::in(['active', 'draft', 'archived'])],
        ]);

        $contractTemplate->update([
            ...$validated,
            'type' => $validated['type'] ?? $contractTemplate->type,
            'status' => $validated['status'] ?? $contractTemplate->status,
            'updated_by' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Contract actualizat.', 'contract' => $contractTemplate->fresh()]);
    }

    public function settings(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $settings = PlatformSetting::orderBy('group')->orderBy('key')->get();

        return response()->json([
            'data' => $settings->pluck('value', 'key'),
            'settings' => $settings,
            'groups' => $settings->groupBy('group')->map(fn ($items) => $items->values()),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'settings' => ['nullable', 'array'],
            'settings.*.key' => ['required_with:settings', 'string', 'max:255'],
            'settings.*.value' => ['nullable'],
            'settings.*.group' => ['nullable', 'string', 'max:100'],
            'settings.*.type' => ['nullable', Rule::in(['string', 'number', 'boolean', 'json'])],
        ]);

        // Toate cotele procentuale trebuie să rămână în intervalul 0–100,
        // altfel un comision configurat greșit poate goli platforma.
        $percentKeys = [
            'rate.platform_commission' => 'Comisionul platformei',
            'rate.admin_accounting' => 'Cota de administrare și contabilitate',
            'rate.bank_guarantee' => 'Cota de garanție bancară',
            'rate.bank_transaction' => 'Comisionul de tranzacție bancară',
            'rate.affiliate_doctor_topup' => 'Cota de afiliere medic',
            'rate.affiliate_operator' => 'Cota de afiliere operator',
            'rate.affiliate_patient_topup' => 'Cota de afiliere pacient la alimentare',
            'wallet.topup_bonus_percent' => 'Bonusul la alimentare',
            'wallet.max_points_payment_percent' => 'Procentul maxim achitabil cu puncte',
        ];

        collect($validated['settings'] ?? [])->each(function (array $setting) use ($percentKeys) {
            $key = $setting['key'] ?? null;
            $value = $setting['value'] ?? null;

            if ($key !== null && isset($percentKeys[$key])) {
                if (! is_numeric($value) || (float) $value < 0 || (float) $value > 100) {
                    throw ValidationException::withMessages([
                        'settings' => [$percentKeys[$key].' trebuie să fie un procent între 0 și 100.'],
                    ]);
                }
            }

            if (str_starts_with((string) $key, 'performance.') && (! array_key_exists(substr($key, 12), DoctorPerformance::DEFAULT_WEIGHTS) || ! is_numeric($value) || $value < 0 || $value > 1000)) {
                throw ValidationException::withMessages(['settings' => ['Ponderea de performanță trebuie să fie între 0 și 1000.']]);
            }

            if ($key === 'consultations.addendum_days' && (! is_numeric($value) || (int) $value != $value || $value != 10)) {
                throw ValidationException::withMessages(['settings' => ['Fereastra completărilor trebuie să fie egală cu 10 zile.']]);
            }
            if (in_array($key, ['payout.request_day_start', 'payout.request_day_end'], true) && (! is_numeric($value) || (int) $value != $value || $value < 1 || $value > 31)) {
                throw ValidationException::withMessages(['settings' => ['Zilele pentru cereri de plată trebuie să fie numere întregi între 1 și 31.']]);
            }

            if ($key === 'affiliate.patient_topup_first_only' && ! in_array($value, [true, 1, '1', 'true'], true)) {
                throw ValidationException::withMessages(['settings' => ['Referalul se acordă numai la prima alimentare efectivă.']]);
            }

            if ($key === 'affiliate.patient_topup_min_amount') {
                if (! is_numeric($value) || (float) $value < 0 || (float) $value > 100000) {
                    throw ValidationException::withMessages([
                        'settings' => ['Alimentarea minimă eligibilă trebuie să fie între 0 și 100.000 MDL.'],
                    ]);
                }
            }

            // Bonusul de bun-venit se creditează necondiționat la confirmarea
            // emailului: o valoare greșită aici se plătește din banii
            // platformei, deci limita e strânsă intenționat.
            if ($key === 'wallet.registration_bonus') {
                if (! is_numeric($value) || (float) $value < 0 || (float) $value > 10000) {
                    throw ValidationException::withMessages([
                        'settings' => ['Bonusul de înregistrare trebuie să fie între 0 și 10.000 MDL.'],
                    ]);
                }
            }

            if ($key === 'onboarding.first_consultation_topup') {
                if (! is_numeric($value) || (float) $value < 0 || (float) $value > 50000) {
                    throw ValidationException::withMessages([
                        'settings' => ['Suma pentru prima consultație trebuie să fie între 0 și 50.000 MDL.'],
                    ]);
                }
            }

            if ($key === 'affiliate.patient_registration_rules'
                && mb_strlen((string) ($value ?? '')) > 4000) {
                throw ValidationException::withMessages([
                    'settings' => ['Regulamentul de afiliere poate avea maximum 4.000 de caractere.'],
                ]);
            }
        });

        $promotionChanges = collect($validated['settings'] ?? [])->pluck('value', 'key');
        if ($promotionChanges->has('payout.request_day_start') || $promotionChanges->has('payout.request_day_end')) {
            $config = app(PlatformConfig::class);
            $start = (int) $promotionChanges->get('payout.request_day_start', $config->number('payout.request_day_start', 1));
            $end = (int) $promotionChanges->get('payout.request_day_end', $config->number('payout.request_day_end', 10));
            if ($start > $end) {
                throw ValidationException::withMessages(['settings' => ['Ziua de început a cererilor de plată nu poate fi după ziua de sfârșit.']]);
            }
        }
        foreach (['wallet.first_topup_promo_enabled', 'wallet.first_topup_promo_doctor_ids'] as $promotionKey) {
            if (! $promotionChanges->has($promotionKey)) {
                continue;
            }
            $value = $promotionChanges[$promotionKey];
            if ($promotionKey === 'wallet.first_topup_promo_enabled' && ! is_bool($value)) {
                throw ValidationException::withMessages(['settings' => ['Activarea promoției trebuie să fie o valoare booleană.']]);
            }
            if ($promotionKey === 'wallet.first_topup_promo_doctor_ids') {
                if (! is_array($value) || ! array_is_list($value) || count($value) > 100 || collect($value)->contains(fn ($id) => ! is_int($id) || $id <= 0)) {
                    throw ValidationException::withMessages(['settings' => ['Selectează o listă de identificatori de medici valizi.']]);
                }
                $approved = User::whereIn('id', $value)->whereHas('doctorProfile', fn ($query) => $query->where('is_approved', true))->whereHas('roles', fn ($query) => $query->where('name', 'doctor'))->count();
                if ($approved !== count(array_unique($value))) {
                    throw ValidationException::withMessages(['settings' => ['Promoția poate fi oferită doar de medici aprobați.']]);
                }
            }
        }

        DB::transaction(function () use ($request, $validated) {
            $config = app(PlatformConfig::class);
            $settings = collect($validated['settings'] ?? []);

            if ($settings->isEmpty()) {
                $settings = collect($request->all())
                    ->map(fn ($value, string $key) => ['key' => $key, 'value' => $value]);
            }

            $settings->each(function (array $setting) use ($config, $request) {
                $config->upsert(
                    $setting['key'],
                    $setting['value'] ?? null,
                    $setting['group'] ?? $this->settingGroup($setting['key']),
                    $setting['type'] ?? null,
                    $request->user()->id,
                );
            });

        });

        return $this->settings($request)->setStatusCode(200);
    }

    public function regions(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => app(PlatformConfig::class)->get('regions.catalog', [
                ['country' => 'Republica Moldova', 'region' => 'Chișinău', 'localities' => ['Chișinău']],
                ['country' => 'Republica Moldova', 'region' => 'Strășeni', 'localities' => ['Strășeni', 'Căpriana']],
            ]),
        ]);
    }

    public function updateRegions(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'regions' => ['required', 'array'],
            'regions.*.country' => ['required', 'string', 'max:100'],
            'regions.*.region' => ['required', 'string', 'max:100'],
            'regions.*.localities' => ['nullable', 'array'],
            'regions.*.localities.*' => ['string', 'max:100'],
        ]);

        app(PlatformConfig::class)->upsert('regions.catalog', $validated['regions'], 'regions', 'json', $request->user()->id);

        return response()->json(['message' => 'Regiuni salvate.', 'data' => $validated['regions']]);
    }

    public function topDoctors(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $views = DoctorProfileView::selectRaw('doctor_id, COUNT(*) as total')->groupBy('doctor_id')->pluck('total', 'doctor_id');
        $data = app(DoctorPerformance::class)->leaderboard()->map(fn ($row) => [...$row, 'affiliate_patients' => (int) $views->get($row['doctor_id'], 0)]);

        return response()->json(['data' => $data]);
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user()->loadMissing('roles');

        abort_unless($user->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }

    private function platformFeeFor(WalletTransaction $transaction): int
    {
        if (in_array($transaction->type, ['institution_consultation_income', 'operator_add_on_income'], true) && $transaction->amount_minor >= 0) {
            return (int) ($transaction->metadata['platform_fee_minor'] ?? 0);
        }
        if ($transaction->amount_minor <= 0) {
            return 0;
        }

        return match ($transaction->type) {
            'top_up' => 0,
            'consultation', 'consultation_income', 'operator_exam_income', 'operator_add_on_income' => (int) ($transaction->metadata['platform_fee_minor'] ?? 0),
            'subscription', 'premium' => $transaction->amount_minor,
            default => 0,
        };
    }

    private function displayTransactionDescription(string $description): string
    {
        return trim((string) preg_replace('/\s*\([^)]+\)/', '', $description));
    }

    private function doctorAvailableBalanceMinor(WithdrawalRequest $withdrawalRequest): int
    {
        return app(InstitutionLedger::class)->platformDoctorBalanceMinor($withdrawalRequest->user_id, $withdrawalRequest->id);
    }

    private function serializeComplaint(Complaint $complaint): array
    {
        return [
            'id' => $complaint->id,
            'patient' => $complaint->patient?->name,
            'reportedUser' => $complaint->reportedUser?->name,
            'date' => $complaint->created_at,
            'status' => $complaint->status,
            'subject' => $complaint->subject,
            'description' => $complaint->description,
            'resolution_note' => $complaint->resolution_note,
            'coupon_code' => $complaint->coupon_code,
            'coupon_amount' => $complaint->coupon_amount_minor ? $complaint->coupon_amount_minor / 100 : null,
        ];
    }

    private function settingGroup(string $key): string
    {
        if (Str::startsWith($key, 'notify_')) {
            return 'notifications';
        }

        if (Str::startsWith($key, 'rate.')) {
            return 'commissions';
        }

        if (Str::startsWith($key, 'affiliate.')) {
            return 'affiliate';
        }

        if (Str::startsWith($key, 'chat.')) {
            return 'chat';
        }

        if (Str::startsWith($key, 'video.')) {
            return 'video';
        }

        if (Str::startsWith($key, 'payout.')) {
            return 'payout';
        }

        if (Str::contains($key, ['price', 'commission'])) {
            return 'financial';
        }

        return 'general';
    }

    private function notifyAdmins(string $title, string $body, string $url, bool $sendEmail, string $level = 'info'): void
    {
        $admins = User::whereHas('roles', fn ($query) => $query->where('name', 'admin'))->get();
        Notification::send($admins, new AppEventNotification($title, $body, $url, $level, $sendEmail));
    }
}
