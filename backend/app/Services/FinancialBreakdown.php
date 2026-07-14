<?php

namespace App\Services;

use App\Models\User;

class FinancialBreakdown
{
    public function __construct(private readonly PlatformConfig $config) {}

    public function forProvider(int $grossMinor, User $provider): array
    {
        $isSubscriptionOperator = $provider->operatorProfile?->has_device_subscription === true;
        $rateKeys = $isSubscriptionOperator
            ? [
                'rate.operator_subscription_admin',
                'rate.operator_subscription_bank_guarantee',
                'rate.operator_subscription_bank_transaction',
            ]
            : [
                'rate.platform_commission',
                'rate.admin_accounting',
                'rate.bank_guarantee',
                'rate.bank_transaction',
            ];

        $remaining = $grossMinor;
        $deductions = [];

        foreach ($rateKeys as $key) {
            $rate = $this->config->number($key);
            $amount = (int) round($remaining * ($rate / 100));
            $remaining = max(0, $remaining - $amount);
            $deductions[$key] = [
                'rate' => $rate,
                'amount_minor' => $amount,
            ];
        }

        return [
            'amount_minor' => $grossMinor,
            'platform_fee_minor' => array_sum(array_column($deductions, 'amount_minor')),
            'provider_amount_minor' => $remaining,
            'deductions' => $deductions,
            'rate_snapshot' => $this->config->snapshot($rateKeys),
            'operator_subscription' => $isSubscriptionOperator,
        ];
    }
}
