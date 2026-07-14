<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'wallet_id', 'amount_minor', 'currency', 'purpose', 'status', 'provider', 'provider_payment_id', 'metadata', 'paid_at'])]
class Payment extends Model
{
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'paid_at' => 'datetime',
        ];
    }
}
