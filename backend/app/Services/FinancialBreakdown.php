<?php

namespace App\Services;

use App\Models\User;

class FinancialBreakdown
{
    public function __construct(private readonly PlatformConfig $config) {}

    public function forAdditionalCash(int $cashMinor, User $provider, array $snapshot): array
    {
        if (! isset($snapshot['rate_snapshot']) || ! is_array($snapshot['rate_snapshot'])) {
            return $this->forProvider($cashMinor, $provider);
        }
        $remaining = $cashMinor;
        $deductions = [];
        foreach ($snapshot['rate_snapshot'] as $key => $rate) {
            $amount = (int) round($remaining * max(0, min(100, (float) $rate)) / 100);
            $remaining -= $amount;
            $deductions[$key] = ['rate' => $rate, 'amount_minor' => $amount];
        }

        return ['amount_minor' => $cashMinor, 'cash_base_minor' => $cashMinor, 'settlement_rule' => 'cash_received_v1', 'platform_fee_minor' => $cashMinor - $remaining, 'provider_amount_minor' => $remaining, 'deductions' => $deductions, 'rate_snapshot' => $snapshot['rate_snapshot'], 'institution_id' => $snapshot['institution_id'] ?? null, 'doctor_share_percent' => $snapshot['doctor_share_percent'] ?? null];
    }

    public function forProvider(int $grossMinor, User $provider, ?int $cashMinor = null): array
    {
        $cashMinor = max(0, min($grossMinor, $cashMinor ?? $grossMinor));
        $base = ['cash_base_minor' => $cashMinor, 'noncash_minor' => $grossMinor - $cashMinor, 'settlement_rule' => 'cash_received_v1'];
        $profile = $provider->doctorProfile;
        if ($profile?->medical_institution_id && $profile->medicalInstitution?->isActive()) {
            $fee = (int) round($cashMinor * 0.15);

            return [...$base,
                'amount_minor' => $grossMinor,
                'platform_fee_minor' => $fee,
                'provider_amount_minor' => $cashMinor - $fee,
                'deductions' => ['rate.platform_commission' => ['rate' => 15, 'amount_minor' => $fee]],
                'rate_snapshot' => ['rate.platform_commission' => 15],
                'operator_subscription' => false,
                'institution_id' => $profile->medical_institution_id,
                'doctor_share_percent' => $profile->effectiveInstitutionSharePercent(),
            ];
        }
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

        $remaining = $cashMinor;
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

        return [...$base,
            'amount_minor' => $grossMinor,
            'platform_fee_minor' => array_sum(array_column($deductions, 'amount_minor')),
            'provider_amount_minor' => $remaining,
            'deductions' => $deductions,
            'rate_snapshot' => $this->config->snapshot($rateKeys),
            'operator_subscription' => $isSubscriptionOperator,
            'institution_id' => null,
            'doctor_share_percent' => null,
        ];
    }
}
