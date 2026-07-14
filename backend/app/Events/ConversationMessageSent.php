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
        return [
            'conversation_id' => $this->conversation->id,
            'message' => [
                'id' => $this->message->id,
                'conversation_id' => $this->message->conversation_id,
                'sender_id' => $this->message->sender_id,
                'sender' => $this->message->sender ? [
                    'id' => $this->message->sender->id,
                    'name' => $this->message->sender->name,
                    'email' => $this->message->sender->email,
                ] : null,
                'body' => $this->message->body,
                'type' => $this->message->type ?? 'text',
                'read_at' => $this->message->read_at,
                'metadata' => $this->message->metadata,
                'created_at' => $this->message->created_at,
            ],
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
