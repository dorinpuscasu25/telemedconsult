<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\TelegramBot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Botul fără pași manuali: conectare cu numărul de telefon, webhook care se
 * repară singur și modul polling pentru servere fără domeniu public.
 */
class TelegramSelfServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.url' => 'https://api.telemed.test',
            'services.telegram.bot_token' => '123:TEST',
            'services.telegram.bot_username' => 'telemedconsult_bot',
            'services.telegram.webhook_secret' => 'sekret',
            'services.telegram.mode' => 'webhook',
        ]);
    }

    public function test_plain_start_offers_the_phone_button(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => []])]);

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->message(['text' => '/start']))->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), '/sendMessage')
            && str_contains((string) $request['reply_markup'], 'request_contact'));
    }

    public function test_sharing_own_phone_links_the_matching_account(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => []])]);
        $user = User::factory()->create(['phone' => '069 123 456']);
        User::factory()->create(['phone' => '+37368000000']);

        $this->postJson('/api/v1/telegram/webhook/sekret', $this->message(['contact' => ['phone_number' => '+37369123456', 'user_id' => 555]]))->assertOk();

        $this->assertSame('555', $user->refresh()->telegram_chat_id);
        Http::assertSent(fn ($request) => str_contains((string) ($request['text'] ?? ''), 'este conectat'));
    }

    public function test_someone_elses_contact_or_unknown_phone_links_nothing(): void
    {
        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => []])]);
        $user = User::factory()->create(['phone' => '069123456']);

        // Contactul altcuiva (user_id diferit de expeditor).
        $this->postJson('/api/v1/telegram/webhook/sekret', $this->message(['contact' => ['phone_number' => '+37369123456', 'user_id' => 999]]))->assertOk();
        $this->assertNull($user->refresh()->telegram_chat_id);

        // Numărul propriu, dar fără cont.
        $this->postJson('/api/v1/telegram/webhook/sekret', $this->message(['contact' => ['phone_number' => '+37360000000', 'user_id' => 555]]))->assertOk();
        $this->assertNull($user->refresh()->telegram_chat_id);
        Http::assertSent(fn ($request) => str_contains((string) ($request['text'] ?? ''), 'Nu am găsit'));
    }

    public function test_ensure_reregisters_a_lost_webhook_and_leaves_a_good_one(): void
    {
        Http::fake([
            'api.telegram.org/*/getWebhookInfo' => Http::sequence()
                ->push(['ok' => true, 'result' => ['url' => '', 'pending_update_count' => 3]])
                ->push(['ok' => true, 'result' => ['url' => 'https://api.telemed.test/api/v1/telegram/webhook/sekret']]),
            'api.telegram.org/*/setWebhook' => Http::response(['ok' => true, 'result' => true]),
        ]);

        $this->artisan('telegram:webhook ensure')->assertSuccessful();
        Http::assertSent(fn ($request) => str_contains($request->url(), '/setWebhook')
            && $request['url'] === 'https://api.telemed.test/api/v1/telegram/webhook/sekret');

        $this->artisan('telegram:webhook ensure')->assertSuccessful();
        Http::assertSentCount(3);
    }

    public function test_polling_mode_reads_updates_once(): void
    {
        config(['services.telegram.mode' => 'polling']);
        Cache::flush();
        $user = User::factory()->create();
        $token = app(TelegramBot::class)->issueLinkToken($user)['token'];
        Http::fake([
            'api.telegram.org/*/getUpdates*' => Http::sequence()
                ->push(['ok' => true, 'result' => [[...$this->message(['text' => '/start '.$token]), 'update_id' => 40]]])
                ->push(['ok' => true, 'result' => []]),
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => []]),
        ]);

        $this->artisan('telegram:poll')->assertSuccessful();
        $this->assertSame('555', $user->refresh()->telegram_chat_id);
        $this->assertSame(41, Cache::get('telegram.update_offset'));

        $this->artisan('telegram:poll')->assertSuccessful();
        Http::assertSent(fn ($request) => str_contains($request->url(), 'getUpdates') && str_contains($request->url(), 'offset=41'));
    }

    public function test_admin_sees_why_the_bot_is_silent(): void
    {
        Http::fake(['api.telegram.org/*/getWebhookInfo' => Http::response(['ok' => true, 'result' => ['url' => 'https://old.example/api/v1/telegram/webhook/x', 'pending_update_count' => 7]])]);
        $admin = User::factory()->create();
        $admin->roles()->sync([Role::firstOrCreate(['name' => 'admin'], ['label' => 'Admin'])->id]);
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/admin/telegram/bot')->assertOk()
            ->assertJsonPath('data.healthy', false)
            ->assertJsonPath('data.webhook_matches', false)
            ->assertJsonPath('data.pending_updates', 7);
    }

    public function test_phone_normalization(): void
    {
        $this->assertSame('69123456', TelegramBot::nationalPhone('+373 69 123 456'));
        $this->assertSame('69123456', TelegramBot::nationalPhone('069123456'));
        $this->assertSame('69123456', TelegramBot::nationalPhone('37369123456'));
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function message(array $extra): array
    {
        return [
            'update_id' => 1,
            'message' => [
                'message_id' => 1,
                'chat' => ['id' => 555, 'type' => 'private'],
                'from' => ['id' => 555, 'username' => 'ionpopescu', 'first_name' => 'Ion'],
                ...$extra,
            ],
        ];
    }
}
