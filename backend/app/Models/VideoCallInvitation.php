<?php

namespace App\Models;

use App\Events\VideoCallUpdated;
use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['consultation_request_id', 'caller_id', 'recipient_id', 'status', 'expires_at', 'responded_at'])]
class VideoCallInvitation extends Model
{
    use HasFactory;
    use StoresDatesInAppTimezone;

    protected $attributes = ['status' => 'ringing'];

    /** Orice schimbare de stare ajunge imediat la cei doi participanți. */
    protected static function booted(): void
    {
        static::saved(fn (VideoCallInvitation $call) => VideoCallUpdated::dispatch($call));
    }

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'responded_at' => 'datetime'];
    }

    public function consultationRequest(): BelongsTo
    {
        return $this->belongsTo(ConsultationRequest::class);
    }

    public function caller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'caller_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }
}
