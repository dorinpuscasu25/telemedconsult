<?php

namespace App\Services;

use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\QueryException;

final class WalletLedger
{
    public const REAL = 'real';
    public const POINTS = 'points';

    public function locked(User|int $user, string $type = self::REAL, string $currency = 'MDL'): Wallet
    {
        $userId = $user instanceof User ? $user->id : $user;
        $wallet = Wallet::where('user_id', $userId)->where('type', $type)->lockForUpdate()->first();
        if ($wallet) return $wallet;

        try {
            Wallet::create(['user_id' => $userId, 'type' => $type, 'balance_minor' => 0, 'currency' => $currency]);
        } catch (QueryException $e) {
            if (! in_array((string) $e->getCode(), ['19', '23000', '23505'], true)) throw $e;
        }

        return Wallet::where('user_id', $userId)->where('type', $type)->lockForUpdate()->firstOrFail();
    }

    public function move(Wallet $wallet, int $amountMinor, string $type, string $description, array $metadata = [], ?int $consultationRequestId = null): WalletTransaction
    {
        $wallet->refresh();
        if ($amountMinor < 0 && $wallet->balance_minor + $amountMinor < 0) {
            throw new \RuntimeException('Sold insuficient în portofel.');
        }
        $wallet->increment('balance_minor', $amountMinor);
        return WalletTransaction::create([
            'wallet_id' => $wallet->id, 'user_id' => $wallet->user_id, 'wallet_type' => $wallet->type,
            'amount_minor' => $amountMinor, 'currency' => $wallet->currency ?: 'MDL', 'type' => $type,
            'status' => 'completed', 'description' => $description, 'metadata' => $metadata,
            'consultation_request_id' => $consultationRequestId,
        ]);
    }
}
