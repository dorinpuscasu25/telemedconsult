<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['key', 'value', 'group', 'type', 'effective_from', 'updated_by'])]
class PlatformSetting extends Model
{
    use StoresDatesInAppTimezone;

    protected function casts(): array
    {
        return [
            'value' => 'array',
            'effective_from' => 'datetime',
        ];
    }
}
