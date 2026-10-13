<?php

namespace Tests\Feature;

use App\Jobs\CloseConsultationVideo;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\FeatureFlags;
use App\Services\LiveKitService;
use App\Services\PlatformConfig;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationVideoTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret-for-livekit-at-least-32-characters';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.livekit.url' => 'wss://test.livekit.cloud', 'services.livekit.api_key' => 'test-key', 'services.livekit.api_secret' => self::SECRET]);
        Queue::fake();
        Http::preventStrayRequests();
    }

    public function test_participants_receive_signed_tokens_for_same_room(): void
    {
        [$patient, $doctor, $consultation] = $this->scenario();
        $tokens = [];
        foreach ([$patient, $doctor] as $user) {
            Sanctum::actingAs($user);
            $response = $this->postJson($this->endpoint($consultation))->assertOk()->assertJsonPath('server_url', 'wss://test.livekit.cloud');
            $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
            $claims = JWT::decode($response->json('participant_token'), new Key(self::SECRET, 'HS256'));
            $this->assertSame('test-key', $claims->iss);
            $this->assertTrue($claims->video->roomJoin);
            $this->assertTrue($claims->video->canPublish);
            $this->assertTrue($claims->video->canSubscribe);
            $this->assertFalse(isset($claims->video->roomAdmin));
            $this->assertLessThanOrEqual(300, $claims->exp - $claims->iat);
            $this->assertStringNotContainsString($user->email, $claims->sub);
            $tokens[] = $claims;
        }
        $this->assertSame($tokens[0]->video->room, $tokens[1]->video->room);
        $this->assertNotSame($tokens[0]->sub, $tokens[1]->sub);
    }

    public function test_unrelated_user_cannot_read_status_or_obtain_token(): void
    {
        [, , $consultation] = $this->scenario();
        Sanctum::actingAs($this->userWithRole('doctor'));
        $this->getJson($this->endpoint($consultation, false))->assertForbidden();
        $this->postJson($this->endpoint($consultation))->assertForbidden();
    }

    public function test_selected_patient_and_doctor_names_are_authoritative_in_context_and_tokens(): void
    {
        [$patient, $doctor, $consultation] = $this->scenario();
        $patient->update(['name' => 'Contul părintelui']);
        $consultation->patientProfile->update(['first_name' => 'Ana', 'last_name' => 'Exemplu']);
        $doctor->update(['name' => 'Elena Medic']);
        foreach ([[$patient, 'Ana Exemplu', 'patient'], [$doctor, 'Elena Medic', 'doctor']] as [$user, $name, $role]) {
            Sanctum::actingAs($user);
            $this->getJson($this->endpoint($consultation, false))->assertOk()
                ->assertJsonPath('participant.name', $name)->assertJsonPath('participant.role', $role)
                ->assertJsonPath('consultation.participants.0.name', 'Ana Exemplu')
                ->assertJsonMissingPath('consultation.patient_profile')->assertJsonMissingPath('consultation.participants.0.email');
            $response = $this->postJson($this->endpoint($consultation), ['username' => 'Nume fals', 'role' => 'admin'])->assertOk()->assertJsonPath('participant.name', $name);
            $claims = JWT::decode($response->json('participant_token'), new Key(self::SECRET, 'HS256'));
            $this->assertSame($name, $claims->name);
            $this->assertSame($role, $claims->attributes->role);
            $this->assertFalse($claims->video->canUpdateOwnMetadata);
            $this->assertStringNotContainsString($name, $claims->sub);
            $this->assertStringNotContainsString($name, $claims->video->room);
        }
    }

    public function test_legacy_patient_name_falls_back_to_account_and_operator_uses_own_name(): void
    {
        [$patient, , $consultation] = $this->scenario();
        $consultation->update(['patient_profile_id' => null]);
        Sanctum::actingAs($patient);
        $this->getJson($this->endpoint($consultation, false))->assertOk()->assertJsonPath('participant.name', $patient->name);
        $operator = $this->userWithRole('operator');
        $consultation->update(['operator_id' => $operator->id, 'consultation_kind' => 'with_exam', 'objective_data_completed_at' => now()]);
        Sanctum::actingAs($operator);
        $response = $this->postJson($this->endpoint($consultation))->assertOk()->assertJsonPath('participant.name', $operator->name);
        $claims = JWT::decode($response->json('participant_token'), new Key(self::SECRET, 'HS256'));
        $this->assertSame($operator->name, $claims->name);
        $this->assertSame('operator', $claims->attributes->role);
    }

    public function test_call_chat_is_persistent_and_private(): void
    {
        [$patient, $doctor, $consultation] = $this->scenario();
        $chat = Conversation::create(['consultation_request_id' => $consultation->id, 'patient_id' => $patient->id, 'doctor_id' => $doctor->id, 'patient_profile_id' => $consultation->patient_profile_id, 'status' => 'open']);
        Sanctum::actingAs($patient);
        $this->getJson($this->endpoint($consultation, false))->assertOk()->assertJsonPath('consultation.conversation_id', $chat->id);
        $this->getJson('/api/v1/conversations/'.$chat->id)->assertOk()
            ->assertJsonPath('data.chat.can_write', true)
            ->assertJsonPath('data.chat.message', null);
        $consultation->update(['doctor_started_at' => now()]);
        $this->postJson('/api/v1/conversations/'.$chat->id.'/messages', ['body' => 'Mesaj din consultația video'])->assertCreated();
        Sanctum::actingAs($doctor);
        $this->getJson('/api/v1/conversations/'.$chat->id)->assertOk()->assertJsonPath('data.messages.0.body', 'Mesaj din consultația video')
            ->assertJsonPath('data.chat.can_write', true)->assertJsonMissingPath('data.messages.0.sender.email');
        $this->assertDatabaseHas('messages', ['conversation_id' => $chat->id, 'body' => 'Mesaj din consultația video']);
        Sanctum::actingAs($this->userWithRole('patient'));
        $this->getJson('/api/v1/conversations/'.$chat->id)->assertForbidden();
    }

    public function test_guest_cannot_obtain_token(): void
    {
        [, , $consultation] = $this->scenario();
        $this->postJson($this->endpoint($consultation))->assertUnauthorized();
    }

    public function test_pending_and_terminal_consultations_cannot_be_joined(): void
    {
        [$patient, , $consultation] = $this->scenario();
        Sanctum::actingAs($patient);
        foreach (['new', 'rescheduled', 'completed', 'cancelled', 'rejected', 'expired'] as $status) {
            $consultation->forceFill(['status' => $status])->save();
            $this->postJson($this->endpoint($consultation))->assertUnprocessable();
        }
        $consultation->forceFill(['status' => 'accepted', 'conclusion_sent_at' => now()])->save();
        $this->postJson($this->endpoint($consultation))->assertUnprocessable();
    }

    public function test_missing_configuration_is_reported_without_credentials(): void
    {
        [$patient, , $consultation] = $this->scenario();
        Sanctum::actingAs($patient);
        config(['services.livekit.api_secret' => null]);
        $this->getJson($this->endpoint($consultation, false))->assertOk()->assertJsonPath('configured', false);
        $this->postJson($this->endpoint($consultation))->assertStatus(503)->assertJsonMissingPath('participant_token');
    }

    public function test_assigned_operator_can_join_only_after_examination(): void
    {
        [, , $consultation] = $this->scenario();
        $operator = $this->userWithRole('operator');
        $consultation->forceFill(['operator_id' => $operator->id, 'consultation_kind' => 'with_exam'])->save();
        Sanctum::actingAs($operator);
        $this->postJson($this->endpoint($consultation))->assertUnprocessable();
        $consultation->forceFill(['objective_data_completed_at' => now()])->save();
        $this->postJson($this->endpoint($consultation))->assertOk();
        $consultation->forceFill(['consultation_kind' => 'video'])->save();
        $this->postJson($this->endpoint($consultation))->assertForbidden();
    }

    public function test_existing_consultation_remains_joinable_when_new_requests_disabled(): void
    {
        [$patient, , $consultation] = $this->scenario();
        app(PlatformConfig::class)->upsert('feature.video_consultations', false, FeatureFlags::GROUP, 'boolean');
        Sanctum::actingAs($patient);
        $this->postJson($this->endpoint($consultation))->assertOk();
    }

    public function test_only_selected_doctor_can_accept_direct_consultation(): void
    {
        [$patient, $doctor, $consultation] = $this->scenario();
        $consultation->forceFill(['status' => 'new', 'acceptance_expires_at' => now()->addMinutes(15)])->save();
        foreach (['doctor', 'operator'] as $role) {
            Sanctum::actingAs($this->userWithRole($role));
            $this->postJson('/api/v1/requests/'.$consultation->id.'/accept')->assertForbidden();
        }
        $this->assertSame($doctor->id, $consultation->refresh()->doctor_id);
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$consultation->id.'/accept')->assertOk();
        Sanctum::actingAs($patient);
        $this->postJson($this->endpoint($consultation))->assertOk();
    }

    public function test_operator_can_still_accept_an_unassigned_operator_request(): void
    {
        [, , $consultation] = $this->scenario();
        $operator = $this->userWithRole('operator');
        $consultation->forceFill([
            'status' => 'new', 'type' => 'operator', 'doctor_id' => null,
            'consultation_kind' => 'with_exam', 'acceptance_expires_at' => now()->addMinutes(15),
        ])->save();
        Sanctum::actingAs($operator);
        $this->postJson('/api/v1/requests/'.$consultation->id.'/accept')->assertOk();
        $this->assertSame($operator->id, $consultation->refresh()->operator_id);
    }

    public function test_finalization_queues_closure_and_blocks_new_tokens(): void
    {
        [$patient, $doctor, $consultation] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$consultation->id.'/complete', ['diagnosis' => 'Concluzie'])->assertSuccessful();
        Queue::assertPushed(CloseConsultationVideo::class, fn ($job) => $job->consultationRequestId === $consultation->id);
        Sanctum::actingAs($patient);
        $this->postJson($this->endpoint($consultation))->assertUnprocessable();
    }

    public function test_cancellation_queues_closure(): void
    {
        [$patient, , $consultation] = $this->scenario();
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/'.$consultation->id.'/cancel')->assertSuccessful();
        Queue::assertPushed(CloseConsultationVideo::class);
    }

    public function test_closure_uses_server_grant_and_tolerates_absent_room(): void
    {
        [, , $consultation] = $this->scenario();
        $consultation->forceFill(['status' => 'completed'])->save();
        Http::fake(['https://test.livekit.cloud/*' => Http::response([], 404)]);
        (new CloseConsultationVideo($consultation->id))->handle(app(LiveKitService::class));
        Http::assertSentCount(3);
        Http::assertSent(function ($request) {
            if (! str_ends_with($request->url(), '/RemoveParticipant')) {
                return false;
            }
            $claims = JWT::decode(substr($request->header('Authorization')[0], 7), new Key(self::SECRET, 'HS256'));

            return $claims->video->roomAdmin === true && $request['revoke_token_ts'] >= now()->timestamp;
        });
        Http::assertSent(function ($request) use ($consultation) {
            $claims = JWT::decode(substr($request->header('Authorization')[0], 7), new Key(self::SECRET, 'HS256'));

            return $request->url() === 'https://test.livekit.cloud/twirp/livekit.RoomService/DeleteRoom'
                && $request['room'] === app(LiveKitService::class)->roomName($consultation)
                && ($claims->video->roomCreate ?? false) === true;
        });
    }

    public function test_closure_job_does_not_close_active_consultation(): void
    {
        [, , $consultation] = $this->scenario();
        (new CloseConsultationVideo($consultation->id))->handle(app(LiveKitService::class));
        Http::assertNothingSent();
    }

    private function endpoint(ConsultationRequest $consultation, bool $token = true): string
    {
        return '/api/v1/requests/'.$consultation->id.'/video'.($token ? '/token' : '');
    }

    private function userWithRole(string $role): User
    {
        $user = User::factory()->create(['status' => 'active']);
        $user->roles()->attach(Role::firstOrCreate(['name' => $role], ['label' => $role]));

        return $user;
    }

    private function scenario(): array
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'consultation_price' => 400]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'A', 'last_name' => 'B', 'identity_number' => '2', 'status' => 'active']);
        $consultation = ConsultationRequest::create([
            'patient_id' => $patient->id, 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id,
            'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Test',
        ]);

        return [$patient, $doctor, $consultation];
    }
}
