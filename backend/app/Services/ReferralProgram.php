<?php

namespace App\Services;

use App\Models\Referral;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class ReferralProgram
{
    public const REWARD_SETTING = 'affiliate.patient_registration_reward';

    public const RULES_SETTING = 'affiliate.patient_registration_rules';

    public function __construct(
        private readonly PlatformConfig $config,
        private readonly FeatureFlags $features,
    ) {}

    public function enabled(): bool
    {
        return $this->features->enabled('affiliate_program');
    }

    public function ensureCode(User $user): string
    {
        if ($user->referral_code) {
            return $user->referral_code;
        }

        for ($attempt = 0; $attempt < 10; $attempt++) {
            try {
                $code = Str::upper(Str::random(16));

                User::whereKey($user->id)
                    ->whereNull('referral_code')
                    ->update(['referral_code' => $code]);

                $storedCode = User::whereKey($user->id)->value('referral_code');

                if ($storedCode) {
                    $user->forceFill(['referral_code' => $storedCode]);

                    return $storedCode;
                }
            } catch (QueryException $exception) {
                if (! $this->isUniqueConstraintViolation($exception)) {
                    throw $exception;
                }
            }
        }

        throw new RuntimeException('Nu am putut genera codul unic de afiliere.');
    }

    public function attachPatient(User $referredUser, ?string $code): ?Referral
    {
        if (! $this->enabled() || blank($code)) {
            return null;
        }

        $referrer = User::where('referral_code', Str::upper(trim((string) $code)))->first();

        if (! $referrer || $referrer->is($referredUser)) {
            return null;
        }

        $rewardAmountMinor = (int) round(max(0, $this->config->number(self::REWARD_SETTING, 0)) * 100);

        return Referral::create([
            'referrer_id' => $referrer->id,
            'referred_user_id' => $referredUser->id,
            'reward_amount_minor' => $rewardAmountMinor,
            'currency' => 'MDL',
            'status' => Referral::STATUS_PENDING,
        ]);
    }

    public function rewardVerifiedPatient(User $referredUser): ?Referral
    {
        return DB::transaction(function () use ($referredUser) {
            $referral = Referral::where('referred_user_id', $referredUser->id)
                ->lockForUpdate()
                ->first();

            if (! $referral || $referral->status !== Referral::STATUS_PENDING) {
                return $referral;
            }

            if (! $this->enabled() || ! $referredUser->email_verified_at || $referral->reward_amount_minor <= 0) {
                $referral->forceFill([
                    'status' => Referral::STATUS_INELIGIBLE,
                    'rewarded_at' => now(),
                ])->save();

                return $referral;
            }

            $wallet = $this->lockedWallet($referral->referrer_id, $referral->currency);
            $wallet->increment('balance_minor', $referral->reward_amount_minor);

            WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'user_id' => $referral->referrer_id,
                'referral_id' => $referral->id,
                'amount_minor' => $referral->reward_amount_minor,
                'currency' => $referral->currency,
                'type' => 'patient_referral_bonus',
                'status' => 'completed',
                'description' => 'Bonus afiliere pentru pacient verificat',
                'metadata' => [
                    'referred_user_id' => $referredUser->id,
                    'source' => 'patient_registration_referral',
                ],
                'rate_snapshot' => [
                    self::REWARD_SETTING => $referral->reward_amount_minor / 100,
                ],
            ]);

            $referral->forceFill([
                'status' => Referral::STATUS_REWARDED,
                'rewarded_at' => now(),
            ])->save();

            return $referral;
        });
    }

    private function lockedWallet(int $userId, string $currency): Wallet
    {
        $wallet = Wallet::where('user_id', $userId)->lockForUpdate()->first();

        if ($wallet) {
            return $wallet;
        }

        try {
            Wallet::create([
                'user_id' => $userId,
                'balance_minor' => 0,
                'currency' => $currency,
            ]);
        } catch (QueryException $exception) {
            if (! $this->isUniqueConstraintViolation($exception)) {
                throw $exception;
            }
        }

        return Wallet::where('user_id', $userId)->lockForUpdate()->firstOrFail();
    }

    private function isUniqueConstraintViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), ['19', '23000', '23505'], true);
    }
}
