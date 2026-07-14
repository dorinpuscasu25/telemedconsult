<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['consultation_request_id', 'patient_id', 'patient_profile_id', 'doctor_id', 'operator_id', 'status', 'starts_at', 'free_until', 'reactivated_until', 'hard_closes_at'])]
class Conversation extends Model
{
    public function patient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'patient_id');
    }

    public function patientProfile(): BelongsTo
    {
        return $this->belongsTo(PatientProfile::class);
    }

    public function consultationRequest(): BelongsTo
    {
        return $this->belongsTo(ConsultationRequest::class);
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'free_until' => 'datetime',
            'reactivated_until' => 'datetime',
            'hard_closes_at' => 'datetime',
        ];
    }
}
