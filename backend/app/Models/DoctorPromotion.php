<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['doctor_id', 'budget_minor', 'remaining_minor', 'status', 'ends_at'])]
class DoctorPromotion extends Model
{
    protected $attributes = ['status' => 'active'];

    protected function casts(): array
    {
        return ['ends_at' => 'datetime'];
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }
}
