<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['operator_id', 'region_id', 'locality_id', 'fee'])]
class OperatorTravelFee extends Model
{
    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    public function locality(): BelongsTo
    {
        return $this->belongsTo(Locality::class);
    }
}
