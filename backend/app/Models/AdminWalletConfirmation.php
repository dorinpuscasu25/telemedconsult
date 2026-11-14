<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['admin_id', 'user_id', 'admin_email', 'operation', 'payload', 'code_hash', 'expires_at', 'consumed_at', 'attempts'])]
#[Hidden(['code_hash'])]
class AdminWalletConfirmation extends Model
{
    use HasUuids, StoresDatesInAppTimezone;

    protected $attributes = ['attempts' => 0];

    protected function casts(): array
    {
        return ['payload' => 'array', 'attempts' => 'integer', 'expires_at' => 'datetime', 'consumed_at' => 'datetime'];
    }
}
