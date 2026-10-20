<?php

namespace App\Services;

use App\Models\FirstTopupPromotionGrant;
use App\Models\Payment;
use App\Models\User;
use App\Models\Wallet;

class FirstTopupPromotion
{
    public const AMOUNT_MINOR = 50000;

    public const MINIMUM_DEPOSIT_MINOR = 50000;

    public const MAX_PAYMENT_PERCENT = 50;

    public function __construct(private PlatformConfig $config, private WalletLedger $ledger) {}

    public function configuredDoctorIds(): array
    {
        $ids = $this->config->get('wallet.first_topup_promo_doctor_ids', []);

        return User::whereIn('id', is_array($ids) ? $ids : [])->whereHas('doctorProfile', fn ($query) => $query->where('is_approved', true))->whereHas('roles', fn ($query) => $query->where('name', 'doctor'))->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function credit(Payment $payment): ?FirstTopupPromotionGrant
    {
        if ($payment->status !== 'paid' || $payment->purpose !== 'wallet_top_up' || $payment->currency !== 'MDL' || $payment->amount_minor < self::MINIMUM_DEPOSIT_MINOR || ! $this->config->bool('wallet.first_topup_promo_enabled') || ! User::find($payment->user_id)?->hasRole('patient')) {
            return null;
        }
        $doctorIds = $this->configuredDoctorIds();
        if (! $doctorIds || FirstTopupPromotionGrant::where('user_id', $payment->user_id)->exists()
            || Payment::where('user_id', $payment->user_id)->where('purpose', 'wallet_top_up')->where('status', 'paid')->whereKeyNot($payment->id)->exists()) {
            return null;
        }
        $wallet = $this->ledger->locked($payment->user_id, WalletLedger::PROMO);
        $grant = FirstTopupPromotionGrant::create([
            'user_id' => $payment->user_id, 'payment_id' => $payment->id, 'amount_minor' => self::AMOUNT_MINOR,
            'minimum_deposit_minor' => self::MINIMUM_DEPOSIT_MINOR, 'max_payment_percent' => self::MAX_PAYMENT_PERCENT, 'doctor_ids' => $doctorIds,
        ]);
        $this->ledger->move($wallet, self::AMOUNT_MINOR, 'first_topup_promotion', 'Bonus promoțional la prima alimentare', ['payment_id' => $payment->id, 'promo_grant_id' => $grant->id, 'doctor_ids' => $doctorIds, 'max_payment_percent' => self::MAX_PAYMENT_PERCENT]);

        return $grant;
    }

    public function grantForDoctor(int $userId, ?int $doctorId, bool $lock = false): ?FirstTopupPromotionGrant
    {
        $grant = FirstTopupPromotionGrant::where('user_id', $userId)->when($lock, fn ($query) => $query->lockForUpdate())->first();

        return $grant && $doctorId && in_array($doctorId, $grant->doctor_ids, true) ? $grant : null;
    }

    public function describe(int $userId): array
    {
        $grant = FirstTopupPromotionGrant::where('user_id', $userId)->first();
        $doctorIds = $grant?->doctor_ids ?? $this->configuredDoctorIds();
        $enabled = $this->config->bool('wallet.first_topup_promo_enabled') && count($doctorIds) > 0;

        return [
            'enabled' => $enabled, 'minimum_deposit' => self::MINIMUM_DEPOSIT_MINOR / 100, 'bonus_amount' => self::AMOUNT_MINOR / 100,
            'max_payment_percent' => $grant?->max_payment_percent ?? self::MAX_PAYMENT_PERCENT,
            'doctor_ids' => $doctorIds, 'doctors' => User::whereIn('id', $doctorIds)->get(['id', 'name'])->toArray(),
            'eligible_for_grant' => $enabled && ! $grant && (bool) User::find($userId)?->hasRole('patient') && ! Payment::where('user_id', $userId)->where('purpose', 'wallet_top_up')->where('status', 'paid')->exists(),
            'grant' => $grant ? ['id' => $grant->id, 'doctor_ids' => $grant->doctor_ids, 'max_payment_percent' => $grant->max_payment_percent] : null,
        ];
    }

    public function availableBalance(int $userId): int
    {
        return (int) Wallet::where('user_id', $userId)->where('type', WalletLedger::PROMO)->value('balance_minor');
    }

    public function split(int $userId, ?User $doctor, int $totalMinor, int $doctorBaseMinor, int $requestedPointsPercent = 0, bool $lock = false): array
    {
        $grant = $this->grantForDoctor($userId, $doctor?->id, $lock);
        $cap = $grant ? (int) floor($doctorBaseMinor * $grant->max_payment_percent / 100) : 0;
        $promoMinor = $grant ? min($this->availableBalance($userId), $cap, $totalMinor) : 0;
        $maxPointsPercent = (int) min(100, max(0, $this->config->number('wallet.max_points_payment_percent', 30)));
        $pointsPercent = $doctor?->doctorProfile?->accepts_points ? min($requestedPointsPercent, $maxPointsPercent) : 0;
        $pointsMinor = (int) floor($totalMinor * $pointsPercent / 100);
        if ($grant) {
            $pointsMinor = min($pointsMinor, max(0, $cap - $promoMinor));
        }

        return [
            'total' => $totalMinor / 100, 'real_amount' => ($totalMinor - $promoMinor - $pointsMinor) / 100,
            'points_amount' => $pointsMinor / 100, 'promo_amount' => $promoMinor / 100,
            'promo_eligible' => (bool) $grant, 'max_points_percent' => $maxPointsPercent,
            'promo_max_payment_percent' => $grant?->max_payment_percent ?? self::MAX_PAYMENT_PERCENT,
            'doctor_base' => $doctorBaseMinor / 100, 'promo_grant_id' => $grant?->id,
        ];
    }
}
