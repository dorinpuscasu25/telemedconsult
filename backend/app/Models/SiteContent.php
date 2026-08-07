<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * O suprascriere de text făcută de admin. Cheile fără rând aici folosesc
 * valoarea implicită din App\Services\SiteContent::CATALOG.
 */
#[Fillable(['key', 'value', 'updated_by'])]
class SiteContent extends Model
{
    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
