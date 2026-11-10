<?php

namespace App\Notifications\Channels;

use App\Jobs\SendTelegramEvent;
use App\Services\FeatureFlags;
use App\Services\TelegramBot;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;

class TelegramChannel
{
    public function __construct(
        private readonly TelegramBot $bot,
        private readonly FeatureFlags $features,
    ) {}

    /** Ce primește utilizatorul pe Telegram când nu a ales altceva. */
    public const DEFAULT_PREFERENCES = ['requests' => true, 'messages' => true, 'payments' => true, 'reminders' => false];

    /** @return array<string, bool> */
    public static function preferences(object $notifiable): array
    {
        return array_merge(self::DEFAULT_PREFERENCES, array_map('boolval', array_intersect_key((array) ($notifiable->telegram_preferences ?? []), self::DEFAULT_PREFERENCES)));
    }

    public static function wants(object $notifiable, ?string $category): bool
    {
        return $category === null || (self::preferences($notifiable)[$category] ?? true);
    }

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

        if (method_exists($notification, 'telegramCategory') && ! self::wants($notifiable, $notification->telegramCategory())) {
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

        DB::afterCommit(function () use ($notifiable, $chatId, $text) {
            if (config('queue.default') === 'sync') {
                $this->bot->sendMessage((string) $chatId, $text);

                return;
            }
            SendTelegramEvent::dispatch((int) $notifiable->id, (string) $chatId, $text);
        });
    }
}
