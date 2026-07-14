<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['name', 'slug'])]
class Specialty extends Model
{
    public function doctorProfiles(): HasMany
    {
        return $this->hasMany(DoctorProfile::class);
    }
}
