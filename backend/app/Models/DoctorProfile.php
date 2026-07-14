<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'higo_doctor_id', 'specialty_id', 'license_number', 'bio', 'experience_years', 'consultation_price', 'video_price', 'video_duration_minutes', 'google_meet_account', 'platforms', 'service_catalog', 'required_investigations', 'affiliate_code', 'rating', 'reviews_count', 'is_available', 'is_approved'])]
class DoctorProfile extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    public function investigationRequirements(): HasMany
    {
        return $this->hasMany(DoctorInvestigationRequirement::class, 'doctor_id', 'user_id');
    }

    protected function casts(): array
    {
        return [
            'platforms' => 'array',
            'service_catalog' => 'array',
            'required_investigations' => 'array',
            'is_available' => 'boolean',
            'is_approved' => 'boolean',
            'rating' => 'decimal:1',
        ];
    }
}
