<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\AppEventNotification;
use App\Services\PlatformConfig;
use App\Services\TelegramBot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TelegramLinkTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.telegram.bot_token' => '123:TEST',
            'services.telegram.bot_username' => 'telemedconsult_bot',
            'services.telegram.webhook_secret' => 'sekret',
        ]);
    }

    /**
     * Primul stub înregistrat câștigă, deci fake-ul se declară per test, nu în
     * setUp, ca testele de eroare să poată impune propriul răspuns.
     *
     * @param  array<string, mixed>  $body
     */
    private function fakeTelegram(array $body = ['ok' => true, 'result' => []], int $status = 200): void
    {
        Http::fake(['api.telegram.org/*' => Http::response($body, $status)]);
    }

    public function test_status_reports_disconnected_account(): void
    {
        $this->fakeTelegram();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/telegram/status')
            ->assertOk()
            ->assertJsonPath('data.linked', false)
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.bot_username', 'telemedconsult_bot')
            ->assertJsonPath('data.deep_link', null);
    }

    public function test_link_issues_a_deep_link_with_a_one_time_token(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/telegram/link')->assertOk();

        $token = $user->refresh()->telegram_link_token;

        $this->assertNotNull($token);
        $this->assertSame(
            'https://t.me/telemedconsult_bot?start='.$token,
            $response->json('data.deep_link'),
        );
        $this->assertTrue($user->telegram_link_token_expires_at->isFuture());
    }

    public function test_link_reuses_a_still_valid_token(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $first = $this->postJson('/api/v1/telegram/link')->json('data.deep_link');
        $second = $this->postJson('/api/v1/telegram/link')->json('data.deep_link');

        $this->assertSame($first, $second);
    }

    public function test_webhook_start_command_links_the_account(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create();
        $token = app(TelegramBot::class)->issueLinkToken($user)['token'];

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->startUpdate($token, chatId: 555))
            ->assertOk();

        $user->refresh();

        $this->assertSame('555', $user->telegram_chat_id);
        $this->assertSame('ionpopescu', $user->telegram_username);
        $this->assertNotNull($user->telegram_linked_at);
        $this->assertNull($user->telegram_link_token);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/sendMessage')
            && $request['chat_id'] === '555'
            && str_contains((string) $request['text'], 'este conectat'));
    }

    public function test_expired_token_does_not_link_the_account(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create();
        $token = app(TelegramBot::class)->issueLinkToken($user)['token'];

        $this->travel(TelegramBot::TOKEN_TTL_MINUTES + 1)->minutes();

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->startUpdate($token))->assertOk();

        $this->assertNull($user->refresh()->telegram_chat_id);
    }

    public function test_token_cannot_be_reused_for_a_second_account(): void
    {
        $this->fakeTelegram();
        $first = User::factory()->create();
        $second = User::factory()->create();
        $token = app(TelegramBot::class)->issueLinkToken($first)['token'];

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->startUpdate($token, chatId: 111))->assertOk();
        $this->postJson('/api/v1/telegram/webhook/sekret', $this->startUpdate($token, chatId: 222))->assertOk();

        $this->assertSame('111', $first->refresh()->telegram_chat_id);
        $this->assertNull($second->refresh()->telegram_chat_id);
    }

    public function test_linking_a_chat_releases_it_from_another_account(): void
    {
        $this->fakeTelegram();
        $old = User::factory()->create(['telegram_chat_id' => '777', 'telegram_linked_at' => now()]);
        $new = User::factory()->create();
        $token = app(TelegramBot::class)->issueLinkToken($new)['token'];

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->startUpdate($token, chatId: 777))->assertOk();

        $this->assertNull($old->refresh()->telegram_chat_id);
        $this->assertSame('777', $new->refresh()->telegram_chat_id);
    }

    public function test_stop_command_unlinks_the_account(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create(['telegram_chat_id' => '999', 'telegram_linked_at' => now()]);

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->update('/stop', 999))->assertOk();

        $this->assertNull($user->refresh()->telegram_chat_id);
    }

    public function test_webhook_rejects_a_wrong_secret(): void
    {
        $this->fakeTelegram();
        $this->postJson('/api/v1/telegram/webhook/gresit', $this->update('/status'))->assertNotFound();
    }

    public function test_webhook_rejects_a_mismatched_secret_header(): void
    {
        $this->fakeTelegram();
        $this->postJson(
            '/api/v1/telegram/webhook/sekret',
            $this->update('/status'),
            ['X-Telegram-Bot-Api-Secret-Token' => 'altceva'],
        )->assertForbidden();
    }

    public function test_user_can_unlink_from_the_app(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create(['telegram_chat_id' => '321', 'telegram_linked_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/telegram/unlink')
            ->assertOk()
            ->assertJsonPath('data.linked', false);

        $this->assertNull($user->refresh()->telegram_chat_id);
    }

    public function test_notification_reaches_a_linked_user(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create(['telegram_chat_id' => '4242', 'telegram_linked_at' => now()]);

        $user->notify(new AppEventNotification('Programare nouă', 'Ai o consultație pe 10 august.'));

        Http::assertSent(fn ($request) => str_contains($request->url(), '/sendMessage')
            && $request['chat_id'] === '4242'
            && str_contains((string) $request['text'], 'Programare nouă'));
    }

    public function test_notification_is_skipped_when_the_user_muted_telegram(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create([
            'telegram_chat_id' => '4242',
            'telegram_notifications_enabled' => false,
        ]);

        $user->notify(new AppEventNotification('Programare nouă', 'Detalii.'));

        Http::assertNothingSent();
    }

    public function test_notification_is_skipped_when_the_feature_flag_is_off(): void
    {
        $this->fakeTelegram();
        app(PlatformConfig::class)->upsert('feature.telegram_notifications', false, 'features', 'boolean');

        $user = User::factory()->create(['telegram_chat_id' => '4242']);
        $user->notify(new AppEventNotification('Programare nouă', 'Detalii.'));

        Http::assertNothingSent();
    }

    public function test_blocked_bot_clears_the_link(): void
    {
        $this->fakeTelegram([
            'ok' => false,
            'error_code' => 403,
            'description' => 'Forbidden: bot was blocked by the user',
        ], status: 403);

        $user = User::factory()->create(['telegram_chat_id' => '4242', 'telegram_linked_at' => now()]);
        $user->notify(new AppEventNotification('Programare nouă', 'Detalii.'));

        $this->assertNull($user->refresh()->telegram_chat_id);
    }

    public function test_preferences_toggle_mutes_the_channel(): void
    {
        $this->fakeTelegram();
        $user = User::factory()->create(['telegram_chat_id' => '4242']);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/telegram/preferences', ['enabled' => false])
            ->assertOk()
            ->assertJsonPath('data.notifications_enabled', false);

        $this->assertFalse($user->refresh()->telegram_notifications_enabled);
    }

    /**
     * @return array<string, mixed>
     */
    private function startUpdate(string $token, int $chatId = 555): array
    {
        return $this->update('/start '.$token, $chatId);
    }

    /**
     * @return array<string, mixed>
     */
    private function update(string $text, int $chatId = 555): array
    {
        return [
            'update_id' => 1,
            'message' => [
                'message_id' => 1,
                'chat' => ['id' => $chatId, 'type' => 'private'],
                'from' => ['id' => $chatId, 'username' => 'ionpopescu', 'first_name' => 'Ion'],
                'text' => $text,
            ],
        ];
    }
}
