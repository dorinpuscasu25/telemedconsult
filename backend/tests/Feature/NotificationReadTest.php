<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationReadTest extends TestCase
{
    use RefreshDatabase;

    private function notify(User $user, string $title): string
    {
        $id = (string) Str::uuid();
        $user->notifications()->create([
            'id' => $id,
            'type' => 'App\\Notifications\\AppEventNotification',
            'data' => ['title' => $title, 'body' => 'Corp', 'url' => '/patient/chat'],
        ]);

        return $id;
    }

    public function test_patient_marks_a_single_notification_as_read(): void
    {
        $user = User::factory()->create();
        $first = $this->notify($user, 'Prima');
        $this->notify($user, 'A doua');
        Sanctum::actingAs($user);

        $this->postJson("/api/v1/notifications/{$first}/read")
            ->assertOk()
            ->assertJsonPath('unread_count', 1);

        $this->assertNotNull($user->notifications()->find($first)->read_at);
    }

    public function test_cannot_mark_someone_elses_notification(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $id = $this->notify($owner, 'Privată');
        Sanctum::actingAs($other);

        $this->postJson("/api/v1/notifications/{$id}/read")->assertNotFound();
        $this->assertNull($owner->notifications()->find($id)->read_at);
    }
}
