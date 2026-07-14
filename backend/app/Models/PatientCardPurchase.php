<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'patient_card_package_id', 'profile_slots', 'amount_minor', 'validity_days', 'used_slots', 'expires_at', 'settings_snapshot'])]
class PatientCardPurchase extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(PatientCardPackage::class, 'patient_card_package_id');
    }

    public function availableSlots(): int
    {
        if ($this->expires_at?->isPast()) {
            return 0;
        }

        return max(0, $this->profile_slots - $this->used_slots);
    }

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'settings_snapshot' => 'array',
        ];
    }
}
