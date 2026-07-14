<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['operator_id', 'investigation_type_id', 'price_override'])]
class OperatorCapability extends Model
{
    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operator_id');
    }

    public function investigationType(): BelongsTo
    {
        return $this->belongsTo(InvestigationType::class);
    }
}
