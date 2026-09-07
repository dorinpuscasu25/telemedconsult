<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\Referral;
use App\Models\ReferralCommission;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\WalletLedger;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Programul de afiliere.
 *
 * Regula de business: invitatorul primește un PROCENT (configurabil de admin)
 * din fiecare sumă alimentată în portofel de utilizatorul invitat. Comisionul se
 * acordă doar la plată confirmată — nu la înregistrare și nu la confirmarea
 * emailului.
 */
class ReferralProgram
{
    /** Procentul din alimentare care merge către invitator. */
    public const RATE_SETTING = 'rate.affiliate_patient_topup';

    /** Alimentările sub această sumă (MDL) nu generează comision. */
    public const MIN_AMOUNT_SETTING = 'affiliate.patient_topup_min_amount';

    /** true = doar prima alimentare este comisionată. */
    public const FIRST_ONLY_SETTING = 'affiliate.patient_topup_first_only';

    public const RULES_SETTING = 'affiliate.patient_registration_rules';

    public function __construct(
        private readonly PlatformConfig $config,
        private readonly FeatureFlags $features,
    ) {}

    public function enabled(): bool
    {
        return $this->features->enabled('affiliate_program');
    }

    /** Procentul curent, limitat la intervalul 0–100. */
    public function ratePercent(): float
    {
        return max(0.0, min(100.0, $this->config->number(self::RATE_SETTING, 0)));
    }

    /** Suma minimă (în MDL) a unei alimentări eligibile. */
    public function minimumAmount(): float
    {
        return max(0.0, $this->config->number(self::MIN_AMOUNT_SETTING, 0));
    }

    public function firstDepositOnly(): bool
    {
        return $this->config->bool(self::FIRST_ONLY_SETTING, false);
    }

    public function rules(): ?string
    {
        $rules = $this->config->get(self::RULES_SETTING);

        return is_string($rules) ? $rules : null;
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

    /**
     * Leagă un utilizator nou-înregistrat de invitatorul său.
     *
     * Nu se rezervă și nu se plătește nicio sumă aici — legătura este doar
     * înregistrată, iar plata are loc la alimentarea confirmată.
     */
    public function attachPatient(User $referredUser, ?string $code): ?Referral
    {
        if (! $this->enabled() || blank($code)) {
            return null;
        }

        $referrer = User::where('referral_code', Str::upper(trim((string) $code)))->first();

        if (! $referrer || $referrer->is($referredUser)) {
            return null;
        }

        try {
            return Referral::create([
                'referrer_id' => $referrer->id,
                'referred_user_id' => $referredUser->id,
                'reward_amount_minor' => 0,
                'currency' => 'MDL',
                'status' => Referral::STATUS_PENDING,
            ]);
        } catch (QueryException $exception) {
            // `referred_user_id` este unique: dacă legătura există deja, o
            // returnăm în loc să blocăm înregistrarea.
            if (! $this->isUniqueConstraintViolation($exception)) {
                throw $exception;
            }

            return Referral::where('referred_user_id', $referredUser->id)->first();
        }
    }

    /**
     * Creditează invitatorul cu procentul configurat din alimentarea confirmată.
     *
     * Trebuie apelată DUPĂ ce plata a fost marcată `paid`, din interiorul
     * aceleiași tranzacții de bază de date.
     */
    public function creditTopUpCommission(Payment $payment): ?ReferralCommission
    {
        if (! $this->enabled()) {
            return null;
        }

        $referral = Referral::where('referred_user_id', $payment->user_id)
            ->lockForUpdate()
            ->first();

        if (! $referral || (int) $referral->referrer_id === (int) $payment->user_id) {
            return null;
        }

        // Idempotență: dacă alimentarea a fost deja comisionată (callback MAIB
        // repetat, sau ok-redirect sosit după callback), nu plătim a doua oară.
        if (ReferralCommission::where('payment_id', $payment->id)->exists()) {
            return null;
        }

        if ($this->firstDepositOnly()
            && ReferralCommission::where('referred_user_id', $payment->user_id)->exists()) {
            return null;
        }

        $depositMinor = (int) $payment->amount_minor;
        $minimumMinor = (int) round($this->minimumAmount() * 100);

        if ($depositMinor < $minimumMinor || $depositMinor <= 0) {
            return null;
        }

        $rate = $this->ratePercent();
        $commissionMinor = (int) round($depositMinor * $rate / 100);

        if ($commissionMinor <= 0) {
            return null;
        }

        $currency = $payment->currency ?: 'MDL';
        $wallet = $this->lockedWallet((int) $referral->referrer_id, $currency);
        $wallet->increment('balance_minor', $commissionMinor);

        $transaction = WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'wallet_type' => WalletLedger::POINTS,
            'user_id' => $referral->referrer_id,
            'amount_minor' => $commissionMinor,
            'currency' => $currency,
            'type' => 'referral_topup_commission',
            'status' => 'completed',
            'description' => 'Comision afiliere din alimentare',
            'metadata' => [
                'referral_id' => $referral->id,
                'referred_user_id' => $payment->user_id,
                'payment_id' => $payment->id,
                'deposit_amount' => $depositMinor / 100,
                'source' => 'patient_topup_referral',
            ],
            'rate_snapshot' => [self::RATE_SETTING => $rate],
        ]);

        $commission = ReferralCommission::create([
            'referral_id' => $referral->id,
            'referrer_id' => $referral->referrer_id,
            'referred_user_id' => $payment->user_id,
            'payment_id' => $payment->id,
            'wallet_transaction_id' => $transaction->id,
            'deposit_amount_minor' => $depositMinor,
            'commission_amount_minor' => $commissionMinor,
            'rate_percent' => $rate,
            'currency' => $currency,
        ]);

        // `reward_amount_minor` devine totalul cumulat câștigat din acest
        // referral, ca panoul de afiliere să nu recalculeze la fiecare cerere.
        $referral->forceFill([
            'status' => Referral::STATUS_REWARDED,
            'reward_amount_minor' => (int) $referral->reward_amount_minor + $commissionMinor,
            'rewarded_at' => now(),
        ])->save();

        Log::info('Comision afiliere acordat', [
            'referral_id' => $referral->id,
            'payment_id' => $payment->id,
            'rate_percent' => $rate,
            'commission_minor' => $commissionMinor,
        ]);

        return $commission;
    }

    private function lockedWallet(int $userId, string $currency): Wallet
    {
        $wallet = Wallet::where('user_id', $userId)->where('type', WalletLedger::POINTS)->lockForUpdate()->first();

        if ($wallet) {
            return $wallet;
        }

        try {
            Wallet::create([
                'user_id' => $userId,
                'type' => WalletLedger::POINTS,
                'balance_minor' => 0,
                'currency' => $currency,
            ]);
        } catch (QueryException $exception) {
            if (! $this->isUniqueConstraintViolation($exception)) {
                throw $exception;
            }
        }

        return Wallet::where('user_id', $userId)->where('type', WalletLedger::POINTS)->lockForUpdate()->firstOrFail();
    }

    private function isUniqueConstraintViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), ['19', '23000', '23505'], true);
    }
}
