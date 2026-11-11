<?php

namespace App\Console\Commands;

use App\Services\TelegramBot;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('telegram:webhook {action=set : set|delete|info|ensure} {--url= : URL-ul public al webhook-ului (implicit APP_URL)}')]
#[Description('Înregistrează, șterge sau inspectează webhook-ul botului de Telegram.')]
class TelegramWebhookCommand extends Command
{
    public function handle(TelegramBot $bot): int
    {
        if (! $bot->token()) {
            $this->error('TELEGRAM_BOT_TOKEN lipsește din .env.');

            return self::FAILURE;
        }

        return match ((string) $this->argument('action')) {
            'set' => $this->set($bot),
            'delete' => $this->dump($bot->deleteWebhook()),
            'info' => $this->dump($bot->webhookInfo()),
            // Verifică și repară: din scheduler, la câteva minute.
            'ensure' => $this->ensure($bot),
            default => tap(self::FAILURE, fn () => $this->error('Acțiuni valide: set, delete, info, ensure.')),
        };
    }

    private function ensure(TelegramBot $bot): int
    {
        try {
            $result = $bot->ensure();
        } catch (\Throwable $exception) {
            $this->error('Telegram nu răspunde: '.$exception->getMessage());

            return self::FAILURE;
        }
        $result['changed'] ? $this->warn($result['message']) : $this->line($result['message']);

        return $result['ok'] ? self::SUCCESS : self::FAILURE;
    }

    private function set(TelegramBot $bot): int
    {
        $secret = $bot->webhookSecret();

        if (! $secret) {
            $this->error('TELEGRAM_WEBHOOK_SECRET lipsește din .env. Generează unul: php artisan telegram:webhook info');

            return self::FAILURE;
        }

        $base = rtrim((string) ($this->option('url') ?: config('app.url')), '/');
        $url = $base.'/api/v1/telegram/webhook/'.$secret;

        $this->line('Înregistrez webhook: '.$url);

        return $this->dump($bot->setWebhook($url, $secret));
    }

    /**
     * @param  array<string, mixed>  $response
     */
    private function dump(array $response): int
    {
        $this->line(json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '');

        return ($response['ok'] ?? false) ? self::SUCCESS : self::FAILURE;
    }
}
