<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'payment_id', 'amount_minor', 'minimum_deposit_minor', 'max_payment_percent', 'doctor_ids'])]
class FirstTopupPromotionGrant extends Model
{
    protected function casts(): array
    {
        return ['doctor_ids' => 'array', 'max_payment_percent' => 'integer'];
    }
}
