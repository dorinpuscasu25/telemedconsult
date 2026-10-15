<?php

namespace App\Services;

use App\Models\Payment;
use MaibEcomm\MaibSdk\MaibApiRequest;
use MaibEcomm\MaibSdk\MaibAuthRequest;
use Throwable;

class PaymentVerification
{
    public function settled(Payment $payment): bool
    {
        if (! $payment->provider_payment_id || ! config('services.maib.project_id') || ! config('services.maib.project_secret')) {
            return false;
        }
        try {
            $auth = MaibAuthRequest::create()->generateToken(config('services.maib.project_id'), config('services.maib.project_secret'));
            if (! $auth) {
                return false;
            }
            $info = MaibApiRequest::create()->payInfo($payment->provider_payment_id, $auth->accessToken);

            return $info && strtoupper((string) ($info->status ?? '')) === 'OK'
                && (string) ($info->payId ?? '') === (string) $payment->provider_payment_id
                && (string) ($info->orderId ?? '') === (string) $payment->id
                && (int) round((float) ($info->amount ?? 0) * 100) === (int) $payment->amount_minor
                && strtoupper((string) ($info->currency ?? '')) === $payment->currency;
        } catch (Throwable $exception) {
            report($exception);

            return false;
        }
    }
}
