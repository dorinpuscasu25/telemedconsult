<?php

namespace App\Notifications\Channels;

use App\Services\FeatureFlags;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Http;

class TelegramChannel
{
    public function send(object $notifiable, Notification $notification): void
    {
        if (! method_exists($notification, 'toTelegram')) {
            return;
        }

        if (! app(FeatureFlags::class)->enabled('telegram_notifications')) {
            return;
        }

        $token = config('services.telegram.bot_token') ?: env('TELEGRAM_BOT_TOKEN');
        $chatId = $notifiable->telegram_chat_id ?? null;

        if (! $token || ! $chatId) {
            return;
        }

        $payload = $notification->toTelegram($notifiable);
        $text = $payload['text'] ?? null;

        if (! $text) {
            return;
        }

        Http::timeout(5)->post("https://api.telegram.org/bot{$token}/sendMessage", [
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ]);
    }
}
