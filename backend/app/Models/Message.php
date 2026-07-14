<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['conversation_id', 'sender_id', 'body', 'type', 'read_at', 'metadata'])]
class Message extends Model
{
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'read_at' => 'datetime',
        ];
    }
}
