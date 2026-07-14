<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['wallet_id', 'user_id', 'amount_minor', 'currency', 'type', 'status', 'description', 'metadata', 'rate_snapshot', 'consultation_request_id'])]
class WalletTransaction extends Model
{
    public function wallet(): BelongsTo
    {
        return $this->belongsTo(Wallet::class);
    }

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'rate_snapshot' => 'array',
        ];
    }
}
