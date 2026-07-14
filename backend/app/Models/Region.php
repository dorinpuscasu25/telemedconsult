<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'type', 'country', 'is_active'])]
class Region extends Model
{
    public const TYPES = ['raion', 'municipiu', 'uta', 'unitate_teritoriala'];

    public function localities(): HasMany
    {
        return $this->hasMany(Locality::class);
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
