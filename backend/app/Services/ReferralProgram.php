<?php

namespace App\Services;

use App\Models\OperatorProfile;
use App\Models\Payment;
use App\Models\Referral;
use App\Models\ReferralCommission;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Programul de afiliere.
 *
 * Regula de business: invitatorul primește un PROCENT (configurabil de admin)
 * din prima sumă efectiv alimentată în portofel de utilizatorul invitat. Comisionul se
 * acordă doar la plată confirmată — nu la înregistrare și nu la confirmarea
 * emailului.
 */
class ReferralProgram
{
    /** Procentul din alimentare care merge către invitator. */
    public const RATE_SETTING = 'rate.affiliate_patient_topup';

    public const DOCTOR_RATE_SETTING = 'rate.affiliate_doctor_topup';

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
    public function ratePercent(?User $referrer = null): float
    {
        $doctor = $referrer && $referrer->hasRole('doctor') && ! $referrer->hasRole('operator');

        return max(0.0, min(100.0, $this->config->number($doctor ? self::DOCTOR_RATE_SETTING : self::RATE_SETTING, $doctor ? 10 : 0)));
    }

    /** Suma minimă (în MDL) a unei alimentări eligibile. */
    public function minimumAmount(): float
    {
        return max(0.0, $this->config->number(self::MIN_AMOUNT_SETTING, 0));
    }

    public function firstDepositOnly(): bool
    {
        return true;
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

    public function referrerFor(?string $code): ?User
    {
        return blank($code) ? null : User::where('referral_code', Str::upper(trim((string) $code)))->first();
    }

    /**
     * Linkul unui operator ține evidența pacienților aduși chiar și când
     * programul de bonusuri e oprit: după ea se plătesc operatorii. Ceilalți
     * invitatori (pacienți, medici) au nevoie de programul pornit.
     */
    public function acceptsReferrer(User $referrer): bool
    {
        return $this->enabled() || $referrer->loadMissing('roles')->hasRole('operator');
    }

    /**
     * Leagă un utilizator nou-înregistrat de invitatorul său.
     *
     * Nu se rezervă și nu se plătește nicio sumă aici — legătura este doar
     * înregistrată, iar plata are loc la alimentarea confirmată.
     */
    public function attachPatient(User $referredUser, ?string $code): ?Referral
    {
        $referrer = $this->referrerFor($code);

        if (! $referrer || $referrer->is($referredUser) || ! $this->acceptsReferrer($referrer)) {
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
        if (! $this->enabled() || $payment->status !== 'paid' || $payment->purpose !== 'wallet_top_up' || $payment->currency !== 'MDL') {
            return null;
        }
        if (! Referral::where('referred_user_id', $payment->user_id)->exists() && filled($payment->metadata['affiliate_code'] ?? null)) {
            $operator = OperatorProfile::where('affiliate_code', $payment->metadata['affiliate_code'])->first()?->user;
            if ($operator && $operator->hasRole('operator') && $operator->id !== $payment->user_id) {
                Referral::firstOrCreate(['referred_user_id' => $payment->user_id], ['referrer_id' => $operator->id, 'reward_amount_minor' => 0, 'currency' => 'MDL', 'status' => Referral::STATUS_PENDING]);
            }
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

        if (ReferralCommission::where('referred_user_id', $payment->user_id)->exists()
            || Payment::where('user_id', $payment->user_id)->where('purpose', 'wallet_top_up')->where('status', 'paid')->whereKeyNot($payment->id)
                ->get()->contains(fn (Payment $other) => $this->depositMinor($other) > 0)) {
            return null;
        }

        $depositMinor = $this->depositMinor($payment);
        $minimumMinor = (int) round($this->minimumAmount() * 100);

        if ($depositMinor < $minimumMinor || $depositMinor <= 0) {
            return null;
        }

        $referrer = User::with('roles')->find($referral->referrer_id);
        $walletType = $referrer ? $this->rewardWalletType($referrer) : null;
        if (! $walletType) {
            return null;
        }
        $rate = $this->ratePercent($referrer);
        $commissionMinor = (int) round($depositMinor * $rate / 100);

        if ($commissionMinor <= 0) {
            return null;
        }

        $currency = $payment->currency ?: 'MDL';
        $wallet = app(WalletLedger::class)->locked((int) $referral->referrer_id, $walletType, $currency);
        $wallet->increment('balance_minor', $commissionMinor);

        $transaction = WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'wallet_type' => $walletType,
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
                'source' => 'first_actual_topup_referral',
                'reward_wallet_type' => $walletType,
                'first_deposit_only' => true,
            ],
            'rate_snapshot' => [$referrer->hasRole('doctor') && ! $referrer->hasRole('operator') ? self::DOCTOR_RATE_SETTING : self::RATE_SETTING => $rate],
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

    public function depositMinor(Payment $payment): int
    {
        $metadata = $payment->metadata ?? [];

        return max(0, (int) ($metadata['referral_deposit_minor'] ?? ($payment->amount_minor - (isset($metadata['buy_package_id']) ? ($metadata['package_price_minor'] ?? $payment->amount_minor) : 0))));
    }

    public function rewardWalletType(User $user): ?string
    {
        if ($user->hasRole('operator')) {
            return WalletLedger::REAL;
        }

        return $user->hasRole('doctor') || $user->hasRole('patient') ? WalletLedger::POINTS : null;
    }

    private function isUniqueConstraintViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), ['19', '23000', '23505'], true);
    }
}
