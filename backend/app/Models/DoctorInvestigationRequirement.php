<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['doctor_id', 'investigation_type_id', 'requirement'])]
class DoctorInvestigationRequirement extends Model
{
    public const REQUIREMENTS = ['required', 'optional'];

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function investigationType(): BelongsTo
    {
        return $this->belongsTo(InvestigationType::class);
    }
}
