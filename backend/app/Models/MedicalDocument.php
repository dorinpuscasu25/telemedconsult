<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['consultation_id', 'patient_id', 'doctor_id', 'type', 'title', 'status', 'pdf_path', 'signed_at', 'external_reference', 'fhir_payload'])]
class MedicalDocument extends Model
{
    protected function casts(): array
    {
        return [
            'signed_at' => 'datetime',
            'fhir_payload' => 'array',
        ];
    }
}
