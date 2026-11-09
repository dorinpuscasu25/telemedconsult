<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\User;
use MaibEcomm\MaibSdk\MaibApiRequest;
use MaibEcomm\MaibSdk\MaibAuthRequest;
use Throwable;

/**
 * Inițiază o plată MAIB pentru un `Payment` deja creat și întoarce linkul de plată.
 *
 * Separat de controller ca să poată fi înlocuit în teste. Metadata plății se
 * completează, nu se suprascrie, ca să rămână ce a pus apelantul (ex. pachetul cerut).
 *
 * @phpstan-type PayResult object{payId?: string, payUrl?: string}
 */
class MaibCheckout
{
    /**
     * @return object|null Răspunsul MAIB (`payId`, `payUrl`) sau null dacă plata nu a putut fi inițiată.
     */
    public function start(Payment $payment, User $user, string $description, ?string $clientIp): ?object
    {
        $auth = $this->auth();

        if (! $auth) {
            $this->fail($payment, 'MAIB auth failed');

            return null;
        }

        $amount = $payment->amount_minor / 100;
        $order = [
            'amount' => $amount,
            'currency' => $payment->currency,
            'description' => $description,
            'language' => 'ro',
            'orderId' => (string) $payment->id,
            'email' => $user->email,
            'phone' => $user->phone ?? '',
            'clientName' => $user->name,
            'clientIp' => $clientIp ?? '127.0.0.1',
            'delivery' => 0,
            'items' => [[
                'id' => (string) $payment->id,
                'name' => $description,
                'price' => $amount,
                'quantity' => 1,
            ]],
            'okUrl' => $this->returnUrl('ok_url', $payment),
            'callBackUrl' => $this->returnUrl('callback_url', $payment),
            'failUrl' => $this->returnUrl('fail_url', $payment),
        ];

        try {
            $pay = MaibApiRequest::create()->pay($order, $auth->accessToken);
        } catch (Throwable $e) {
            report($e);
            $this->fail($payment, $e->getMessage());

            return null;
        }

        if (! $pay) {
            $this->fail($payment, 'empty response');

            return null;
        }

        $payment->update([
            'provider_payment_id' => $pay->payId ?? null,
            'metadata' => [...($payment->metadata ?? []), 'pay_url' => $pay->payUrl ?? null],
        ]);

        PaymentEvent::create([
            'payment_id' => $payment->id,
            'provider_event_id' => $pay->payId ?? null,
            'event_type' => 'maib.payment_initialized',
            'payload' => ['payment_id' => $payment->id, 'raw' => $pay],
            'received_at' => now(),
        ]);

        return $pay;
    }

    private function fail(Payment $payment, string $error): void
    {
        $payment->update(['status' => 'failed', 'metadata' => [...($payment->metadata ?? []), 'error' => $error]]);
    }

    private function auth(): false|object
    {
        $projectId = config('services.maib.project_id');
        $projectSecret = config('services.maib.project_secret');

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

    private function returnUrl(string $key, Payment $payment): ?string
    {
        $url = config('services.maib.'.$key);

        if (! $url) {
            return null;
        }

        $separator = str_contains($url, '?') ? '&' : '?';

        return $url.$separator.'orderId='.$payment->id;
    }
}
