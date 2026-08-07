<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\AppEventNotification;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Adăugarea sau scăderea manuală de fonduri din portofelul unui utilizator.
 *
 * Sunt bani de platformă mișcați de mână, deci fiecare operație lasă urmă:
 * cine a făcut-o, când și de ce. Motivul e obligatoriu — peste o lună, o
 * tranzacție de 500 MDL fără explicație nu se mai poate reconstitui.
 */
class WalletAdjustment
{
    public const TYPE_CREDIT = 'admin_credit';

    public const TYPE_DEBIT = 'admin_debit';

    /**
     * Mută suma în portofel. Pozitiv = adaugă, negativ = scade.
     *
     * @throws ValidationException dacă scăderea ar duce soldul sub zero
     */
    public function apply(User $user, int $amountMinor, string $reason, User $admin): WalletTransaction
    {
        if ($amountMinor === 0) {
            throw ValidationException::withMessages([
                'amount' => ['Suma nu poate fi zero.'],
            ]);
        }

        return DB::transaction(function () use ($user, $amountMinor, $reason, $admin) {
            $wallet = $this->lockedWallet($user);

            // Soldul negativ n-are niciun înțeles aici: ar însemna că platforma
            // îi datorează utilizatorului bani pe care nu i-a primit niciodată.
            if ($amountMinor < 0 && (int) $wallet->balance_minor + $amountMinor < 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Soldul disponibil este de doar '.number_format($wallet->balance_minor / 100, 2, ',', '.').' MDL.'],
                ]);
            }

            $wallet->increment('balance_minor', $amountMinor);

            $transaction = WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'user_id' => $user->id,
                'amount_minor' => $amountMinor,
                'currency' => $wallet->currency ?: 'MDL',
                'type' => $amountMinor > 0 ? self::TYPE_CREDIT : self::TYPE_DEBIT,
                'status' => 'completed',
                'description' => ($amountMinor > 0 ? 'Fonduri adăugate de administrator' : 'Corecție de sold (administrator)').' — '.$reason,
                'metadata' => [
                    'source' => 'admin_adjustment',
                    'reason' => $reason,
                    'admin_id' => $admin->id,
                    'admin_name' => $admin->name,
                    'balance_after' => $wallet->refresh()->balance_minor / 100,
                ],
            ]);

            Log::info('Ajustare manuală de portofel', [
                'user_id' => $user->id,
                'admin_id' => $admin->id,
                'amount_minor' => $amountMinor,
                'reason' => $reason,
            ]);

            $this->notify($user, $amountMinor, $reason);

            return $transaction;
        });
    }

    /**
     * Utilizatorul află imediat ce s-a întâmplat cu banii lui — și când i se
     * adaugă, și când i se corectează în minus.
     */
    private function notify(User $user, int $amountMinor, string $reason): void
    {
        $amount = number_format(abs($amountMinor) / 100, 2, ',', '.');

        $user->notify(new AppEventNotification(
            $amountMinor > 0 ? 'Ai primit '.$amount.' MDL în portofel' : 'Sold corectat cu '.$amount.' MDL',
            $amountMinor > 0
                ? 'Administratorul a adăugat '.$amount.' MDL în portofelul tău. Motiv: '.$reason
                : 'Administratorul a scăzut '.$amount.' MDL din portofelul tău. Motiv: '.$reason,
            '/wallet',
        ));
    }

    private function lockedWallet(User $user): Wallet
    {
        $wallet = Wallet::where('user_id', $user->id)->lockForUpdate()->first();

        if ($wallet) {
            return $wallet;
        }

        try {
            Wallet::create(['user_id' => $user->id, 'balance_minor' => 0, 'currency' => 'MDL']);
        } catch (QueryException $exception) {
            // `user_id` e unique: dacă portofelul a apărut între timp, îl luăm.
            if (! in_array((string) $exception->getCode(), ['19', '23000', '23505'], true)) {
                throw $exception;
            }
        }

        return Wallet::where('user_id', $user->id)->lockForUpdate()->firstOrFail();
    }
}
