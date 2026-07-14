<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['patient_id', 'reported_user_id', 'consultation_request_id', 'status', 'subject', 'description', 'resolution_note', 'coupon_code', 'coupon_amount_minor', 'resolved_at'])]
class Complaint extends Model
{
    public function patient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'patient_id');
    }

    public function reportedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_user_id');
    }

    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
        ];
    }
}
