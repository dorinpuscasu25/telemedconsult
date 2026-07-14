<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['patient_id', 'patient_profile_id', 'doctor_id', 'operator_id', 'declined_operator_ids', 'coordinator_id', 'specialty_id', 'type', 'consultation_kind', 'status', 'symptoms', 'selected_services', 'triage_notes', 'scheduled_at', 'proposed_scheduled_at', 'proposed_by', 'accepted_at', 'operator_accepted_at', 'anamnesis_completed_at', 'objective_data_completed_at', 'conclusion_sent_at', 'doctor_response_minutes', 'completed_at', 'amount_minor', 'platform_fee_minor', 'provider_amount_minor', 'pricing_snapshot', 'payment_status', 'acceptance_expires_at', 'chat_expires_at', 'free_chat_until', 'chat_reactivated_until', 'cancelled_at', 'refunded_at', 'rating_required_after', 'closed_at', 'cancellation_reason'])]
class ConsultationRequest extends Model
{
    public function patient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'patient_id');
    }

    public function patientProfile(): BelongsTo
    {
        return $this->belongsTo(PatientProfile::class);
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    public function coordinator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coordinator_id');
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    public function objectiveData(): HasMany
    {
        return $this->hasMany(ConsultationObjectiveData::class);
    }

    public function investigations(): HasMany
    {
        return $this->hasMany(PatientInvestigation::class);
    }

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'proposed_scheduled_at' => 'datetime',
            'accepted_at' => 'datetime',
            'operator_accepted_at' => 'datetime',
            'declined_operator_ids' => 'array',
            'anamnesis_completed_at' => 'datetime',
            'objective_data_completed_at' => 'datetime',
            'conclusion_sent_at' => 'datetime',
            'completed_at' => 'datetime',
            'acceptance_expires_at' => 'datetime',
            'chat_expires_at' => 'datetime',
            'free_chat_until' => 'datetime',
            'chat_reactivated_until' => 'datetime',
            'cancelled_at' => 'datetime',
            'refunded_at' => 'datetime',
            'rating_required_after' => 'datetime',
            'closed_at' => 'datetime',
            'selected_services' => 'array',
            'pricing_snapshot' => 'array',
        ];
    }
}
