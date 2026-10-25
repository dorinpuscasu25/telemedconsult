<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['medical_institution_id', 'email', 'name', 'specialty_id', 'license_number', 'doctor_share_percent', 'token_hash', 'status', 'expires_at', 'invited_by', 'accepted_by', 'accepted_at'])]
#[Hidden(['token_hash'])]
class MedicalInstitutionInvitation extends Model
{
    public function institution(): BelongsTo
    {
        return $this->belongsTo(MedicalInstitution::class, 'medical_institution_id');
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function isUsable(): bool
    {
        return $this->status === 'pending' && $this->expires_at->isFuture();
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'doctor_share_percent' => 'float',
        ];
    }
}
