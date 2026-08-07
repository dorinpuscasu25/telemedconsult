<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un comision plătit unui invitator pentru o alimentare concretă de portofel
 * făcută de utilizatorul invitat.
 */
#[Fillable([
    'referral_id',
    'referrer_id',
    'referred_user_id',
    'payment_id',
    'wallet_transaction_id',
    'deposit_amount_minor',
    'commission_amount_minor',
    'rate_percent',
    'currency',
])]
class ReferralCommission extends Model
{
    public function referral(): BelongsTo
    {
        return $this->belongsTo(Referral::class);
    }

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referrer_id');
    }

    public function referredUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referred_user_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    public function walletTransaction(): BelongsTo
    {
        return $this->belongsTo(WalletTransaction::class);
    }

    protected function casts(): array
    {
        return [
            'rate_percent' => 'float',
        ];
    }
}
