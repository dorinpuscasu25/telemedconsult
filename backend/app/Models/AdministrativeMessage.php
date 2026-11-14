<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['administrative_conversation_id', 'sender_id', 'sender_is_admin', 'body', 'attachments', 'read_at'])]
class AdministrativeMessage extends Model
{
    protected function casts(): array
    {
        return ['attachments' => 'array', 'read_at' => 'datetime', 'sender_is_admin' => 'boolean'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AdministrativeConversation::class, 'administrative_conversation_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }
}
