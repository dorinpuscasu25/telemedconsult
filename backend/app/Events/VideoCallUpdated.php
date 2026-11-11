<?php

namespace App\Events;

use App\Models\VideoCallInvitation;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Apelul video a sunat, a fost preluat, refuzat sau anulat. Aplicația celor doi
 * participanți reîncarcă apelurile la primire, în loc să întrebe serverul la
 * fiecare 2 secunde.
 */
class VideoCallUpdated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public function __construct(public VideoCallInvitation $call) {}

    public function broadcastOn(): array
    {
        return collect([$this->call->caller_id, $this->call->recipient_id])
            ->filter()
            ->unique()
            ->map(fn (int $userId) => new PrivateChannel('App.Models.User.'.$userId))
            ->values()
            ->all();
    }

    public function broadcastAs(): string
    {
        return 'video-call.updated';
    }

    /** @return array{id: int, request_id: int, status: string} */
    public function broadcastWith(): array
    {
        return ['id' => $this->call->id, 'request_id' => $this->call->consultation_request_id, 'status' => $this->call->status];
    }
}
