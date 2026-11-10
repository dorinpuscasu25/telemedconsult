<?php

namespace Tests\Feature;

use App\Jobs\SendTelegramEvent;
use App\Models\ConsultationRequest;
use App\Models\PatientProfile;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TelegramCategoriesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['queue.default' => 'database', 'services.telegram.bot_token' => '123:TEST', 'services.telegram.bot_username' => 'testbot']);
    }

    public function test_user_chooses_categories_and_muted_ones_are_not_sent(): void
    {
        Queue::fake();
        $user = User::factory()->create(['telegram_chat_id' => '4242']);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/telegram/status')->assertOk()
            ->assertJsonPath('data.categories.messages', true)
            ->assertJsonPath('data.categories.reminders', false);
        $this->postJson('/api/v1/telegram/preferences', ['categories' => ['messages' => false, 'unknown' => true]])->assertOk()
            ->assertJsonPath('data.categories.messages', false)
            ->assertJsonPath('data.categories.requests', true);

        $user->refresh()->notify(new AppEventNotification('Mesaj nou', 'x', '/doctor/chat'));
        Queue::assertNothingPushed();

        $user->notify(new AppEventNotification('Consultație nouă', 'x', '/doctor/consultations'));
        Queue::assertPushed(SendTelegramEvent::class, 1);
    }

    public function test_reminder_goes_once_fifteen_minutes_before_a_confirmed_consultation(): void
    {
        Queue::fake();
        $doctor = User::factory()->create(['telegram_chat_id' => '77', 'telegram_preferences' => ['reminders' => true]]);
        $patient = User::factory()->create();
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Pop', 'status' => 'active']);
        ConsultationRequest::create([
            'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'type' => 'video',
            'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Tuse', 'scheduled_at' => CarbonImmutable::now()->addMinutes(10),
        ]);

        $this->artisan('consultations:remind')->assertSuccessful();
        $this->artisan('consultations:remind')->assertSuccessful();

        Queue::assertPushed(SendTelegramEvent::class, 1);
        $this->assertSame(1, $doctor->notifications()->count());
    }
}
