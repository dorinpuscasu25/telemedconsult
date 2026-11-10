<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorAvailability;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationProposalFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $doctor;

    private User $patientUser;

    private PatientProfile $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 09:50', 'Europe/Chisinau')->utc());

        $this->doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $this->doctor->id, 'is_approved' => true, 'is_available' => true, 'video_price' => 300]);
        foreach ([Carbon::MONDAY, Carbon::TUESDAY, Carbon::WEDNESDAY, Carbon::THURSDAY, Carbon::FRIDAY] as $day) {
            DoctorAvailability::create(['doctor_id' => $this->doctor->id, 'weekday' => $day, 'starts_at' => '09:00:00', 'ends_at' => '18:00:00', 'is_active' => true]);
        }

        $this->patientUser = $this->userWithRole('patient');
        Wallet::create(['user_id' => $this->patientUser->id, 'type' => 'real', 'balance_minor' => 125000, 'currency' => 'MDL']);
        $this->patient = PatientProfile::create(['user_id' => $this->patientUser->id, 'first_name' => 'Ana', 'last_name' => 'Puscasu', 'status' => 'active', 'active_until' => now()->addYear()]);
    }

    public function test_new_request_gets_a_two_hour_reply_deadline_and_expires_with_refund(): void
    {
        $item = $this->book('2026-11-11 10:30');
        $this->assertSame('new', $item->status);
        $this->assertTrue($item->doctor_reply_due_at->equalTo(now()->addHours(2)));

        $this->travel(121)->minutes();
        Sanctum::actingAs($this->doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.stage', 'expired');

        $this->assertSame(125000, $this->balance());
    }

    public function test_doctor_proposes_up_to_three_slots_and_patient_picks_one(): void
    {
        $item = $this->book('2026-11-11 10:30');
        Sanctum::actingAs($this->doctor);

        $this->postJson("/api/v1/requests/{$item->id}/propose-time", ['slots' => $this->slots('2026-11-11 11:00', '2026-11-11 11:30', '2026-11-12 10:00', '2026-11-12 10:30')])
            ->assertUnprocessable();

        $this->postJson("/api/v1/requests/{$item->id}/propose-time", ['slots' => $this->slots('2026-11-12 10:00', '2026-11-11 11:00'), 'note' => 'Pot doar după-amiază.'])
            ->assertOk()
            ->assertJsonPath('request.stage', 'prop')
            ->assertJsonCount(2, 'request.proposal.slots')
            ->assertJsonPath('request.proposal.note', 'Pot doar după-amiază.')
            ->assertJsonPath('request.proposal.is_reschedule', false);

        // 24 h, dar cel târziu cu 2 h înainte de prima oră (mâine 11:00 → 09:00).
        $this->assertSame('2026-11-11 09:00', $item->fresh()->proposal_expires_at->setTimezone('Europe/Chisinau')->format('Y-m-d H:i'));

        Sanctum::actingAs($this->patientUser);
        $this->postJson("/api/v1/requests/{$item->id}/accept-proposed-time", ['scheduled_at' => $this->slots('2026-11-11 15:00')[0]])->assertUnprocessable();
        $this->postJson("/api/v1/requests/{$item->id}/accept-proposed-time", ['scheduled_at' => $this->slots('2026-11-12 10:00')[0]])
            ->assertOk()
            ->assertJsonPath('request.stage', 'conf');

        $this->assertSame('2026-11-12 10:00', $item->fresh()->scheduled_at->setTimezone('Europe/Chisinau')->format('Y-m-d H:i'));
        $this->assertNull($item->fresh()->proposed_slots);
    }

    public function test_patient_asks_for_other_times_and_unanswered_ask_cancels_with_refund(): void
    {
        $item = $this->book('2026-11-11 10:30');
        Sanctum::actingAs($this->doctor);
        $this->postJson("/api/v1/requests/{$item->id}/propose-time", ['slots' => $this->slots('2026-11-13 11:00')])->assertOk();

        Sanctum::actingAs($this->patientUser);
        $this->postJson("/api/v1/requests/{$item->id}/request-other-times", ['note' => 'Pot doar după 17:00'])
            ->assertOk()
            ->assertJsonPath('request.stage', 'ask')
            ->assertJsonPath('request.proposal.patient_note', 'Pot doar după 17:00');
        $this->postJson("/api/v1/requests/{$item->id}/accept-proposed-time")->assertUnprocessable();

        $this->travel(25)->hours();
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.stage', 'expired');
        $this->assertSame(125000, $this->balance());
    }

    public function test_unanswered_reschedule_keeps_the_confirmed_time(): void
    {
        $item = $this->book('2026-11-12 10:30');
        Sanctum::actingAs($this->doctor);
        $this->postJson("/api/v1/requests/{$item->id}/accept")->assertOk();
        $this->postJson("/api/v1/requests/{$item->id}/propose-time", ['slots' => $this->slots('2026-11-13 11:00')])
            ->assertOk()
            ->assertJsonPath('request.proposal.is_reschedule', true);

        $this->travel(25)->hours();
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.stage', 'conf');
        $this->assertSame('2026-11-12 10:30', $item->fresh()->scheduled_at->setTimezone('Europe/Chisinau')->format('Y-m-d H:i'));
        $this->assertSame(95000, $this->balance());
    }

    public function test_patient_keeps_the_confirmed_time_when_a_reschedule_is_proposed(): void
    {
        $item = $this->book('2026-11-12 10:30');
        Sanctum::actingAs($this->doctor);
        $this->postJson("/api/v1/requests/{$item->id}/accept")->assertOk();
        $this->postJson("/api/v1/requests/{$item->id}/propose-time", ['slots' => $this->slots('2026-11-13 11:00')])->assertOk();

        Sanctum::actingAs($this->patientUser);
        $this->postJson("/api/v1/requests/{$item->id}/keep-current-time")->assertOk()->assertJsonPath('request.stage', 'conf');
        $this->assertSame('2026-11-12 10:30', $item->fresh()->scheduled_at->setTimezone('Europe/Chisinau')->format('Y-m-d H:i'));

        $other = $this->book('2026-11-11 10:30');
        Sanctum::actingAs($this->doctor);
        $this->postJson("/api/v1/requests/{$other->id}/propose-time", ['slots' => $this->slots('2026-11-13 12:00')])->assertOk();
        Sanctum::actingAs($this->patientUser);
        $this->postJson("/api/v1/requests/{$other->id}/keep-current-time")->assertUnprocessable();
    }

    public function test_doctor_withdraws_a_proposal_and_can_cancel_a_confirmed_consultation(): void
    {
        $item = $this->book('2026-11-11 10:30');
        Sanctum::actingAs($this->doctor);
        $this->postJson("/api/v1/requests/{$item->id}/propose-time", ['slots' => $this->slots('2026-11-12 11:00')])->assertOk();
        $this->postJson("/api/v1/requests/{$item->id}/withdraw-proposal")->assertOk()->assertJsonPath('request.stage', 'new');

        $this->postJson("/api/v1/requests/{$item->id}/accept")->assertOk();
        $this->postJson("/api/v1/requests/{$item->id}/reject", ['reason' => 'Nu pot prelua.'])->assertOk()->assertJsonPath('request.stage', 'cancel');
        $this->assertSame(125000, $this->balance());
    }

    public function test_conclusion_draft_is_saved_and_read_back_by_the_doctor_only(): void
    {
        $item = $this->book('2026-11-11 10:30');
        Sanctum::actingAs($this->doctor);
        $this->putJson("/api/v1/requests/{$item->id}/conclusion-draft", ['draft' => ['diagnosis' => 'Faringită acută (J02.9)']])->assertOk();
        $this->getJson("/api/v1/requests/{$item->id}/conclusion-draft")->assertOk()->assertJsonPath('draft.diagnosis', 'Faringită acută (J02.9)');

        Sanctum::actingAs($this->patientUser);
        $this->getJson("/api/v1/requests/{$item->id}/conclusion-draft")->assertForbidden();
    }

    public function test_old_proposal_without_deadline_expires_when_the_proposed_time_has_passed(): void
    {
        $item = $this->book('2026-11-11 10:30');
        $item->forceFill(['status' => 'rescheduled', 'proposed_scheduled_at' => now()->subHour(), 'doctor_reply_due_at' => null])->save();

        Sanctum::actingAs($this->patientUser);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.stage', 'expired');
        $this->assertSame(125000, $this->balance());
    }

    public function test_old_new_request_without_deadline_expires_when_its_time_has_passed(): void
    {
        $item = $this->book('2026-11-11 10:30');
        $item->forceFill(['doctor_reply_due_at' => null, 'scheduled_at' => now()->subHour()])->save();

        Sanctum::actingAs($this->doctor);
        $this->getJson('/api/v1/requests')->assertOk()->assertJsonPath('data.0.stage', 'expired');
        $this->assertSame(125000, $this->balance());
    }

    public function test_doctor_slots_mark_taken_times_except_the_request_being_moved(): void
    {
        $item = $this->book('2026-11-11 10:30');
        $other = $this->book('2026-11-11 11:00');
        Sanctum::actingAs($this->doctor);

        $day = collect($this->getJson("/api/v1/doctor/slots?ignore={$item->id}")->assertOk()->json('days'))->firstWhere('date', '2026-11-11');
        $slots = collect($day['slots'])->keyBy('time');

        $this->assertFalse($slots['10:30']['taken']);
        $this->assertTrue($slots['11:00']['taken']);
        $this->assertNotNull($other);
    }

    private function book(string $localTime): ConsultationRequest
    {
        Sanctum::actingAs($this->patientUser);
        $id = $this->postJson('/api/v1/requests', [
            'type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $this->patient->id,
            'doctor_id' => $this->doctor->id, 'symptoms' => 'Febră', 'scheduled_at' => $this->slots($localTime)[0],
        ])->assertCreated()->json('request.id');

        return ConsultationRequest::findOrFail($id);
    }

    /** @return list<string> */
    private function slots(string ...$localTimes): array
    {
        return array_map(fn (string $time) => CarbonImmutable::parse($time, 'Europe/Chisinau')->utc()->toIso8601String(), $localTimes);
    }

    private function balance(): int
    {
        return (int) Wallet::where('user_id', $this->patientUser->id)->where('type', 'real')->value('balance_minor');
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
