<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'external_id', 'higo_patient_id', 'device_serial', 'consultation_request_id',
    'patient_profile_id', 'consultation_objective_data_id', 'status', 'error',
    'raw', 'received_at', 'mapped_at',
])]
class HigoExamPayload extends Model
{
    public const STATUS_RECEIVED = 'received';

    public const STATUS_MAPPED = 'mapped';

    public const STATUS_UNMATCHED = 'unmatched';

    public const STATUS_FAILED = 'failed';

    public function consultationRequest(): BelongsTo
    {
        return $this->belongsTo(ConsultationRequest::class);
    }

    public function patientProfile(): BelongsTo
    {
        return $this->belongsTo(PatientProfile::class);
    }

    /** Imaginile, înregistrările și filmările aduse pentru examinarea asta. */
    public function media(): HasMany
    {
        return $this->hasMany(HigoExamMedia::class, 'higo_exam_payload_id');
    }

    public function objectiveData(): BelongsTo
    {
        return $this->belongsTo(ConsultationObjectiveData::class, 'consultation_objective_data_id');
    }

    protected function casts(): array
    {
        return [
            'raw' => 'array',
            'received_at' => 'datetime',
            'mapped_at' => 'datetime',
        ];
    }
}
