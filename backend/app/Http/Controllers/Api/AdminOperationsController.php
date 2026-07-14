<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Consultation;
use App\Models\ContractTemplate;
use App\Models\DoctorProfile;
use App\Models\DoctorProfileView;
use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Models\WithdrawalRequest;
use App\Notifications\AppEventNotification;
use App\Services\PlatformConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
            ]);

        $withdrawals = WithdrawalRequest::with(['user', 'processor'])
            ->latest()
            ->get()
            ->map(fn (WithdrawalRequest $withdrawal) => [
                'id' => $withdrawal->id,
                'doctor' => $withdrawal->user?->name ?? 'Utilizator',
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
                'wallets_balance' => Wallet::sum('balance_minor') / 100,
                'top_ups' => Payment::where('purpose', 'wallet_top_up')->whereIn('status', ['paid', 'pending'])->sum('amount_minor') / 100,
                'platform_fees' => $transactions->sum('fee'),
                'pending_withdrawals' => WithdrawalRequest::where('status', 'pending')->sum('amount_minor') / 100,
            ],
            'transactions' => $transactions,
            'withdrawals' => $withdrawals,
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

        DB::transaction(function () use ($request, $withdrawalRequest, $validated) {
            $approvedAmountMinor = isset($validated['approved_amount'])
                ? (int) round((float) $validated['approved_amount'] * 100)
                : $withdrawalRequest->amount_minor;

            if ($validated['status'] === 'approved') {
                $availableMinor = $this->doctorAvailableBalanceMinor($withdrawalRequest);
                abort_if($approvedAmountMinor > $availableMinor, 422, 'Suma depășește balanța disponibilă a medicului.');
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

            if ($validated['status'] === 'approved') {
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

        $currentMonthStart = now()->startOfMonth();
        $currentMonthEnd = now()->endOfMonth();

        $data = DoctorProfile::with('user')
            ->get()
            ->map(function (DoctorProfile $profile) use ($currentMonthStart, $currentMonthEnd) {
                $doctorId = $profile->user_id;
                $currentMonth = Consultation::where('doctor_id', $doctorId)
                    ->where('status', 'completed')
                    ->whereBetween('completed_at', [$currentMonthStart, $currentMonthEnd])
                    ->count();
                $previousTotal = Consultation::where('doctor_id', $doctorId)
                    ->where('status', 'completed')
                    ->where('completed_at', '<', $currentMonthStart)
                    ->count();
                $avgResponse = (int) round((float) DB::table('consultation_requests')
                    ->where('doctor_id', $doctorId)
                    ->whereNotNull('doctor_response_minutes')
                    ->avg('doctor_response_minutes'));
                $affiliatePatients = DoctorProfileView::where('doctor_id', $doctorId)->count();
                $score = ($currentMonth * 4) + ($previousTotal * 1.5) + ((float) $profile->rating * 10) + max(0, 60 - min(60, $avgResponse));

                return [
                    'doctor_id' => (string) $doctorId,
                    'doctor' => $profile->user?->name ?? 'Medic',
                    'rating' => (float) $profile->rating,
                    'reviews_count' => (int) $profile->reviews_count,
                    'affiliate_patients' => $affiliatePatients,
                    'current_month_consultations' => $currentMonth,
                    'previous_total_consultations' => $previousTotal,
                    'average_response_minutes' => $avgResponse ?: null,
                    'score' => round($score, 2),
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
        $consultationRevenueMinor = (int) (DB::table('consultations')
            ->where('doctor_id', $withdrawalRequest->user_id)
            ->where('status', 'completed')
            ->sum('price') * 100);

        $processedWithdrawalsMinor = (int) WithdrawalRequest::query()
            ->where('user_id', $withdrawalRequest->user_id)
            ->where('status', 'approved')
            ->whereKeyNot($withdrawalRequest->id)
            ->selectRaw('COALESCE(SUM(COALESCE(approved_amount_minor, amount_minor)), 0) as total')
            ->value('total');

        return max(0, $consultationRevenueMinor - $processedWithdrawalsMinor);
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
