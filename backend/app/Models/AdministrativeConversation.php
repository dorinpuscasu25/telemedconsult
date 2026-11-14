<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['target_id', 'created_by'])]
class AdministrativeConversation extends Model
{
    public function target(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(AdministrativeMessage::class);
    }
}
