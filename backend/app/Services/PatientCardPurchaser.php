<?php

namespace App\Services;

use App\Models\PatientCardPackage;
use App\Models\PatientCardPurchase;
use App\Models\Payment;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Cumpără un pachet de profiluri din portofelul real al titularului.
 *
 * Folosit de cumpărarea directă din sold și de checkout-ul MAIB, unde plata
 * alimentează întâi portofelul, iar pachetul se cumpără în aceeași tranzacție.
 */
class PatientCardPurchaser
{
    /**
     * @throws InsufficientWalletBalance
     */
    public function purchase(int $userId, PatientCardPackage $package, ?Payment $payment = null, ?int $priceMinor = null): PatientCardPurchase
    {
        return DB::transaction(function () use ($userId, $package, $payment, $priceMinor) {
            $priceMinor ??= (int) $package->price_minor;
            $wallet = Wallet::where('user_id', $userId)->where('type', WalletLedger::REAL)->lockForUpdate()->first()
                ?? Wallet::create(['user_id' => $userId, 'type' => WalletLedger::REAL, 'balance_minor' => 0, 'currency' => 'MDL']);

            if ($wallet->balance_minor < $priceMinor) {
                throw new InsufficientWalletBalance($priceMinor, (int) $wallet->balance_minor);
            }

            $wallet->decrement('balance_minor', $priceMinor);

            $purchase = PatientCardPurchase::create([
                'user_id' => $userId,
                'patient_card_package_id' => $package->id,
                'payment_id' => $payment?->id,
                'profile_slots' => $package->profile_slots,
                'amount_minor' => $priceMinor,
                'validity_days' => $package->validity_days,
                'expires_at' => now()->addDays($package->validity_days),
                'settings_snapshot' => $package->toArray(),
            ]);

            WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'user_id' => $userId,
                'amount_minor' => -$priceMinor,
                'currency' => $wallet->currency,
                'type' => 'patient_card_purchase',
                'status' => 'completed',
                'description' => 'Cumpărare cartelă pacient: '.$package->name,
                'metadata' => array_filter([
                    'patient_card_package_id' => $package->id,
                    'patient_card_purchase_id' => $purchase->id,
                    'payment_id' => $payment?->id,
                ]),
            ]);

            if ($package->bonus_points_minor > 0) {
                $ledger = app(WalletLedger::class);
                $ledger->move($ledger->locked($userId, WalletLedger::POINTS), (int) $package->bonus_points_minor, 'patient_card_bonus', 'Bonus la cumpărarea pachetului: '.$package->name, ['patient_card_package_id' => $package->id, 'patient_card_purchase_id' => $purchase->id]);
            }

            return $purchase;
        });
    }

    /**
     * După o plată MAIB confirmată: cumpără pachetul cerut la checkout, o singură dată per plată.
     * Se apelează din aceeași tranzacție care a creditat portofelul, sub lock-ul plății.
     */
    public function completeCheckout(Payment $payment): ?PatientCardPurchase
    {
        $packageId = $payment->metadata['buy_package_id'] ?? null;
        if (! $packageId) {
            return null;
        }

        if ($existing = PatientCardPurchase::where('payment_id', $payment->id)->first()) {
            return $existing;
        }

        $package = PatientCardPackage::where('is_active', true)->find($packageId);
        if (! $package) {
            Log::warning('Pachetul cerut la checkout nu mai este activ; banii rămân în portofel.', ['payment_id' => $payment->id, 'package_id' => $packageId]);

            return null;
        }

        $priceMinor = (int) ($payment->metadata['package_price_minor'] ?? $package->price_minor);

        try {
            return $this->purchase((int) $payment->user_id, $package, $payment, $priceMinor);
        } catch (InsufficientWalletBalance) {
            Log::warning('Soldul nu acoperă pachetul după plată; banii rămân în portofel.', ['payment_id' => $payment->id, 'package_id' => $packageId]);

            return null;
        }
    }
}
