<?php

namespace App\Services;

use App\Models\PlatformSetting;
use App\Models\PlatformSettingVersion;
use Illuminate\Support\Facades\DB;

class PlatformConfig
{
    public const DEFAULTS = [
        'platform_name' => ['value' => 'telemedconsult.md', 'group' => 'general', 'type' => 'string'],
        'support_email' => ['value' => 'suport@telemedconsult.md', 'group' => 'general', 'type' => 'string'],
        'rate.platform_commission' => ['value' => 30, 'group' => 'commissions', 'type' => 'number'],
        'rate.admin_accounting' => ['value' => 1.5, 'group' => 'commissions', 'type' => 'number'],
        'rate.bank_guarantee' => ['value' => 5.5, 'group' => 'commissions', 'type' => 'number'],
        'rate.bank_transaction' => ['value' => 3.2, 'group' => 'commissions', 'type' => 'number'],
        'rate.operator_subscription_admin' => ['value' => 1.5, 'group' => 'commissions', 'type' => 'number'],
        'rate.operator_subscription_bank_guarantee' => ['value' => 5.5, 'group' => 'commissions', 'type' => 'number'],
        'rate.operator_subscription_bank_transaction' => ['value' => 3.2, 'group' => 'commissions', 'type' => 'number'],
        'rate.affiliate_doctor_topup' => ['value' => 5, 'group' => 'affiliate', 'type' => 'number'],
        'rate.affiliate_operator' => ['value' => 6, 'group' => 'affiliate', 'type' => 'number'],
        'affiliate.patient_registration_reward' => ['value' => 0, 'group' => 'affiliate', 'type' => 'number'],
        'affiliate.patient_registration_rules' => [
            'value' => 'Invită o persoană folosind linkul tău personal. Bonusul afișat se rezervă la înregistrare și intră în portofelul tău după ce noul pacient își confirmă emailul. Se acordă un singur bonus pentru fiecare pacient nou. Conturile proprii, duplicate sau frauduloase nu sunt eligibile. Bonusul este credit de platformă și poate fi folosit pentru serviciile disponibile pe telemedconsult.md.',
            'group' => 'affiliate',
            'type' => 'string',
        ],
        'minimum_consultation_price' => ['value' => 500, 'group' => 'financial', 'type' => 'number'],
        'operator_exam_price' => ['value' => 250, 'group' => 'financial', 'type' => 'number'],
        'chat.free_days' => ['value' => 3, 'group' => 'chat', 'type' => 'number'],
        'chat.reactivation_price' => ['value' => 50, 'group' => 'chat', 'type' => 'number'],
        'chat.reactivation_hours' => ['value' => 24, 'group' => 'chat', 'type' => 'number'],
        'chat.total_days' => ['value' => 14, 'group' => 'chat', 'type' => 'number'],
        'video.default_price' => ['value' => 300, 'group' => 'video', 'type' => 'number'],
        'video.default_duration_minutes' => ['value' => 15, 'group' => 'video', 'type' => 'number'],
        'payout.request_day_start' => ['value' => 1, 'group' => 'payout', 'type' => 'number'],
        'payout.request_day_end' => ['value' => 10, 'group' => 'payout', 'type' => 'number'],
        'post_consultation_window_hours' => ['value' => 72, 'group' => 'consultations', 'type' => 'number'],
        'assignment.acceptance_window_minutes' => ['value' => 15, 'group' => 'consultations', 'type' => 'number'],
        'auth.email_2fa_enabled' => ['value' => true, 'group' => 'security', 'type' => 'boolean'],
        'notify_new_doctors' => ['value' => true, 'group' => 'notifications', 'type' => 'boolean'],
        'notify_complaints' => ['value' => true, 'group' => 'notifications', 'type' => 'boolean'],
        'notify_withdrawals' => ['value' => true, 'group' => 'notifications', 'type' => 'boolean'],
    ];

    public function get(string $key, mixed $default = null): mixed
    {
        $setting = PlatformSetting::where('key', $key)->first();

        if ($setting) {
            return $setting->value;
        }

        return self::DEFAULTS[$key]['value'] ?? $default;
    }

    public function number(string $key, float|int $default = 0): float
    {
        return (float) $this->get($key, $default);
    }

    public function bool(string $key, bool $default = false): bool
    {
        $value = $this->get($key, $default);

        return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }

    public function snapshot(array $keys): array
    {
        return collect($keys)
            ->mapWithKeys(fn (string $key) => [$key => $this->get($key)])
            ->all();
    }

    public function upsert(string $key, mixed $value, ?string $group = null, ?string $type = null, ?int $updatedBy = null): PlatformSetting
    {
        $default = self::DEFAULTS[$key] ?? null;
        $group ??= $default['group'] ?? 'general';
        $type ??= $default['type'] ?? $this->inferType($value);

        return DB::transaction(function () use ($key, $value, $group, $type, $updatedBy) {
            $setting = PlatformSetting::updateOrCreate(
                ['key' => $key],
                [
                    'value' => $value,
                    'group' => $group,
                    'type' => $type,
                    'effective_from' => now(),
                    'updated_by' => $updatedBy,
                ],
            );

            PlatformSettingVersion::create([
                'key' => $key,
                'value' => $value,
                'group' => $group,
                'type' => $type,
                'effective_from' => $setting->effective_from,
                'updated_by' => $updatedBy,
            ]);

            return $setting;
        });
    }

    private function inferType(mixed $value): string
    {
        return match (true) {
            is_bool($value) => 'boolean',
            is_numeric($value) => 'number',
            is_array($value) => 'json',
            default => 'string',
        };
    }
}
