<?php

namespace App\Services;

use App\Mail\AdminWalletConfirmationMail;
use App\Models\AdminWalletConfirmation;
use App\Models\FirstTopupPromotionGrant;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Throwable;

class AdminWalletConfirmationService
{
    /** @param array{operation: string, amount?: numeric, direction?: string, reason?: string} $input */
    public function issue(User $admin, User $user, array $input): AdminWalletConfirmation
    {
        $payload = $input['operation'] === 'promotion'
            ? ['amount_minor' => FirstTopupPromotion::AMOUNT_MINOR, 'reason' => 'Promoție acordată manual', 'doctor_ids' => $this->promotionDoctorIds()]
            : ['amount_minor' => (int) round((float) $input['amount'] * 100) * ($input['direction'] === 'debit' ? -1 : 1), 'reason' => trim($input['reason'])];
        if ($input['operation'] === 'promotion') {
            abort_unless($user->hasRole('patient'), 422, 'Promoția se acordă doar conturilor de pacient.');
            abort_if(FirstTopupPromotionGrant::where('user_id', $user->id)->exists(), 422, 'Utilizatorul a primit deja promoția.');
        }
        $code = (string) random_int(100000, 999999);
        $confirmation = DB::transaction(function () use ($admin, $user, $input, $payload, $code) {
            $account = User::whereKey($admin->id)->lockForUpdate()->firstOrFail();
            abort_if(blank($account->email) || ! $account->email_verified_at, 422, 'Confirmă emailul administratorului înainte de această operație.');
            abort_if(AdminWalletConfirmation::where('admin_id', $admin->id)->where('created_at', '>', now()->subMinute())->exists(), 429, 'Poți cere un cod nou după un minut.');
            AdminWalletConfirmation::where('admin_id', $admin->id)->whereNull('consumed_at')->where('expires_at', '>', now())->update(['expires_at' => now()]);

            return AdminWalletConfirmation::create([
                'admin_id' => $account->id, 'user_id' => $user->id, 'admin_email' => $account->email,
                'operation' => $input['operation'], 'payload' => $payload, 'code_hash' => Hash::make($code),
                'expires_at' => now()->addMinutes(max(1, (int) config('otp.expires_minutes', 10))),
            ]);
        }, attempts: 3);
        try {
            Mail::to($confirmation->admin_email, $admin->name)->send(new AdminWalletConfirmationMail($code, $user->name, $user->email, $confirmation->operation, $payload, $confirmation->expires_at->toIso8601String()));
        } catch (Throwable) {
            $confirmation->update(['expires_at' => now()]);
            abort(503, 'Nu am putut trimite codul pe email. Operația nu a fost executată. Încearcă din nou peste un minut.');
        }

        return $confirmation;
    }

    public function confirm(User $admin, User $user, string $operation, string $id, string $code): array
    {
        $result = DB::transaction(function () use ($admin, $user, $operation, $id, $code) {
            $account = User::whereKey($admin->id)->lockForUpdate()->firstOrFail();
            $confirmation = AdminWalletConfirmation::whereKey($id)->where('admin_id', $admin->id)->where('user_id', $user->id)->where('operation', $operation)->lockForUpdate()->first();
            if (! $confirmation || $confirmation->consumed_at || ! $confirmation->expires_at->isFuture() || $confirmation->attempts >= 5 || $confirmation->admin_email !== $account->email || ! $account->email_verified_at) {
                return ['error' => 'Confirmarea nu mai este valabilă. Cere un cod nou pentru operația dorită.'];
            }
            if (! Hash::check($code, $confirmation->code_hash)) {
                $confirmation->increment('attempts');

                return ['error' => $confirmation->attempts >= 5 ? 'Ai depășit limita de încercări. Cere un cod nou.' : 'Codul introdus este greșit.'];
            }
            $payload = $confirmation->payload;
            if ($operation === 'promotion') {
                abort_unless($user->hasRole('patient'), 422, 'Promoția se acordă doar conturilor de pacient.');
                if ($payload['doctor_ids'] !== $this->promotionDoctorIds()) {
                    return ['error' => 'Condițiile promoției s-au schimbat. Cere un cod nou.'];
                }
                $grant = app(FirstTopupPromotion::class)->grantManually($user, $admin);
                $transaction = WalletTransaction::where('user_id', $user->id)->where('metadata->promo_grant_id', $grant->id)->firstOrFail();
            } else {
                $transaction = app(WalletAdjustment::class)->apply($user, $payload['amount_minor'], $payload['reason'], $admin);
            }
            $transaction->update(['metadata' => [...($transaction->metadata ?? []), 'confirmation_id' => $confirmation->id]]);
            $confirmation->update(['consumed_at' => now()]);

            return ['amount_minor' => $payload['amount_minor'], 'transaction_id' => (string) $transaction->id];
        }, attempts: 3);
        if (isset($result['error'])) {
            throw ValidationException::withMessages(['code' => [$result['error']]]);
        }

        return $result;
    }

    private function promotionDoctorIds(): array
    {
        $ids = app(FirstTopupPromotion::class)->configuredDoctorIds();
        sort($ids);

        return $ids;
    }
}
