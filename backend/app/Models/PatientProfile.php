<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'higo_patient_id', 'first_name', 'last_name', 'birth_date', 'gender', 'country', 'region', 'region_id', 'locality', 'locality_id', 'address', 'emergency_contact', 'medical_summary', 'life_history', 'status', 'active_until'])]
class PatientProfile extends Model
{
    /**
     * Codul se generează la creare și nu e mass-assignable: e identificatorul pe
     * care îl trimitem în HIGO și după care operatorul găsește pacientul în
     * aplicația lor, deci nu are voie să vină din input de utilizator.
     */
    protected static function booted(): void
    {
        static::creating(function (self $profile): void {
            $profile->patient_code ??= self::generateUniqueCode();
        });
    }

    public static function generateUniqueCode(): string
    {
        do {
            $code = (string) random_int(100000, 999999);
        } while (self::where('patient_code', $code)->exists());

        return $code;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function regionUnit(): BelongsTo
    {
        return $this->belongsTo(Region::class, 'region_id');
    }

    public function localityUnit(): BelongsTo
    {
        return $this->belongsTo(Locality::class, 'locality_id');
    }

    public function hasCompleteAddress(): bool
    {
        return $this->region_id !== null
            && $this->locality_id !== null
            && filled($this->address);
    }

    public function investigations(): HasMany
    {
        return $this->hasMany(PatientInvestigation::class);
    }

    public function consultationRequests(): HasMany
    {
        return $this->hasMany(ConsultationRequest::class);
    }

    public function getDisplayNameAttribute(): string
    {
        return trim(implode(' ', array_filter([$this->first_name, $this->last_name]))) ?: $this->user?->name ?: 'Pacient';
    }

    public function isActiveForNewConsultations(): bool
    {
        return $this->status === 'active' && ($this->active_until === null || $this->active_until->isFuture());
    }

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'life_history' => 'array',
            'active_until' => 'datetime',
        ];
    }
}
