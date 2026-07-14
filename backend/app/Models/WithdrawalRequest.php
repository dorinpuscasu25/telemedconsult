<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'amount_minor', 'approved_amount_minor', 'currency', 'iban', 'contract_number', 'payout_period', 'status', 'admin_note', 'payout_sent_at', 'payout_method', 'payout_reference', 'processed_at', 'processed_by'])]
class WithdrawalRequest extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function processor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    protected function casts(): array
    {
        return [
            'payout_sent_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }
}
