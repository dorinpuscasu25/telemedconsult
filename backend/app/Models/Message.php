<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use App\Services\PatientRecordAccess;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['conversation_id', 'sender_id', 'body', 'type', 'read_at', 'metadata'])]
class Message extends Model
{
    use StoresDatesInAppTimezone;

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function getMetadataAttribute(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        $data = is_array($value) ? $value : json_decode($value, true);
        if (($data['disk'] ?? null) === 'local') {
            $data['url'] = app(PatientRecordAccess::class)->fileUrl('chat-attachment.file', ['message' => $this->id]);
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
