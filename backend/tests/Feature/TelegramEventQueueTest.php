<?php

namespace Tests\Feature;

use App\Jobs\SendTelegramEvent;
use App\Models\User;
use App\Notifications\AppEventNotification;
use App\Services\FeatureFlags;
use App\Services\TelegramBot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TelegramEventQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_queued_notification_has_absolute_link_and_omits_medical_details(): void
    {
        config(['queue.default' => 'database', 'services.telegram.bot_token' => '123:TEST', 'services.telegram.bot_username' => 'testbot', 'services.frontend_url' => 'https://telemedconsult.example']);
        Queue::fake();
        $user = User::factory()->create(['telegram_chat_id' => '4242']);
        $user->notify(new AppEventNotification('Mesaj nou', 'Detalii medicale private', '/patient/chat?conversation=42'));
        Queue::assertPushed(SendTelegramEvent::class, function ($job) {
            $this->assertStringContainsString('https://telemedconsult.example/patient/chat?conversation=42', $job->text);
            $this->assertStringNotContainsString('Detalii medicale private', $job->text);

            return true;
        });
    }

    public function test_pending_job_does_not_send_after_account_unlinks_or_mutes(): void
    {
        config(['services.telegram.bot_token' => '123:TEST', 'services.telegram.bot_username' => 'testbot']);
        Http::fake();
        $user = User::factory()->create(['telegram_chat_id' => null]);
        (new SendTelegramEvent($user->id, 'old-chat', 'Notificare'))->handle(app(TelegramBot::class), app(FeatureFlags::class));
        Http::assertNothingSent();
    }
}
