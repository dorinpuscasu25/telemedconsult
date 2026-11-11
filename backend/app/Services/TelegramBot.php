<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
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

    /** `polling` = serverul cere singur mesajele; altfel Telegram le trimite pe webhook. */
    public function polling(): bool
    {
        return config('services.telegram.mode') === 'polling';
    }

    public function expectedWebhookUrl(): ?string
    {
        $secret = $this->webhookSecret();
        if (! $secret) {
            return null;
        }
        $base = rtrim((string) (config('services.telegram.webhook_base_url') ?: config('app.url')), '/');

        return $base.'/api/v1/telegram/webhook/'.$secret;
    }

    /**
     * Ce știe Telegram despre bot, pe scurt, pentru admin și pentru reparare.
     *
     * @return array{configured: bool, mode: string, healthy: bool, webhook_set: bool, webhook_matches: bool, pending_updates: int, last_error: ?string, last_error_at: ?string, problem: ?string}
     */
    public function health(): array
    {
        $result = [
            'configured' => $this->configured(), 'mode' => $this->polling() ? 'polling' : 'webhook', 'healthy' => false,
            'webhook_set' => false, 'webhook_matches' => false, 'pending_updates' => 0, 'last_error' => null, 'last_error_at' => null, 'problem' => null,
        ];
        if (! $this->configured()) {
            return [...$result, 'problem' => 'Lipsesc TELEGRAM_BOT_TOKEN sau TELEGRAM_BOT_USERNAME pe server.'];
        }

        try {
            $info = $this->webhookInfo()['result'] ?? null;
        } catch (\Throwable $exception) {
            return [...$result, 'problem' => 'Serverul nu ajunge la Telegram: '.$exception->getMessage()];
        }
        if (! is_array($info)) {
            return [...$result, 'problem' => 'Telegram a refuzat tokenul botului. Verifică TELEGRAM_BOT_TOKEN.'];
        }

        $url = (string) ($info['url'] ?? '');
        $result['webhook_set'] = $url !== '';
        $result['webhook_matches'] = $url !== '' && $url === $this->expectedWebhookUrl();
        $result['pending_updates'] = (int) ($info['pending_update_count'] ?? 0);
        $result['last_error'] = $info['last_error_message'] ?? null;
        $result['last_error_at'] = isset($info['last_error_date']) ? Carbon::createFromTimestamp((int) $info['last_error_date'])->toIso8601String() : null;
        // O eroare mai veche de 10 minute nu mai e de actualitate.
        $recentError = isset($info['last_error_date']) && (int) $info['last_error_date'] > now()->subMinutes(10)->timestamp;

        if ($this->polling()) {
            $result['healthy'] = ! $result['webhook_set'];
            $result['problem'] = $result['webhook_set'] ? 'E pus un webhook, deși serverul citește mesajele singur.' : null;
        } elseif (! $this->webhookSecret()) {
            $result['problem'] = 'Lipsește TELEGRAM_WEBHOOK_SECRET pe server.';
        } elseif (! $result['webhook_matches']) {
            $result['problem'] = $url === '' ? 'Webhook-ul nu e înregistrat: botul nu primește mesajele.' : 'Webhook-ul arată spre altă adresă: '.preg_replace('#/webhook/.+$#', '/webhook/…', $url);
        } elseif ($recentError) {
            $result['problem'] = 'Telegram nu ajunge la server: '.$result['last_error'];
        } else {
            $result['healthy'] = true;
        }

        return $result;
    }

    /**
     * Pune botul în starea corectă: în modul webhook îl (re)înregistrează dacă
     * lipsește sau arată greșit; în modul polling scoate webhook-ul. Rulează
     * din scheduler la câteva minute, deci botul se repară singur.
     *
     * @return array{changed: bool, ok: bool, message: string}
     */
    public function ensure(): array
    {
        if (! $this->configured()) {
            return ['changed' => false, 'ok' => false, 'message' => 'Botul nu e configurat.'];
        }

        $info = $this->webhookInfo()['result'] ?? [];
        $current = (string) ($info['url'] ?? '');

        if ($this->polling()) {
            if ($current === '') {
                return ['changed' => false, 'ok' => true, 'message' => 'Modul polling, fără webhook.'];
            }
            $response = $this->deleteWebhook();

            return ['changed' => true, 'ok' => (bool) ($response['ok'] ?? false), 'message' => 'Am scos webhook-ul pentru modul polling.'];
        }

        $expected = $this->expectedWebhookUrl();
        if (! $expected) {
            return ['changed' => false, 'ok' => false, 'message' => 'Lipsește TELEGRAM_WEBHOOK_SECRET.'];
        }
        if ($current === $expected) {
            return ['changed' => false, 'ok' => true, 'message' => 'Webhook-ul e corect.'];
        }

        $response = $this->setWebhook($expected);
        $ok = (bool) ($response['ok'] ?? false);
        if (! $ok) {
            Log::warning('Telegram setWebhook failed', ['description' => $response['description'] ?? null]);
        }

        return ['changed' => true, 'ok' => $ok, 'message' => $ok ? 'Webhook înregistrat din nou.' : 'Telegram a refuzat webhook-ul: '.($response['description'] ?? 'eroare necunoscută')];
    }

    /**
     * Modul polling: cere mesajele noi și le tratează ca pe cele din webhook.
     * Poziția (offset) se ține în cache, ca un mesaj să nu fie tratat de două ori.
     */
    public function pollUpdates(): int
    {
        if (! $this->configured()) {
            return 0;
        }

        $offset = (int) Cache::get('telegram.update_offset', 0);
        $response = Http::timeout(15)->get(self::API.$this->token().'/getUpdates', array_filter([
            'offset' => $offset ?: null,
            'timeout' => 0,
            'allowed_updates' => json_encode(['message', 'edited_message']),
        ]));
        $updates = $response->json('result');
        if (! is_array($updates)) {
            return 0;
        }

        foreach ($updates as $update) {
            Cache::forever('telegram.update_offset', (int) ($update['update_id'] ?? 0) + 1);
            try {
                $this->handleUpdate($update);
            } catch (\Throwable $exception) {
                Log::error('Telegram update failed', ['error' => $exception->getMessage()]);
            }
        }

        return count($updates);
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
        /** @var array<string, mixed> $from */
        $from = is_array($message['from'] ?? null) ? $message['from'] : [];

        if ($chatId !== '' && is_array($message['contact'] ?? null)) {
            return $this->handleContact($chatId, $message['contact'], $from);
        }

        if ($chatId === '' || $text === '') {
            return false;
        }
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
            $linked = User::query()->where('telegram_chat_id', $chatId)->first();
            if ($linked) {
                $this->sendMessage($chatId, sprintf("✅ Ești deja conectat ca <b>%s</b>. Notificările vin aici.\n\n/status – starea conectării\n/stop – oprește notificările", e($linked->name)));

                return true;
            }
            // Fără link din aplicație: cerem numărul de telefon cu un singur buton.
            $this->sendMessage($chatId, $this->onboardingText(), self::CONTACT_KEYBOARD);

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

        $this->linkChat($user, $chatId, $from);

        return true;
    }

    /** Butonul care trimite numărul de telefon al utilizatorului. */
    private const CONTACT_KEYBOARD = [
        'keyboard' => [[['text' => '📱 Trimite numărul meu', 'request_contact' => true]]],
        'resize_keyboard' => true,
        'one_time_keyboard' => true,
    ];

    /**
     * Conectare fără link: utilizatorul trimite propriul număr, iar dacă un
     * singur cont are acel telefon, chatul se leagă de el.
     *
     * @param  array<string, mixed>  $contact
     * @param  array<string, mixed>  $from
     */
    private function handleContact(string $chatId, array $contact, array $from): bool
    {
        // Doar numărul propriu: un contact trimis de altcineva nu conectează nimic.
        if (! isset($contact['user_id'], $from['id']) || (string) $contact['user_id'] !== (string) $from['id']) {
            $this->sendMessage($chatId, 'Trimite numărul tău cu butonul de mai jos, nu contactul altei persoane.', self::CONTACT_KEYBOARD);

            return true;
        }

        $phone = self::nationalPhone((string) ($contact['phone_number'] ?? ''));
        // Telefonul e salvat în formate diferite (spații, +373, 0), deci comparăm după normalizare.
        $matches = strlen($phone) < 6 ? collect() : User::query()
            ->whereNotNull('phone')
            ->get(['id', 'name', 'phone'])
            ->filter(fn (User $user) => self::nationalPhone((string) $user->phone) === $phone)
            ->values();

        if ($matches->count() !== 1) {
            $url = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            $this->sendMessage($chatId, ($matches->isEmpty()
                ? "Nu am găsit niciun cont cu acest număr de telefon.\n\n"
                : "Acest număr apare la mai multe conturi, așa că nu știu pe care să-l conectez.\n\n")
                ."Intră în aplicație → <b>Notificări Telegram</b> → „Conectează Telegram”. Linkul de acolo te conectează sigur.\n\n".$url, ['remove_keyboard' => true]);

            return true;
        }

        $this->linkChat(User::findOrFail($matches->first()->id), $chatId, $from);

        return true;
    }

    /**
     * @param  array<string, mixed>  $from
     */
    private function linkChat(User $user, string $chatId, array $from): void
    {
        // Un chat Telegram poate deservi un singur cont: eliberăm legăturile vechi.
        User::query()
            ->where('telegram_chat_id', $chatId)
            ->whereKeyNot($user->getKey())
            ->update(['telegram_chat_id' => null, 'telegram_username' => null, 'telegram_linked_at' => null]);

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
        ), ['remove_keyboard' => true]);
    }

    /** Telefonul fără prefix de țară și fără zero: 069123456, +37369123456 → 69123456. */
    public static function nationalPhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (str_starts_with($digits, '373') && strlen($digits) > 9) {
            $digits = substr($digits, 3);
        }

        return ltrim($digits, '0');
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
            ."Apasă butonul <b>📱 Trimite numărul meu</b> de mai jos și te conectez la contul cu acest telefon.\n\n"
            .'Sau, din aplicație: <b>Notificări Telegram</b> → „Conectează Telegram”.'."\n".$url;
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
    /**
     * @param  array<string, mixed>|null  $replyMarkup  tastatură sau butoane sub mesaj
     */
    public function sendMessage(string $chatId, string $text, ?array $replyMarkup = null): bool
    {
        if (! $this->token()) {
            return false;
        }

        try {
            $response = Http::timeout(8)->post(self::API.$this->token().'/sendMessage', array_filter([
                'chat_id' => $chatId,
                'text' => $text,
                'parse_mode' => 'HTML',
                'disable_web_page_preview' => true,
                'reply_markup' => $replyMarkup ? json_encode($replyMarkup) : null,
            ], fn ($value) => $value !== null));
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
