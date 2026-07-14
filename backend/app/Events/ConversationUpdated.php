<?php

namespace App\Events;

use App\Models\Conversation;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationUpdated implements ShouldBroadcast
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Conversation $conversation,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('conversation.'.$this->conversation->id),
            ...$this->participantChannels(),
        ];
    }

    public function broadcastAs(): string
    {
        return 'conversation.updated';
    }

    public function broadcastWith(): array
    {
        $conversation = $this->conversation->loadMissing(['patient', 'doctor', 'operator', 'messages.sender']);

        return [
            'conversation' => $conversation,
        ];
    }

    private function participantChannels(): array
    {
        return collect([
            $this->conversation->patient_id,
            $this->conversation->doctor_id,
            $this->conversation->operator_id,
        ])
            ->filter()
            ->unique()
            ->map(fn (int $userId) => new PrivateChannel('App.Models.User.'.$userId))
            ->values()
            ->all();
    }
}
