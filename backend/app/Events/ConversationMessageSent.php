<?php

namespace App\Events;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationMessageSent implements ShouldBroadcast
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Conversation $conversation,
        public Message $message,
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
        return 'conversation.message.sent';
    }

    public function broadcastWith(): array
    {
        return ['conversation_id' => $this->conversation->id, 'message_id' => $this->message->id];
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
