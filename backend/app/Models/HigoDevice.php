<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['higo_device_id', 'serial_number', 'box_serial_number', 'assigned_user_id', 'assigned_higo_user_type', 'status'])]
class HigoDevice extends Model
{
    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }
}
