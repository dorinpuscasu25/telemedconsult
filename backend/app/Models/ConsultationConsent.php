<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['consultation_request_id', 'patient_profile_id', 'accepted_by', 'type', 'version', 'snapshot', 'accepted_at'])]
class ConsultationConsent extends Model
{
    protected function casts(): array
    {
        return ['snapshot' => 'array', 'accepted_at' => 'datetime'];
    }
}
