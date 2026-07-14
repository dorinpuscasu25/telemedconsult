<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['code', 'name', 'description', 'default_price', 'requires_device', 'higo_exam_type', 'is_active'])]
class InvestigationType extends Model
{
    /**
     * Known HIGO exam types the objective data can be mapped to. Nullable on the
     * record — an investigation may have no HIGO counterpart.
     *
     * @var list<string>
     */
    public const HIGO_EXAM_TYPES = [
        'TEMPERATURE_EXAM',
        'HEART_AUSCULTATION_EXAM',
        'LUNGS_AUSCULTATION_EXAM',
        'THROAT_EXAM',
        'SKIN_EXAM',
        'EAR_EXAM',
        'ABDOMEN_EXAM',
        'OXYGEN_SATURATION_EXAM',
        'HEART_RATE_EXAM',
    ];

    protected function casts(): array
    {
        return [
            'requires_device' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
