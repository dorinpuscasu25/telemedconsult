<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['consultation_request_id', 'patient_profile_id', 'operator_id', 'source', 'payload', 'completed_at'])]
class ConsultationObjectiveData extends Model
{
    protected $table = 'consultation_objective_data';

    public function consultationRequest(): BelongsTo
    {
        return $this->belongsTo(ConsultationRequest::class);
    }

    public function patientProfile(): BelongsTo
    {
        return $this->belongsTo(PatientProfile::class);
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'completed_at' => 'datetime',
        ];
    }
}
