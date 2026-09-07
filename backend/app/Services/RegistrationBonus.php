<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\WalletLedger;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;

/**
 * Bonusul de bun-venit din portofel.
 *
 * Suma și pornirea/oprirea sunt ale adminului (`/admin/settings`), nu ale
 * codului. Se acordă la CONFIRMAREA EMAILULUI, nu la crearea contului: un cont
 * neconfirmat se face cu orice adresă inventată, deci creditarea la înscriere
 * ar însemna bani de platformă distribuiți către conturi care nu există.
 *
 * O singură dată per utilizator — verificarea e pe tranzacția deja scrisă, deci
 * ține și dacă cineva reia fluxul de verificare.
 */
class RegistrationBonus
{
    public const ENABLED_SETTING = 'wallet.registration_bonus_enabled';

    public const AMOUNT_SETTING = 'wallet.registration_bonus';

    /** Tipul tranzacției din portofel; tot el e și cheia de idempotență. */
    public const TRANSACTION_TYPE = 'registration_bonus';

    /** Bonusul se acordă titularilor de cont, nu prestatorilor. */
    private const ELIGIBLE_ROLE = 'patient';

    public function __construct(private readonly PlatformConfig $config) {}

    public function enabled(): bool
    {
        return $this->config->bool(self::ENABLED_SETTING, false);
    }

    /** Suma în MDL, așa cum o vede adminul. */
    public function amount(): float
    {
        return max(0.0, $this->config->number(self::AMOUNT_SETTING, 0));
    }

    public function amountMinor(): int
    {
        return (int) round($this->amount() * 100);
    }

    /**
     * Creditează bonusul, dacă e cazul. Întoarce `null` când nu se acordă
     * (oprit, sumă zero, rol neeligibil, deja acordat).
     *
     * Trebuie apelată din interiorul unei tranzacții de bază de date: blocarea
     * portofelului nu are efect în afara uneia.
     */
    public function grant(User $user): ?WalletTransaction
    {
        if (! $this->enabled()) {
            return null;
        }

        $amountMinor = $this->amountMinor();

        if ($amountMinor <= 0) {
            return null;
        }

        if (! $user->loadMissing('roles')->hasRole(self::ELIGIBLE_ROLE)) {
            return null;
        }

        if (WalletTransaction::where('user_id', $user->id)->where('type', self::TRANSACTION_TYPE)->exists()) {
            return null;
        }

        $wallet = $this->lockedWallet($user);
        $wallet->increment('balance_minor', $amountMinor);

        $transaction = WalletTransaction::create([
            'wallet_id' => $wallet->id,
            'wallet_type' => WalletLedger::POINTS,
            'user_id' => $user->id,
            'amount_minor' => $amountMinor,
            'currency' => $wallet->currency ?: 'MDL',
            'type' => self::TRANSACTION_TYPE,
            'status' => 'completed',
            'description' => 'Bonus de bun-venit la înregistrare',
            'metadata' => [
                'source' => 'registration',
                'granted_at' => now()->toIso8601String(),
            ],
            'rate_snapshot' => [self::AMOUNT_SETTING => $this->amount()],
        ]);

        Log::info('Bonus de înregistrare acordat', [
            'user_id' => $user->id,
            'amount_minor' => $amountMinor,
        ]);

        return $transaction;
    }

    private function lockedWallet(User $user): Wallet
    {
        $wallet = Wallet::where('user_id', $user->id)->where('type', WalletLedger::POINTS)->lockForUpdate()->first();

        if ($wallet) {
            return $wallet;
        }

        try {
            Wallet::create(['user_id' => $user->id, 'type' => WalletLedger::POINTS, 'balance_minor' => 0, 'currency' => 'MDL']);
        } catch (QueryException $exception) {
            // `user_id` e unique: dacă portofelul a apărut între timp (o plată
            // în paralel), îl luăm pe acela.
            if (! in_array((string) $exception->getCode(), ['19', '23000', '23505'], true)) {
                throw $exception;
            }
        }

        return Wallet::where('user_id', $user->id)->where('type', WalletLedger::POINTS)->lockForUpdate()->firstOrFail();
    }
}
