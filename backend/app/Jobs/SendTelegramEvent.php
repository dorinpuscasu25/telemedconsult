<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\FeatureFlags;
use App\Services\TelegramBot;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendTelegramEvent implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public int $userId, public string $chatId, public string $text) {}

    public function backoff(): array
    {
        return [10, 30];
    }

    public function handle(TelegramBot $bot, FeatureFlags $features): void
    {
        $user = User::find($this->userId);
        if (! $user || (string) $user->telegram_chat_id !== $this->chatId || ! $user->telegram_notifications_enabled || ! $features->enabled('telegram_notifications') || ! $bot->configured()) {
            return;
        }
        if (! $bot->sendMessage($this->chatId, $this->text) && $user->fresh()->telegram_chat_id) {
            throw new \RuntimeException('Trimiterea notificării Telegram va fi reîncercată.');
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::warning('Notificarea Telegram nu a putut fi livrată.', ['user_id' => $this->userId]);
    }
}
