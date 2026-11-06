<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Orele trimise din browser în UTC trebuie să rămână aceeași clipă și când
 * aplicația rulează pe Europe/Chisinau (altfel apare decalaj de 2–3 ore).
 */
class StoresDatesInAppTimezoneTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        date_default_timezone_set('UTC');
        config(['app.timezone' => 'UTC']);
        parent::tearDown();
    }

    public function test_utc_iso_input_is_stored_in_the_app_timezone_without_shifting(): void
    {
        config(['app.timezone' => 'Europe/Chisinau']);
        date_default_timezone_set('Europe/Chisinau');

        $request = new ConsultationRequest;
        $request->scheduled_at = '2026-11-07T12:00:00.000Z';
        $request->proposed_scheduled_at = Carbon::parse('2026-07-01T09:30:00Z');

        $this->assertSame('2026-11-07 14:00:00', $request->getAttributes()['scheduled_at']);
        $this->assertSame('2026-11-07T12:00:00.000000Z', $request->scheduled_at->toJSON());
        $this->assertSame('2026-07-01 12:30:00', $request->getAttributes()['proposed_scheduled_at']);
    }

    public function test_local_strings_and_empty_values_are_kept(): void
    {
        config(['app.timezone' => 'Europe/Chisinau']);
        date_default_timezone_set('Europe/Chisinau');

        $request = new ConsultationRequest;
        $request->scheduled_at = '2026-11-07 14:00:00';
        $request->proposed_scheduled_at = null;

        $this->assertSame('2026-11-07 14:00:00', $request->getAttributes()['scheduled_at']);
        $this->assertNull($request->getAttributes()['proposed_scheduled_at']);
    }

    public function test_migration_corrects_shifted_times_but_keeps_operator_proposals(): void
    {
        $patient = User::factory()->create();
        $patient->roles()->attach(Role::firstOrCreate(['name' => 'patient'], ['label' => 'Patient']));
        $insert = fn (array $values) => DB::table('consultation_requests')->insertGetId([
            'patient_id' => $patient->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted',
            'symptoms' => 'Test', 'created_at' => now(), 'updated_at' => now(), ...$values,
        ]);
        $createdByPatient = $insert(['scheduled_at' => '2026-11-07 12:00:00']);
        $acceptedOperatorProposal = $insert(['scheduled_at' => '2026-11-08 15:30:00']);
        $pendingDoctorProposal = $insert(['status' => 'rescheduled', 'scheduled_at' => '2026-07-01 09:00:00', 'proposed_scheduled_at' => '2026-07-02 07:00:00']);
        foreach ([[$acceptedOperatorProposal, '08.11.2026 15:30'], [$pendingDoctorProposal, '02.07.2026 10:00']] as [$id, $time]) {
            $conversation = Conversation::create(['consultation_request_id' => $id, 'patient_id' => $patient->id, 'status' => 'open']);
            Message::create(['conversation_id' => $conversation->id, 'sender_id' => $patient->id, 'body' => 'A fost propus un nou interval: '.$time, 'type' => 'system']);
        }

        config(['app.timezone' => 'Europe/Chisinau']);
        (require database_path('migrations/2026_11_06_100500_fix_shifted_consultation_schedule_times.php'))->up();

        $value = fn (int $id, string $column) => DB::table('consultation_requests')->where('id', $id)->value($column);
        $this->assertSame('2026-11-07 14:00:00', $value($createdByPatient, 'scheduled_at'));
        $this->assertSame('2026-11-08 15:30:00', $value($acceptedOperatorProposal, 'scheduled_at'));
        $this->assertSame('2026-07-01 12:00:00', $value($pendingDoctorProposal, 'scheduled_at'));
        $this->assertSame('2026-07-02 10:00:00', $value($pendingDoctorProposal, 'proposed_scheduled_at'));
    }

    public function test_migration_does_nothing_on_a_utc_server(): void
    {
        $patient = User::factory()->create();
        $id = DB::table('consultation_requests')->insertGetId(['patient_id' => $patient->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'symptoms' => 'Test', 'scheduled_at' => '2026-11-07 12:00:00', 'created_at' => now(), 'updated_at' => now()]);

        (require database_path('migrations/2026_11_06_100500_fix_shifted_consultation_schedule_times.php'))->up();

        $this->assertSame('2026-11-07 12:00:00', DB::table('consultation_requests')->where('id', $id)->value('scheduled_at'));
    }
}
