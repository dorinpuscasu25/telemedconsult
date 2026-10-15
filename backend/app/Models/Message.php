<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\URL;

#[Fillable(['conversation_id', 'sender_id', 'body', 'type', 'read_at', 'metadata'])]
class Message extends Model
{
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function getMetadataAttribute(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        $data = is_array($value) ? $value : json_decode($value, true);
        if (($data['disk'] ?? null) === 'local') {
            $data['url'] = URL::temporarySignedRoute('chat-attachment.file', now()->addMinutes(15), ['message' => $this->id]);
            unset($data['path'], $data['disk']);
        }

        return $data;
    }

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'read_at' => 'datetime',
        ];
    }
}
