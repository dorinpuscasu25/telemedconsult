<?php

namespace App\Models;

use Database\Factories\ReferralFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable(['referrer_id', 'referred_user_id', 'reward_amount_minor', 'currency', 'status', 'rewarded_at'])]
class Referral extends Model
{
    /** @use HasFactory<ReferralFactory> */
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_REWARDED = 'rewarded';

    public const STATUS_INELIGIBLE = 'ineligible';

    public function referrer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referrer_id');
    }

    public function referredUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referred_user_id');
    }

    public function walletTransaction(): HasOne
    {
        return $this->hasOne(WalletTransaction::class);
    }

    protected function casts(): array
    {
        return [
            'rewarded_at' => 'datetime',
        ];
    }
}
