<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['doctor_id', 'from_institution_id', 'to_institution_id', 'status', 'note', 'decision_note', 'doctor_share_percent', 'decided_by', 'decided_at'])]
class InstitutionTransfer extends Model
{
    use StoresDatesInAppTimezone;

    protected $attributes = ['status' => 'pending'];

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function fromInstitution(): BelongsTo
    {
        return $this->belongsTo(MedicalInstitution::class, 'from_institution_id');
    }

    public function toInstitution(): BelongsTo
    {
        return $this->belongsTo(MedicalInstitution::class, 'to_institution_id');
    }

    protected function casts(): array
    {
        return ['doctor_share_percent' => 'float', 'decided_at' => 'datetime'];
    }
}
