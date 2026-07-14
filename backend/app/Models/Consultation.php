<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['consultation_request_id', 'patient_id', 'patient_profile_id', 'doctor_id', 'status', 'current_illness_history', 'objective_data_snapshot', 'diagnosis', 'treatment_plan', 'recommendations', 'prescription_notes', 'price', 'fhir_payload', 'signed_pdf_path', 'completed_at'])]
class Consultation extends Model
{
    public function patient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'patient_id');
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function patientProfile(): BelongsTo
    {
        return $this->belongsTo(PatientProfile::class);
    }

    protected function casts(): array
    {
        return [
            'fhir_payload' => 'array',
            'objective_data_snapshot' => 'array',
            'completed_at' => 'datetime',
        ];
    }
}
