<?php

namespace App\Models;

use App\Services\PlatformConfig;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['clinic_logo_path', 'clinic_logo_mime', 'signature_path', 'signature_mime', 'clinic_name', 'clinic_details', 'user_id', 'higo_doctor_id', 'specialty_id', 'license_number', 'bio', 'experience_years', 'consultation_price', 'video_price', 'video_duration_minutes', 'google_meet_account', 'platforms', 'service_catalog', 'required_investigations', 'affiliate_code', 'rating', 'reviews_count', 'is_available', 'is_approved', 'accepts_points'])]
class DoctorProfile extends Model
{
    protected static function booted(): void
    {
        static::creating(function (DoctorProfile $profile) {
            $profile->video_price = $profile->getAttributes()['video_price'] ?? (int) app(PlatformConfig::class)->number('video.default_price', 500);
            $profile->video_duration_minutes = $profile->getAttributes()['video_duration_minutes'] ?? (int) app(PlatformConfig::class)->number('video.default_duration_minutes', 10);
        });
    }

    protected function videoPrice(): Attribute
    {
        return Attribute::make(get: fn (mixed $value): int => $value !== null ? (int) $value : (int) app(PlatformConfig::class)->number('video.default_price', 500));
    }

    protected function videoDurationMinutes(): Attribute
    {
        return Attribute::make(get: fn (mixed $value): int => $value !== null ? (int) $value : (int) app(PlatformConfig::class)->number('video.default_duration_minutes', 10));
    }

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
            'higo_password' => 'encrypted',
            'platforms' => 'array',
            'service_catalog' => 'array',
            'required_investigations' => 'array',
            'is_available' => 'boolean',
            'is_approved' => 'boolean',
            'accepts_points' => 'boolean',
            'rating' => 'decimal:1',
        ];
    }
}
