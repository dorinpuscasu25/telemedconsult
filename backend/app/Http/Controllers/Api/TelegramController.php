<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\FeatureFlags;
use App\Services\TelegramBot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TelegramController extends Controller
{
    public function __construct(private readonly TelegramBot $bot) {}

    /**
     * Starea conectării pentru utilizatorul curent. Pagina din aplicație face
     * poll pe acest endpoint cât timp așteaptă apăsarea butonului Start în bot.
     */
    public function status(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->payload($request->user())]);
    }

    /**
     * Emite un deep-link proaspăt. Un token vechi încă valid este refolosit, ca
     * refresh-ul paginii să nu invalideze linkul deja deschis pe telefon.
     */
    public function link(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $this->bot->configured()) {
            return response()->json(['message' => 'Botul de Telegram nu este configurat pe server.'], 503);
        }

        if ($user->telegram_chat_id) {
            return response()->json([
                'message' => 'Contul este deja conectat la Telegram.',
                'data' => $this->payload($user),
            ], 409);
        }

        $stillValid = $user->telegram_link_token
            && $user->telegram_link_token_expires_at
            && $user->telegram_link_token_expires_at->isAfter(now()->addMinutes(2));

        if (! $stillValid || $request->boolean('refresh')) {
            $this->bot->issueLinkToken($user);
        }

        return response()->json(['data' => $this->payload($user->refresh())]);
    }

    public function unlink(Request $request): JsonResponse
    {
        $this->bot->unlink($request->user());

        return response()->json([
            'message' => 'Telegram deconectat.',
            'data' => $this->payload($request->user()->refresh()),
        ]);
    }

    /**
     * Comutatorul per utilizator: păstrează legătura, dar oprește trimiterile.
     */
    public function preferences(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
        ]);

        $user = $request->user();
        $user->forceFill(['telegram_notifications_enabled' => $validated['enabled']])->save();

        return response()->json(['data' => $this->payload($user->refresh())]);
    }

    /**
     * Trimite un mesaj de probă, ca utilizatorul să vadă imediat că merge.
     */
    public function test(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->telegram_chat_id) {
            return response()->json(['message' => 'Contul nu este conectat la Telegram.'], 422);
        }

        $sent = $this->bot->sendMessage(
            $user->telegram_chat_id,
            "🔔 Mesaj de test de la telemedconsult.md.\nDacă îl vezi, notificările funcționează."
        );

        if (! $sent) {
            return response()->json([
                'message' => 'Nu am putut trimite mesajul. Verifică dacă botul nu este blocat, apoi reconectează.',
                'data' => $this->payload($user->refresh()),
            ], 502);
        }

        return response()->json(['message' => 'Mesaj de test trimis.']);
    }

    /**
     * Webhook-ul botului. Ruta este publică (Telegram nu poate autentifica), dar
     * este protejată de secretul din URL plus antetul semnat de Telegram.
     */
    public function webhook(Request $request, string $secret): JsonResponse
    {
        $expected = $this->bot->webhookSecret();

        if (! $expected || ! hash_equals($expected, $secret)) {
            abort(404);
        }

        $header = (string) $request->header('X-Telegram-Bot-Api-Secret-Token', '');

        if ($header !== '' && ! hash_equals($expected, $header)) {
            abort(403);
        }

        $this->bot->handleUpdate($request->all());

        // Telegram reia livrarea la orice răspuns non-2xx, așa că întoarcem
        // mereu 200 chiar dacă update-ul nu ne interesează.
        return response()->json(['ok' => true]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(User $user): array
    {
        $linked = (bool) $user->telegram_chat_id;
        $tokenValid = $user->telegram_link_token
            && $user->telegram_link_token_expires_at
            && $user->telegram_link_token_expires_at->isFuture();

        return [
            'configured' => $this->bot->configured(),
            'feature_enabled' => app(FeatureFlags::class)->enabled('telegram_notifications'),
            'bot_username' => $this->bot->username(),
            'linked' => $linked,
            'telegram_username' => $user->telegram_username,
            'linked_at' => $user->telegram_linked_at,
            'notifications_enabled' => (bool) $user->telegram_notifications_enabled,
            'deep_link' => ! $linked && $tokenValid ? $this->bot->deepLink($user->telegram_link_token) : null,
            'token_expires_at' => ! $linked && $tokenValid ? $user->telegram_link_token_expires_at : null,
        ];
    }
}
