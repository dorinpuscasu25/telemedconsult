<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Clientul botului de Telegram: generează deep-link-urile de conectare,
 * procesează update-urile primite pe webhook și trimite mesaje.
 *
 * Fluxul de conectare: aplicația generează un token de unică folosință pentru
 * utilizatorul autentificat, îl împachetează în `t.me/<bot>?start=<token>`, iar
 * botul primește tokenul în textul comenzii `/start` odată ce utilizatorul apasă
 * Start. Nimeni nu copiază chat id-uri de mână.
 */
class TelegramBot
{
    /** Cât timp rămâne valid un token de conectare. */
    public const TOKEN_TTL_MINUTES = 15;

    private const API = 'https://api.telegram.org/bot';

    public function configured(): bool
    {
        return (bool) $this->token() && (bool) $this->username();
    }

    public function token(): ?string
    {
        return config('services.telegram.bot_token') ?: null;
    }

    public function username(): ?string
    {
        $username = config('services.telegram.bot_username');

        return $username ? ltrim((string) $username, '@') : null;
    }

    public function webhookSecret(): ?string
    {
        return config('services.telegram.webhook_secret') ?: null;
    }

    /**
     * Emite (sau reînnoiește) tokenul de conectare și întoarce deep-link-ul.
     *
     * @return array{deep_link: string, token: string, expires_at: Carbon}
     */
    public function issueLinkToken(User $user): array
    {
        $token = Str::lower(Str::random(32));
        $expiresAt = now()->addMinutes(self::TOKEN_TTL_MINUTES);

        $user->forceFill([
            'telegram_link_token' => $token,
            'telegram_link_token_expires_at' => $expiresAt,
        ])->save();

        return [
            'deep_link' => $this->deepLink($token),
            'token' => $token,
            'expires_at' => $expiresAt,
        ];
    }

    public function deepLink(string $token): string
    {
        return 'https://t.me/'.$this->username().'?start='.$token;
    }

    /**
     * Rupe legătura cu Telegram și oprește tokenul în curs, dacă există.
     */
    public function unlink(User $user, bool $notifyUser = true): void
    {
        $chatId = $user->telegram_chat_id;

        $user->forceFill([
            'telegram_chat_id' => null,
            'telegram_username' => null,
            'telegram_linked_at' => null,
            'telegram_link_token' => null,
            'telegram_link_token_expires_at' => null,
        ])->save();

        if ($notifyUser && $chatId) {
            $this->sendMessage($chatId, "🔌 Contul a fost deconectat de la telemedconsult.md.\nNu vei mai primi notificări aici. Poți reconecta oricând din aplicație.");
        }
    }

    /**
     * Procesează un update primit pe webhook. Întoarce true dacă a fost tratat.
     *
     * @param  array<string, mixed>  $update
     */
    public function handleUpdate(array $update): bool
    {
        $message = $update['message'] ?? $update['edited_message'] ?? null;

        if (! is_array($message)) {
            return false;
        }

        $chatId = (string) ($message['chat']['id'] ?? '');
        $text = trim((string) ($message['text'] ?? ''));

        if ($chatId === '' || $text === '') {
            return false;
        }

        /** @var array<string, mixed> $from */
        $from = is_array($message['from'] ?? null) ? $message['from'] : [];
        [$command, $argument] = $this->parseCommand($text);

        return match ($command) {
            '/start' => $this->handleStart($chatId, $argument, $from),
            '/stop', '/deconectare' => $this->handleStop($chatId),
            '/status' => $this->handleStatus($chatId),
            '/help', '/ajutor' => $this->handleHelp($chatId),
            default => $this->handleUnknown($chatId),
        };
    }

    /**
     * @param  array<string, mixed>  $from
     */
    private function handleStart(string $chatId, ?string $token, array $from): bool
    {
        if (! $token) {
            $this->sendMessage($chatId, $this->onboardingText());

            return true;
        }

        $user = User::query()
            ->where('telegram_link_token', $token)
            ->where('telegram_link_token_expires_at', '>', now())
            ->first();

        if (! $user) {
            $this->sendMessage($chatId, "⌛️ Linkul de conectare a expirat sau a fost deja folosit.\n\nDeschide din nou pagina <b>Notificări Telegram</b> din aplicație și apasă „Conectează Telegram”.");

            return true;
        }

        // Un chat Telegram poate deservi un singur cont: eliberăm legăturile vechi.
        User::query()
            ->where('telegram_chat_id', $chatId)
            ->whereKeyNot($user->getKey())
            ->update([
                'telegram_chat_id' => null,
                'telegram_username' => null,
                'telegram_linked_at' => null,
            ]);

        $user->forceFill([
            'telegram_chat_id' => $chatId,
            'telegram_username' => $from['username'] ?? null,
            'telegram_linked_at' => now(),
            'telegram_link_token' => null,
            'telegram_link_token_expires_at' => null,
            'telegram_notifications_enabled' => true,
        ])->save();

        $this->sendMessage($chatId, sprintf(
            "✅ Gata, %s! Contul tău telemedconsult.md este conectat.\n\nDe acum primești aici notificările despre programări, consultații, mesaje și plăți.\n\n/status – vezi starea conectării\n/stop – oprește notificările",
            e($user->name),
        ));

        return true;
    }

