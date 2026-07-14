<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['payment_id', 'provider_event_id', 'event_type', 'payload', 'received_at'])]
class PaymentEvent extends Model
{
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'received_at' => 'datetime',
        ];
    }
}
