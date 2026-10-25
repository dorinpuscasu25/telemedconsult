<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Împărțirea, fixată la finalizare, a sumei rămase după comisionul platformei
 * între instituție și medicul ei. Procentul e salvat aici, ca o modificare
 * ulterioară a procentului să nu schimbe consultațiile deja încheiate.
 */
#[Fillable(['medical_institution_id', 'doctor_id', 'consultation_request_id', 'gross_amount_minor', 'provider_amount_minor', 'doctor_share_percent', 'doctor_amount_minor', 'institution_amount_minor', 'currency'])]
class InstitutionEarning extends Model
{
    public function institution(): BelongsTo
    {
        return $this->belongsTo(MedicalInstitution::class, 'medical_institution_id');
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function consultationRequest(): BelongsTo
    {
        return $this->belongsTo(ConsultationRequest::class);
    }

    protected function casts(): array
    {
        return [
            'doctor_share_percent' => 'float',
        ];
    }
}