    private function handleStop(string $chatId): bool
    {
        $user = User::query()->where('telegram_chat_id', $chatId)->first();

        if (! $user) {
            $this->sendMessage($chatId, 'Acest chat nu este conectat la niciun cont.');

            return true;
        }

        $this->unlink($user, notifyUser: false);
        $this->sendMessage($chatId, "🔌 Am deconectat contul. Nu vei mai primi notificări aici.\n\nPoți reconecta oricând din aplicație, pagina <b>Notificări Telegram</b>.");

        return true;
    }

    private function handleStatus(string $chatId): bool
    {
        $user = User::query()->where('telegram_chat_id', $chatId)->first();

        if (! $user) {
            $this->sendMessage($chatId, $this->onboardingText());

            return true;
        }

        $this->sendMessage($chatId, sprintf(
            "👤 Cont: <b>%s</b>\n📧 %s\n🔔 Notificări: %s\n🕐 Conectat: %s",
            e($user->name),
            e((string) $user->email),
            $user->telegram_notifications_enabled ? 'active' : 'oprite din aplicație',
            $user->telegram_linked_at?->format('d.m.Y H:i') ?? '—',
        ));

        return true;
    }

    private function handleHelp(string $chatId): bool
    {
        $this->sendMessage($chatId, "Comenzi disponibile:\n\n/start – conectează contul (folosește linkul din aplicație)\n/status – starea conectării\n/stop – oprește notificările și deconectează contul");

        return true;
    }

    private function handleUnknown(string $chatId): bool
    {
        $this->sendMessage($chatId, 'Nu am înțeles comanda. Scrie /help pentru lista de comenzi.');

        return true;
    }

    private function onboardingText(): string
    {
        $url = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return "👋 Salut! Sunt botul de notificări telemedconsult.md.\n\n"
            .'Ca să primești notificări aici, intră în aplicație → meniul contului → <b>Notificări Telegram</b> '
            ."și apasă „Conectează Telegram”. Te aduce înapoi la mine cu contul deja identificat.\n\n"
            .$url;
    }

    /**
     * @return array{0: string, 1: ?string}
     */
    private function parseCommand(string $text): array
    {
        $parts = preg_split('/\s+/', $text, 2) ?: [];
        // Telegram trimite `/start@numele_botului` în grupuri.
        $command = Str::lower(Str::before($parts[0] ?? '', '@'));
        $argument = isset($parts[1]) && trim($parts[1]) !== '' ? trim($parts[1]) : null;

        return [$command, $argument];
    }

    /**
     * Trimite un mesaj. Întoarce false dacă Telegram a refuzat (bot blocat,
     * chat inexistent), caz în care legătura este curățată automat.
     */
    public function sendMessage(string $chatId, string $text): bool
    {
        if (! $this->token()) {
            return false;
        }

        try {
            $response = Http::timeout(8)->post(self::API.$this->token().'/sendMessage', [
                'chat_id' => $chatId,
                'text' => $text,
                'parse_mode' => 'HTML',
                'disable_web_page_preview' => true,
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Telegram sendMessage failed', ['chat_id' => $chatId, 'error' => $exception->getMessage()]);

            return false;
        }

        if ($response->successful()) {
            return true;
        }

        $this->handleSendFailure($chatId, $response);

        return false;
    }

    /**
     * Dacă utilizatorul a blocat botul sau chatul nu mai există, legătura este
     * moartă: o eliberăm ca să nu mai încercăm la fiecare notificare.
     */
    private function handleSendFailure(string $chatId, Response $response): void
    {
        $code = (int) $response->json('error_code', $response->status());
        $description = (string) $response->json('description', '');

        Log::warning('Telegram sendMessage rejected', [
            'chat_id' => $chatId,
            'error_code' => $code,
            'description' => $description,
        ]);

        if (in_array($code, [400, 403], true)) {
            User::query()
                ->where('telegram_chat_id', $chatId)
                ->update([
                    'telegram_chat_id' => null,
                    'telegram_username' => null,
                    'telegram_linked_at' => null,
                ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function setWebhook(string $url, ?string $secret = null): array
    {
        $response = Http::timeout(10)->post(self::API.$this->token().'/setWebhook', array_filter([
            'url' => $url,
            'secret_token' => $secret ?: $this->webhookSecret(),
            'allowed_updates' => json_encode(['message', 'edited_message']),
            'drop_pending_updates' => true,
        ]));

        return $response->json() ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    public function deleteWebhook(): array
    {
        return Http::timeout(10)->post(self::API.$this->token().'/deleteWebhook')->json() ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    public function webhookInfo(): array
    {
        return Http::timeout(10)->get(self::API.$this->token().'/getWebhookInfo')->json() ?? [];
    }
}
