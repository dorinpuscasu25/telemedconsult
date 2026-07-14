<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\FeatureFlags;
use App\Services\PlatformConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use MaibEcomm\MaibSdk\MaibApiRequest;
use MaibEcomm\MaibSdk\MaibAuthRequest;
use Throwable;

class WalletController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $wallet = $this->walletFor($request->user());

        return response()->json([
            'wallet' => $this->serializeWallet($wallet),
            'transactions' => $wallet->transactions()->latest()->limit(50)->get()->map(fn (WalletTransaction $transaction) => [
                'id' => $transaction->id,
                'date' => $transaction->created_at,
                'type' => $transaction->description,
                'amount' => $transaction->amount_minor / 100,
                'status' => $transaction->status,
            ]),
            'payments' => Payment::where('user_id', $request->user()->id)->latest()->limit(20)->get(),
        ]);
    }

    public function topUp(Request $request): JsonResponse
    {
        abort_unless(app(FeatureFlags::class)->enabled('payments'), 403, 'Plățile sunt momentan dezactivate.');

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:10', 'max:50000'],
            'affiliate_code' => ['nullable', 'string', 'max:100'],
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
            'metadata' => ['source' => 'patient_wallet', 'affiliate_code' => $validated['affiliate_code'] ?? null],
        ]);

        $auth = $this->maibAuth();

        if (! $auth) {
            $payment->update(['status' => 'failed', 'metadata' => ['error' => 'MAIB auth failed']]);

            return response()->json(['message' => 'Nu am putut iniția plata.'], 500);
        }

        $maibOrder = [
            'amount' => $amount,
            'currency' => 'MDL',
            'description' => 'Alimentare portofel telemedconsult.md',
            'language' => 'ro',
            'orderId' => (string) $payment->id,
            'email' => $user->email,
            'phone' => $user->phone ?? '',
            'clientName' => $user->name,
            'clientIp' => $request->ip() ?? '127.0.0.1',
            'delivery' => 0,
            'items' => [[
                'id' => (string) $payment->id,
                'name' => 'Alimentare portofel telemedconsult.md',
                'price' => $amount,
                'quantity' => 1,
            ]],
            'okUrl' => $this->paymentReturnUrl('MAIB_OK_URL', $payment),
            'callBackUrl' => $this->paymentReturnUrl('MAIB_CALLBACK_URL', $payment),
            'failUrl' => $this->paymentReturnUrl('MAIB_FAIL_URL', $payment),
        ];

        try {
            $pay = MaibApiRequest::create()->pay($maibOrder, $auth->accessToken);
        } catch (Throwable $e) {
            report($e);
            $payment->update(['status' => 'failed', 'metadata' => ['error' => $e->getMessage()]]);

            return response()->json(['message' => 'Nu am putut iniția plata.'], 500);
        }

        if (! $pay) {
            $payment->update(['status' => 'failed']);

            return response()->json(['message' => 'Procesatorul nu a întors date de plată.'], 500);
        }

        $payment->update([
            'provider_payment_id' => $pay->payId ?? null,
            'metadata' => [
                'source' => 'patient_wallet',
                'pay_url' => $pay->payUrl ?? null,
                'affiliate_code' => $validated['affiliate_code'] ?? null,
            ],
        ]);

        $this->recordPaymentEvent($payment, 'maib.payment_initialized', [
            'payment_id' => $payment->id,
            'raw' => $pay,
        ], $pay->payId ?? null);

        return response()->json(['payment' => $payment->fresh(), 'pay' => $pay]);
    }

    public function callback(Request $request): JsonResponse
    {
        $payload = $request->all();
        $providerPaymentId = $payload['payId'] ?? $payload['pay_id'] ?? null;
        $payment = $providerPaymentId
            ? Payment::where('provider_payment_id', $providerPaymentId)->first()
            : null;

        if (! $payment && $request->filled('orderId')) {
            $payment = Payment::find($request->input('orderId'));
        }

        if ($payment) {
            $this->recordPaymentEvent($payment, 'maib.callback', $payload, $providerPaymentId);
        }

        $status = strtolower((string) ($payload['status'] ?? $payload['result'] ?? ''));
        if ($payment && in_array($status, ['ok', 'paid', 'succeeded', 'success', 'approved'], true)) {
            $this->markPaymentPaid($payment);
        }

        return response()->json(['ok' => true]);
    }

    public function ok(Request $request): RedirectResponse
    {
        $payment = $this->resolvePaymentFromRequest($request);

        if ($payment) {
            $this->recordPaymentEvent($payment, 'maib.ok_redirect', $request->all(), $payment->provider_payment_id);
            $this->markPaymentPaid($payment);
        }

        return redirect()->away(rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/').'/patient/wallet?payment=ok');
    }

    public function fail(Request $request): RedirectResponse
    {
        $payment = $this->resolvePaymentFromRequest($request);

        if ($payment && $payment->status === 'pending') {
            $this->recordPaymentEvent($payment, 'maib.fail_redirect', $request->all(), $payment->provider_payment_id);
            $payment->update(['status' => 'failed']);
        }

        return redirect()->away(rtrim((string) env('FRONTEND_URL', 'http://localhost:5173'), '/').'/patient/wallet?payment=fail');
    }

    private function maibAuth(): false|object
    {
        $projectId = env('MAIB_PROJECT_ID');
        $projectSecret = env('MAIB_PROJECT_SECRET');

        if (! $projectId || ! $projectSecret) {
            return false;
        }

        try {
            return MaibAuthRequest::create()->generateToken($projectId, $projectSecret);
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }

    private function markPaymentPaid(Payment $payment): void
    {
        DB::transaction(function () use ($payment) {
            $payment->refresh();

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

            $this->creditAffiliateBonus($payment);
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
            ['user_id' => $beneficiaryId],
            ['balance_minor' => 0, 'currency' => $payment->currency],
        );
        $affiliateWallet->increment('balance_minor', $bonusMinor);

        WalletTransaction::create([
            'wallet_id' => $affiliateWallet->id,
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

    private function paymentReturnUrl(string $envKey, Payment $payment): ?string
    {
        $url = env($envKey);

        if (! $url) {
            return null;
        }

        $separator = str_contains($url, '?') ? '&' : '?';

        return $url.$separator.'orderId='.$payment->id;
    }

    private function walletFor(User $user): Wallet
    {
        return Wallet::firstOrCreate(
            ['user_id' => $user->id],
            ['balance_minor' => 0, 'currency' => 'MDL'],
        );
    }

    private function serializeWallet(Wallet $wallet): array
    {
        return [
            'id' => $wallet->id,
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
