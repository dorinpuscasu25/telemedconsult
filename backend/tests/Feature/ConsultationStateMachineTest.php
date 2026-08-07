<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\ConsultationStateMachine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationStateMachineTest extends TestCase
{
    use RefreshDatabase;

    private ConsultationStateMachine $fsm;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fsm = new ConsultationStateMachine;
    }

    public function test_transition_table_matches_spec(): void
    {
        $this->assertTrue($this->fsm->canTransition(ConsultationStateMachine::AWAITING_DOCTOR, ConsultationStateMachine::CONCLUDED));
        $this->assertTrue($this->fsm->canTransition(ConsultationStateMachine::AWAITING_DOCTOR, ConsultationStateMachine::ADDITIONAL_REQUESTED));
        $this->assertTrue($this->fsm->canTransition(ConsultationStateMachine::CONCLUDED, ConsultationStateMachine::CLOSED));
        $this->assertTrue($this->fsm->canTransition(ConsultationStateMachine::ADDITIONAL_REQUESTED, ConsultationStateMachine::IN_PROGRESS));

        // Invalid jumps are rejected.
        $this->assertFalse($this->fsm->canTransition(ConsultationStateMachine::OPERATOR_ASSIGNED, ConsultationStateMachine::CONCLUDED));
        $this->assertFalse($this->fsm->canTransition(ConsultationStateMachine::CLOSED, ConsultationStateMachine::CONCLUDED));
    }

    public function test_state_is_derived_from_status_and_flags(): void
    {
        $assigned = $this->request(['status' => 'new', 'operator_id' => $this->userId()]);
        $this->assertSame(ConsultationStateMachine::OPERATOR_ASSIGNED, $this->fsm->stateFor($assigned));

        $scheduled = $this->request(['status' => 'accepted', 'scheduled_at' => now()->addDay()]);
        $this->assertSame(ConsultationStateMachine::SCHEDULED, $this->fsm->stateFor($scheduled));

        // Examinarea operatorului e singura condiție ca dosarul să ajungă la medic.
        $awaitingDoctor = $this->request(['status' => 'accepted', 'objective_data_completed_at' => now()]);
        $this->assertSame(ConsultationStateMachine::AWAITING_DOCTOR, $this->fsm->stateFor($awaitingDoctor));

        $concluded = $this->request(['status' => 'completed', 'conclusion_sent_at' => now()]);
        $this->assertSame(ConsultationStateMachine::CONCLUDED, $this->fsm->stateFor($concluded));

        $closed = $this->request(['status' => 'completed', 'conclusion_sent_at' => now(), 'closed_at' => now()]);
        $this->assertSame(ConsultationStateMachine::CLOSED, $this->fsm->stateFor($closed));

        $cancelled = $this->request(['status' => 'cancelled']);
        $this->assertSame(ConsultationStateMachine::CANCELLED, $this->fsm->stateFor($cancelled));
    }

    public function test_doctor_cannot_conclude_before_the_operator_finishes_the_examination(): void
    {
        [$doctor, $consultationRequest] = $this->doctorScenario();
        Sanctum::actingAs($doctor);

        $this->postJson("/api/v1/requests/{$consultationRequest->id}/complete", ['diagnosis' => 'Faringită'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Operatorul nu a finalizat încă examinarea la domiciliu.');
    }

    public function test_doctor_can_conclude_once_the_examination_is_finished(): void
    {
        [$doctor, $consultationRequest] = $this->doctorScenario();
        Sanctum::actingAs($doctor);

        $consultationRequest->forceFill(['anamnesis_completed_at' => now(), 'objective_data_completed_at' => now()])->save();

        $this->postJson("/api/v1/requests/{$consultationRequest->id}/complete", ['diagnosis' => 'Faringită acută'])
            ->assertSuccessful();
    }

    private function request(array $attributes): ConsultationRequest
    {
        return (new ConsultationRequest)->forceFill(array_merge([
            'consultation_kind' => 'with_exam',
            'status' => 'new',
        ], $attributes));
    }

    private function userId(): int
    {
        return User::factory()->create()->id;
    }

    /**
     * @return array{0: User, 1: ConsultationRequest}
     */
    private function doctorScenario(): array
    {
        $doctorRole = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
        $doctor = User::factory()->create(['status' => 'active']);
        $doctor->roles()->sync([$doctorRole->id]);
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'consultation_price' => 400]);

        $patientRole = Role::firstOrCreate(['name' => 'patient'], ['label' => 'Pacient']);
        $patient = User::factory()->create(['status' => 'active']);
        $patient->roles()->sync([$patientRole->id]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'A', 'last_name' => 'B', 'identity_number' => '2', 'status' => 'active']);

        $consultationRequest = ConsultationRequest::create([
            'patient_id' => $patient->id,
            'patient_profile_id' => $profile->id,
            'doctor_id' => $doctor->id,
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'status' => 'accepted',
            'symptoms' => 'Durere în gât',
        ]);

        return [$doctor, $consultationRequest];
    }
}
