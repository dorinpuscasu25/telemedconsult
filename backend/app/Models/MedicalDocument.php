<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['patient_profile_id', 'consultation_request_id', 'signature_provider', 'signature_payload', 'parent_document_id', 'content_snapshot', 'published_at', 'prescription_path', 'prescription_mime', 'consultation_id', 'patient_id', 'doctor_id', 'type', 'title', 'status', 'pdf_path', 'signed_at', 'external_reference', 'fhir_payload'])]
class MedicalDocument extends Model
{
    protected function casts(): array
    {
        return [
            'content_snapshot' => 'array',
            'published_at' => 'datetime',
            'signature_payload' => 'array',
            'signed_at' => 'datetime',
            'fhir_payload' => 'array',
        ];
    }
}
