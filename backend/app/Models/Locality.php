<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['region_id', 'name', 'type', 'is_active'])]
class Locality extends Model
{
    public const TYPES = ['oras', 'municipiu', 'sat', 'comuna'];

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
