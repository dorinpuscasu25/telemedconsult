<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

#[Fillable(['key', 'label', 'unit', 'type', 'min', 'max', 'group', 'is_active'])]
class ClinicalParameter extends Model
{
    protected $attributes = ['type' => 'number', 'group' => 'exam', 'is_active' => true];

    protected static function booted(): void
    {
        static::saved(fn () => Cache::forget('clinical-parameter-fields'));
        static::deleted(fn () => Cache::forget('clinical-parameter-fields'));
    }

    protected function casts(): array
    {
        return ['min' => 'float', 'max' => 'float', 'is_active' => 'boolean'];
    }
}
