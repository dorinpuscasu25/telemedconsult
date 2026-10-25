<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'legal_name', 'fiscal_code', 'iban', 'bank_name', 'email', 'phone', 'address', 'doctor_share_percent', 'status', 'notes'])]
class MedicalInstitution extends Model
{
    public function managers(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withTimestamps();
    }

    public function doctorProfiles(): HasMany
    {
        return $this->hasMany(DoctorProfile::class);
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(MedicalInstitutionInvitation::class);
    }

    public function earnings(): HasMany
    {
        return $this->hasMany(InstitutionEarning::class);
    }

    public function withdrawalRequests(): HasMany
    {
        return $this->hasMany(WithdrawalRequest::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    protected function casts(): array
    {
        return [
            'doctor_share_percent' => 'float',
        ];
    }
}
