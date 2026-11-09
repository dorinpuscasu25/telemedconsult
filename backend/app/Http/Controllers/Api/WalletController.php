<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\FeatureFlags;
use App\Services\FirstTopupPromotion;
use App\Services\MaibCheckout;
use App\Services\PatientCardPurchaser;
use App\Services\PaymentVerification;
use App\Services\PlatformConfig;
use App\Services\ReferralProgram;
use App\Services\WalletLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $wallet = $this->walletFor($user, WalletLedger::REAL);
        $points = $this->walletFor($user, WalletLedger::POINTS);
        $promo = $this->walletFor($user, WalletLedger::PROMO);

        $realTransactions = $wallet->transactions()->latest()->orderByDesc('id')->limit(50)->get();
        $pointsTransactions = $points->transactions()->latest()->orderByDesc('id')->limit(50)->get();
        $promoTransactions = $promo->transactions()->latest()->orderByDesc('id')->limit(50)->get();
        $consultations = $this->consultationsFor($user, $realTransactions->concat($pointsTransactions)->concat($promoTransactions)->pluck('consultation_request_id')->filter()->unique());
        $serialize = fn (WalletTransaction $transaction) => $this->serializeTransaction($transaction, $consultations);

        return response()->json([
            'topup_bonus_percent' => min(100, max(0, app(PlatformConfig::class)->number('wallet.topup_bonus_percent', 0))),
            'max_bonus_payment_percent' => app(PlatformConfig::class)->number('wallet.max_points_payment_percent', 40),
            'promo_wallet' => $this->serializeWallet($promo),
            'first_topup_promotion' => app(FirstTopupPromotion::class)->describe($user->id),
            'promo_transactions' => $promoTransactions->map($serialize),
            'wallet' => $this->serializeWallet($wallet),
            'points_wallet' => $this->serializeWallet($points),
            'transactions' => $realTransactions->map($serialize),
            'points_transactions' => $pointsTransactions->map($serialize),
            'reserved' => $this->reservedFor($user),
            'payments' => Payment::where('user_id', $user->id)->latest()->limit(20)->get(),
        ]);
    }

    /**
     * Banii rezervați acum pentru consultații (plătite doar după consultație).
     * Doar citire: sumele vin din cererile cu plata `held`.
     *
     * @return array{total: float, points_total: float, items: list<array<string, mixed>>}
     */
    private function reservedFor(User $user): array
    {
        $items = ConsultationRequest::with(['doctor', 'operator', 'patientProfile'])
            ->where('patient_id', $user->id)
            ->where('payment_status', 'held')
            ->orderBy('scheduled_at')
            ->get()
            ->map(fn (ConsultationRequest $item) => [
                'consultation_request_id' => $item->id,
                'amount' => $this->heldRealMinor($item) / 100,
                'points_amount' => ((int) $item->points_amount_minor) / 100,
                'provider_name' => $item->doctor?->name ?? $item->operator?->name,
                'patient_name' => $item->patientProfile?->display_name,
                'scheduled_at' => $item->scheduled_at,
                'status' => $item->status,
            ])
            ->values();

        return [
            'total' => round($items->sum('amount'), 2),
            'points_total' => round($items->sum('points_amount'), 2),
            'items' => $items->all(),
        ];
    }

    private function heldRealMinor(ConsultationRequest $item): int
    {
        if ($item->real_amount_minor !== null) {
            return (int) $item->real_amount_minor;
        }

        return max(0, (int) $item->amount_minor - (int) $item->points_amount_minor - (int) $item->promo_amount_minor);
    }

    /**
     * @param  Collection<int, int>  $ids
     * @return Collection<int, ConsultationRequest>
     */
    private function consultationsFor(User $user, Collection $ids): Collection
    {
        if ($ids->isEmpty()) {
            return collect();
        }

        return ConsultationRequest::with(['doctor', 'operator', 'patientProfile'])
            ->where('patient_id', $user->id)
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');
    }

    /**
     * O operație din istoric, cu tipul ei și, dacă ține de o consultație, starea rezervării:
     * `reserved` (bani puși deoparte), `paid` (plătiți după consultație) sau `refunded`.
     *
     * @param  Collection<int, ConsultationRequest>  $consultations
     */
    private function serializeTransaction(WalletTransaction $transaction, Collection $consultations): array
    {
        $consultation = $transaction->consultation_request_id ? $consultations->get($transaction->consultation_request_id) : null;

        return [
            'id' => $transaction->id,
            'date' => $transaction->created_at,
            'type' => $transaction->description,
            'kind' => $transaction->type,
            'amount' => $transaction->amount_minor / 100,
            'status' => $transaction->status,
            'consultation_request_id' => $consultation?->id,
            'consultation' => $consultation ? [
                'provider_name' => $consultation->doctor?->name ?? $consultation->operator?->name,
                'patient_name' => $consultation->patientProfile?->display_name,
                'scheduled_at' => $consultation->scheduled_at,
                'reservation_state' => match ($consultation->payment_status) {
                    'held' => 'reserved',
                    'captured' => 'paid',
                    'refunded' => 'refunded',
                    default => null,
                },
            ] : null,
        ];
    }

    public function topUp(Request $request): JsonResponse
    {
        abort_unless(app(FeatureFlags::class)->enabled('payments'), 403, 'Plățile sunt momentan dezactivate.');

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:10', 'max:50000'],
            'affiliate_code' => ['nullable', 'string', 'max:100'],
            // Doar căi interne ale pacientului: după plată se revine la programare.
            'return_to' => ['nullable', 'string', 'max:255', 'regex:#^/patient/[A-Za-z0-9/_\-]*(\?[A-Za-z0-9_\-=&%.]*)?$#'],
        ]);

        $user = $request->user();
        $wallet = $this->walletFor($user);
        $amount = round((float) $validated['amount'], 2);
        $amountMinor = (int) round($amount * 100);

        $payment = Payment::create([
            'user_id' => $user->id,
            'wallet_id' => $wallet->id,
            'amount_minor' => $amountMinor,
            'currency' => 'MDL',
            'purpose' => 'wallet_top_up',
            'status' => 'pending',
            'provider' => 'maib',
            'metadata' => array_filter([
                'source' => 'patient_wallet',
                'affiliate_code' => $validated['affiliate_code'] ?? null,
                'return_to' => $validated['return_to'] ?? null,
            ], fn ($value) => $value !== null),
        ]);

        $pay = app(MaibCheckout::class)->start($payment, $user, 'Alimentare portofel telemedconsult.md', $request->ip());

        if (! $pay) {
            return response()->json(['message' => 'Nu am putut iniția plata.'], 500);
        }

        return response()->json(['payment' => $payment->fresh(), 'pay' => $pay]);
    }

    public function callback(Request $request): JsonResponse
    {
        $payload = $request->all();
        $data = is_array($payload['result'] ?? null) ? $payload['result'] : $payload;
        $providerPaymentId = $data['payId'] ?? $data['pay_id'] ?? null;
        $payment = $providerPaymentId
            ? Payment::where('provider_payment_id', $providerPaymentId)->first()
            : null;

        if (! $payment && ! empty($data['orderId'])) {
            $payment = Payment::find($data['orderId']);
        }

        if ($payment) {
            $this->recordPaymentEvent($payment, 'maib.callback', $payload, $providerPaymentId);
        }

        $status = strtolower((string) ($data['status'] ?? (is_string($payload['result'] ?? null) ? $payload['result'] : '')));
        if ($payment && in_array($status, ['ok', 'paid', 'succeeded', 'success', 'approved'], true)) {
            if ($payment->status !== 'paid' && ! app(PaymentVerification::class)->settled($payment)) {
                return response()->json(['message' => 'Confirmarea plății trebuie reîncercată.'], 503);
            }
            $this->markPaymentPaid($payment);
        }

        return response()->json(['ok' => true]);
    }

    public function ok(Request $request): RedirectResponse
    {
        $payment = $this->resolvePaymentFromRequest($request);

        if ($payment) {
            $this->recordPaymentEvent($payment, 'maib.ok_redirect', $request->all(), $payment->provider_payment_id);
            if (app(PaymentVerification::class)->settled($payment)) {
                $this->markPaymentPaid($payment);
            }
        }

        return redirect()->away($this->returnUrl($payment, $payment?->fresh()->status === 'paid' ? 'ok' : 'pending'));
    }

    public function fail(Request $request): RedirectResponse
    {
        $payment = $this->resolvePaymentFromRequest($request);

        if ($payment && $payment->status === 'pending') {
            $this->recordPaymentEvent($payment, 'maib.fail_redirect', $request->all(), $payment->provider_payment_id);
            $payment->update(['status' => 'failed']);
        }

        return redirect()->away($this->returnUrl($payment, 'fail'));
    }

    private function markPaymentPaid(Payment $payment): void
    {
        DB::transaction(function () use ($payment) {
            $payment = Payment::lockForUpdate()->findOrFail($payment->id);

            if ($payment->status === 'paid') {
                return;
            }

            $wallet = Wallet::lockForUpdate()->findOrFail($payment->wallet_id);
            $wallet->increment('balance_minor', $payment->amount_minor);

            $payment->update([
                'status' => 'paid',
                'paid_at' => now(),
            ]);

            WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'user_id' => $payment->user_id,
                'amount_minor' => $payment->amount_minor,
                'currency' => $payment->currency,
                'type' => 'top_up',
                'status' => 'completed',
                'description' => 'Alimentare cont',
                'metadata' => ['payment_id' => $payment->id, 'provider_payment_id' => $payment->provider_payment_id],
            ]);

            $rate = min(100, max(0, app(PlatformConfig::class)->number('wallet.topup_bonus_percent', 0)));
            $bonusMinor = (int) round($payment->amount_minor * $rate / 100);
            if ($bonusMinor > 0 && $payment->purpose === 'wallet_top_up') {
                $ledger = app(WalletLedger::class);
                $bonusWallet = $ledger->locked($payment->user_id, WalletLedger::POINTS, $payment->currency);
                $transaction = $ledger->move($bonusWallet, $bonusMinor, 'topup_bonus', 'Bonus la alimentare '.$rate.'%', ['payment_id' => $payment->id, 'bonus_percent' => $rate]);
                $transaction->forceFill(['rate_snapshot' => ['wallet.topup_bonus_percent' => $rate]])->save();
            }

            // Afiliere pacient: procent din alimentare către cel care a invitat
            // utilizatorul prin linkul de referral. Legătura vine din tabela
            // `referrals`, nu din body-ul cererii.
            app(ReferralProgram::class)->creditTopUpCommission($payment);

            // Afiliere medic/operator: codul este transmis explicit la top-up.
            $this->creditAffiliateBonus($payment);
            app(FirstTopupPromotion::class)->credit($payment);

            // Checkout pachet: plata a alimentat portofelul; pachetul se cumpără
            // acum, în aceeași tranzacție. Un callback dublat iese mai sus (status paid).
            app(PatientCardPurchaser::class)->completeCheckout($payment);
        });
    }

    private function creditAffiliateBonus(Payment $payment): void
    {
        $code = $payment->metadata['affiliate_code'] ?? null;
        if (! $code) {
            return;
        }

        $doctorProfile = DoctorProfile::where('affiliate_code', $code)->first();
        $operatorProfile = $doctorProfile ? null : OperatorProfile::where('affiliate_code', $code)->first();
        $beneficiaryId = $doctorProfile?->user_id ?? $operatorProfile?->user_id;
        if (! $beneficiaryId || (int) $beneficiaryId === (int) $payment->user_id) {
            return;
        }

        $config = app(PlatformConfig::class);
        $rateKey = $doctorProfile ? 'rate.affiliate_doctor_topup' : 'rate.affiliate_operator';
        $rate = $config->number($rateKey, 0);
        $bonusMinor = (int) round($payment->amount_minor * ($rate / 100));
        if ($bonusMinor <= 0) {
            return;
        }

        $affiliateWallet = Wallet::firstOrCreate(
            ['user_id' => $beneficiaryId, 'type' => WalletLedger::POINTS],
            ['balance_minor' => 0, 'currency' => $payment->currency],
        );
        $affiliateWallet->increment('balance_minor', $bonusMinor);

        WalletTransaction::create([
            'wallet_id' => $affiliateWallet->id,
            'wallet_type' => WalletLedger::POINTS,
            'user_id' => $beneficiaryId,
            'amount_minor' => $bonusMinor,
            'currency' => $payment->currency,
            'type' => 'affiliate_bonus',
            'status' => 'completed',
            'description' => 'Bonus afiliere alimentare wallet',
            'metadata' => ['payment_id' => $payment->id, 'referred_user_id' => $payment->user_id],
            'rate_snapshot' => [$rateKey => $rate],
        ]);
    }

    private function resolvePaymentFromRequest(Request $request): ?Payment
    {
        $providerPaymentId = $request->input('payId') ?? $request->input('pay_id');

        if ($providerPaymentId) {
            $payment = Payment::where('provider_payment_id', $providerPaymentId)->first();

            if ($payment) {
                return $payment;
            }
        }

        $orderId = $request->input('orderId') ?? $request->input('order_id');

        return $orderId ? Payment::find($orderId) : null;
    }

    /**
     * Unde se întoarce utilizatorul de la MAIB: asistentul de pornire pentru checkout-ul de pachet,
     * pagina cerută la alimentare (`return_to`, validată la creare), altfel portofelul.
     */
    private function returnUrl(?Payment $payment, string $status): string
    {
        $metadata = $payment?->metadata ?? [];
        $path = match (true) {
            filled($metadata['buy_package_id'] ?? null) => '/patient/start',
            is_string($metadata['return_to'] ?? null) && str_starts_with($metadata['return_to'], '/patient/') => $metadata['return_to'],
            default => '/patient/wallet',
        };

        return rtrim((string) config('services.frontend_url'), '/').$path.(str_contains($path, '?') ? '&' : '?').'payment='.$status;
    }

    private function walletFor(User $user, string $type = WalletLedger::REAL): Wallet
    {
        return Wallet::firstOrCreate(
            ['user_id' => $user->id, 'type' => $type],
            ['balance_minor' => 0, 'currency' => 'MDL'],
        );
    }

    private function serializeWallet(Wallet $wallet): array
    {
        return [
            'id' => $wallet->id,
            'type' => $wallet->type,
            'balance' => $wallet->balance_minor / 100,
            'currency' => $wallet->currency,
        ];
    }

    private function recordPaymentEvent(?Payment $payment, string $eventType, array $payload, ?string $providerEventId = null): void
    {
        PaymentEvent::create([
            'payment_id' => $payment?->id,
            'provider_event_id' => $providerEventId,
            'event_type' => $eventType,
            'payload' => $payload,
            'received_at' => now(),
        ]);
    }
}
