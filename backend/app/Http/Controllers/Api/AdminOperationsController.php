<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\ConsultationRequest;
use App\Models\ContractTemplate;
use App\Models\DoctorProfile;
use App\Models\DoctorProfileView;
use App\Models\FirstTopupPromotionGrant;
use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WithdrawalRequest;
use App\Notifications\AppEventNotification;
use App\Services\DoctorPerformance;
use App\Services\FirstTopupPromotion;
use App\Services\InstitutionLedger;
use App\Services\PlatformConfig;
use App\Services\WalletAdjustment;
use App\Services\WalletLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminOperationsController extends Controller
{
    public function financial(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $transactions = WalletTransaction::with('wallet.user')
            ->latest()
            ->limit(200)
            ->get()
            ->map(fn (WalletTransaction $transaction) => [
                'id' => $transaction->id,
                'date' => $transaction->created_at,
                'user' => $transaction->wallet?->user?->name ?? 'Utilizator',
                'type' => $this->displayTransactionDescription($transaction->description),
                'amount' => $transaction->amount_minor / 100,
                'fee' => $this->platformFeeFor($transaction) / 100,
                'status' => $transaction->status,
                'currency' => $transaction->currency,
                'wallet_type' => $transaction->wallet_type ?? $transaction->wallet?->type ?? 'real',
            ]);

        // Cererile medicilor afiliați le procesează instituția, nu adminul.
        $withdrawals = WithdrawalRequest::with(['user', 'processor', 'institution'])
            ->where('payer', InstitutionLedger::PAYER_PLATFORM)
            ->latest()
            ->get()
            ->map(fn (WithdrawalRequest $withdrawal) => [
                'id' => $withdrawal->id,
                'doctor' => $withdrawal->medical_institution_id ? ($withdrawal->institution?->name ?? 'Instituție') : ($withdrawal->user?->name ?? 'Utilizator'),
                'beneficiary_type' => $withdrawal->medical_institution_id ? 'institution' : 'doctor',
                'requested_by' => $withdrawal->user?->name,
                'institution_iban' => $withdrawal->institution?->iban,
                'amount' => $withdrawal->amount_minor / 100,
                'approved_amount' => $withdrawal->approved_amount_minor ? $withdrawal->approved_amount_minor / 100 : null,
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
            'summary' => [
                'wallets_balance' => Wallet::where('type', 'real')->sum('balance_minor') / 100,
                'points_balance' => Wallet::where('type', 'points')->sum('balance_minor') / 100,
                'top_ups' => Payment::where('purpose', 'wallet_top_up')->whereIn('status', ['paid', 'pending'])->sum('amount_minor') / 100,
                'platform_fees' => $transactions->sum('fee'),
                'pending_withdrawals' => WithdrawalRequest::where('payer', InstitutionLedger::PAYER_PLATFORM)->where('status', 'pending')->sum('amount_minor') / 100,
            ],
            'bonus_report' => $this->bonusReport(),
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
        'referral_topup_commission' => 'Referral 3% (link personal)',
        'affiliate_bonus' => 'Referral 3% (cod medic / operator)',
        WalletAdjustment::TYPE_CREDIT => 'Compensări admin',
    ];

    /**
     * Evidența lei reali vs bonusuri: cât s-a încasat în lei, cât s-a achitat
     * din bonusuri, cât s-a plătit medicilor/operatorilor și ce rămâne platformei.
     *
     * @return array<string, mixed>
     */
    private function bonusReport(): array
    {
        $captured = ConsultationRequest::where('payment_status', 'captured');
        $sum = fn (string $column) => (int) (clone $captured)->sum($column);
        $realMinor = $sum('real_amount_minor');
        $pointsMinor = $sum('points_amount_minor');
        $promoMinor = $sum('promo_amount_minor');
        $providerMinor = $sum('provider_amount_minor');

        $issued = WalletTransaction::whereIn('wallet_type', [WalletLedger::POINTS, WalletLedger::PROMO])
            ->where('amount_minor', '>', 0)
            ->whereIn('type', array_keys(self::BONUS_SOURCES))
            ->selectRaw('type, sum(amount_minor) as total, count(*) as count')
            ->groupBy('type')
            ->get()
            ->keyBy('type');
        $adminDebitMinor = (int) WalletTransaction::where('wallet_type', WalletLedger::POINTS)->where('type', WalletAdjustment::TYPE_DEBIT)->sum('amount_minor');

        return [
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
            'admin_debits' => abs($adminDebitMinor) / 100,
            'in_circulation' => [
                'points' => (int) Wallet::where('type', WalletLedger::POINTS)->sum('balance_minor') / 100,
                'promo' => (int) Wallet::where('type', WalletLedger::PROMO)->sum('balance_minor') / 100,
            ],
            'promotion' => [
                'automatic_grants' => FirstTopupPromotionGrant::whereNull('granted_by_admin_id')->count(),
                'manual_grants' => FirstTopupPromotionGrant::whereNotNull('granted_by_admin_id')->count(),
                'max_grants' => app(FirstTopupPromotion::class)->maxGrants(),
            ],
            'recent' => (clone $captured)->with(['patient:id,name', 'doctor:id,name', 'operator:id,name'])->latest('id')->limit(100)->get()->map(fn (ConsultationRequest $item) => [
                'id' => $item->id,
                'date' => $item->updated_at,
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
    public function adjustUserWallet(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:1000000'],
            'direction' => ['required', Rule::in(['credit', 'debit'])],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ], [
            'reason.required' => 'Scrie motivul ajustării — rămâne în istoricul tranzacției.',
            'amount.min' => 'Suma trebuie să fie cel puțin 0,01 puncte.',
        ]);

        $amountMinor = (int) round(((float) $validated['amount']) * 100);

        if ($validated['direction'] === 'debit') {
            $amountMinor = -$amountMinor;
        }

        $transaction = app(WalletAdjustment::class)->apply(
            $user,
            $amountMinor,
            trim($validated['reason']),
            $request->user(),
        );

        $balance = (int) Wallet::where('user_id', $user->id)->where('type', WalletLedger::POINTS)->value('balance_minor');

        return response()->json([
            'message' => ($amountMinor > 0 ? 'Am adăugat ' : 'Am scăzut ')
                .number_format(abs($amountMinor) / 100, 2, ',', '.').' puncte bonus. Sold bonusuri: '
                .number_format($balance / 100, 2, ',', '.').' puncte.',
            'data' => [
                'points_balance' => $balance / 100,
                'transaction_id' => (string) $transaction->id,
            ],
        ]);
    }

    /** Acordă manual promoția de 500 de puncte unui utilizator deja înregistrat. */
    public function grantUserPromotion(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless($user->hasRole('patient'), 422, 'Promoția se acordă doar conturilor de pacient.');

        app(FirstTopupPromotion::class)->grantManually($user, $request->user());

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

            if ($key === 'consultations.addendum_days' && (! is_numeric($value) || (int) $value != $value || $value != 14)) {
                throw ValidationException::withMessages(['settings' => ['Fereastra completărilor trebuie să fie egală cu 14 zile.']]);
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

            if ($key === 'affiliate.patient_registration_rules'
                && mb_strlen((string) ($value ?? '')) > 4000) {
                throw ValidationException::withMessages([
                    'settings' => ['Regulamentul de afiliere poate avea maximum 4.000 de caractere.'],
                ]);
            }
        });

        $promotionChanges = collect($validated['settings'] ?? [])->pluck('value', 'key');
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

        $data = DoctorProfile::with('user')
            ->get()
            ->map(function (DoctorProfile $profile) {
                $doctorId = $profile->user_id;
                $performance = app(DoctorPerformance::class)->forDoctor($profile);
                $affiliatePatients = DoctorProfileView::where('doctor_id', $doctorId)->count();

                return [
                    'doctor_id' => (string) $doctorId,
                    'doctor' => $profile->user?->name ?? 'Medic',
                    'rating' => (float) $profile->rating,
                    'reviews_count' => (int) $profile->reviews_count,
                    'affiliate_patients' => $affiliatePatients,
                    'current_month_consultations' => $performance['current_month_consultations'],
                    'previous_total_consultations' => $performance['previous_total_consultations'],
                    'average_response_minutes' => $performance['average_response_minutes'],
                    'score' => $performance['score'],
                ];
            })
            ->sortByDesc('score')
            ->values();

        return response()->json(['data' => $data]);
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user()->loadMissing('roles');

        abort_unless($user->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }

    private function platformFeeFor(WalletTransaction $transaction): int
    {
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
