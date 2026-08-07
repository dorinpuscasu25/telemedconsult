<?php

namespace App\Notifications\Channels;

use App\Services\FeatureFlags;
use App\Services\TelegramBot;
use Illuminate\Notifications\Notification;

class TelegramChannel
{
    public function __construct(
        private readonly TelegramBot $bot,
        private readonly FeatureFlags $features,
    ) {}

    public function send(object $notifiable, Notification $notification): void
    {
        if (! method_exists($notification, 'toTelegram')) {
            return;
        }

        if (! $this->features->enabled('telegram_notifications')) {
            return;
        }

        // Comutatorul per utilizator: contul rămâne conectat, dar tace.
        if (($notifiable->telegram_notifications_enabled ?? true) === false) {
            return;
        }

        $chatId = $notifiable->telegram_chat_id ?? null;

        if (! $chatId || ! $this->bot->configured()) {
            return;
        }

        $payload = $notification->toTelegram($notifiable);
        $text = $payload['text'] ?? null;

        if (! $text) {
            return;
        }

        $this->bot->sendMessage((string) $chatId, $text);
    }
}
