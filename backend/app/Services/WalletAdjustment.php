<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\AppEventNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Adăugarea sau scăderea manuală de PUNCTE BONUS din portofelul unui utilizator.
 *
 * Soldul în lei e legat numai de bancă (alimentări, plăți, retrageri) și nu se
 * modifică de mână; compensațiile se fac exclusiv în puncte bonus.
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
                    'amount' => ['Soldul de bonusuri este de doar '.number_format($wallet->balance_minor / 100, 2, ',', '.').' puncte.'],
                ]);
            }

            $wallet->increment('balance_minor', $amountMinor);

            $transaction = WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'wallet_type' => WalletLedger::POINTS,
                'user_id' => $user->id,
                'amount_minor' => $amountMinor,
                'currency' => $wallet->currency ?: 'MDL',
                'type' => $amountMinor > 0 ? self::TYPE_CREDIT : self::TYPE_DEBIT,
                'status' => 'completed',
                'description' => ($amountMinor > 0 ? 'Puncte bonus adăugate de administrator' : 'Corecție puncte bonus (administrator)').' — '.$reason,
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
            $amountMinor > 0 ? 'Ai primit '.$amount.' puncte bonus' : 'Puncte bonus corectate cu '.$amount,
            $amountMinor > 0
                ? 'Administratorul a adăugat '.$amount.' puncte în portofelul de bonusuri. Motiv: '.$reason
                : 'Administratorul a scăzut '.$amount.' puncte din portofelul de bonusuri. Motiv: '.$reason,
            '/wallet',
        ));
    }

    private function lockedWallet(User $user): Wallet
    {
        return app(WalletLedger::class)->locked($user, WalletLedger::POINTS);
    }
}
