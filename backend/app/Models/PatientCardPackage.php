<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'description', 'profile_slots', 'price_minor', 'validity_days', 'is_active'])]
class PatientCardPackage extends Model
{
    public function purchases(): HasMany
    {
        return $this->hasMany(PatientCardPurchase::class);
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
