<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorInvestigationRequirement;
use App\Models\DoctorProfile;
use App\Models\InvestigationType;
use App\Models\OperatorCapability;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Ce vede medicul când consultația ajunge la el, și de când poate scrie în chat.
 */
class DoctorConsultationViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_sees_objective_data_patient_profile_and_investigations(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/objective-data", [
            'source' => 'higo_device',
            'payload' => ['blood_pressure_systolic' => 120, 'blood_pressure_diastolic' => 80, 'spo2' => 98],
        ])->assertCreated();

        Sanctum::actingAs($scenario['doctor']);
        $response = $this->getJson('/api/v1/requests')->assertOk();

        $item = collect($response->json('data'))->firstWhere('id', (string) $requestId);

        $this->assertNotNull($item, 'Consultația nu apare în lista medicului.');

        // Datele obiective, cu proveniență.
        $this->assertCount(1, $item['objective_data']);
        $this->assertSame('higo_device', $item['objective_data'][0]['source']);
        $this->assertTrue($item['objective_data'][0]['from_device']);
        $this->assertSame(120, $item['objective_data'][0]['payload']['blood_pressure_systolic']);
        $this->assertSame($scenario['operator']->name, $item['objective_data'][0]['operator']);

        // Fișa pacientului.
        $this->assertSame('Ana Pop', $item['patient_profile']['name']);
        $this->assertSame('F', $item['patient_profile']['gender']);
        $this->assertSame(40, $item['patient_profile']['age']);
        $this->assertSame('Astm bronșic', $item['patient_profile']['medical_summary']);

        // Investigațiile cerute de medic, din snapshotul de preț.
        $this->assertNotEmpty($item['investigations']);
        $this->assertSame('Gât', $item['investigations'][0]['name']);
    }

    /**
     * Titularul contului nu e pacientul: dacă listele arată numele lui, medicul
     * și operatorul caută în HIGO persoana greșită.
     */
    public function test_the_dashboard_lists_the_patient_profile_not_the_account_holder(): void
    {
        $scenario = $this->scenario();
        $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['doctor']);
        $pending = $this->getJson('/api/v1/doctor/dashboard')->assertOk()->json('pending_requests.0');

        $this->assertSame('Ana Pop', $pending['patient_profile']['name']);
        $this->assertSame($scenario['patient']->patient_code, $pending['patient_profile']['patient_code']);
        $this->assertNotSame($scenario['patient']->user->name, $pending['patient_profile']['name']);
    }

    public function test_unknown_measurement_keys_survive_validation(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/objective-data", [
            'source' => 'higo_device',
            // `spo2` e din vocabularul canonic, `peak_flow` nu — ambele trebuie
            // să ajungă la medic, altfel un câmp nou din aparat s-ar pierde.
            'payload' => ['spo2' => 97, 'peak_flow' => 380],
        ])->assertCreated();

        Sanctum::actingAs($scenario['doctor']);
        $item = collect($this->getJson('/api/v1/requests')->json('data'))->firstWhere('id', (string) $requestId);

        $this->assertSame(97, $item['objective_data'][0]['payload']['spo2']);
        $this->assertSame(380, $item['objective_data'][0]['payload']['peak_flow']);
    }

    public function test_out_of_range_vitals_are_rejected(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/objective-data", [
            'payload' => ['temperature' => 95],
        ])->assertStatus(422)->assertJsonValidationErrors('payload.temperature');
    }

    public function test_manual_notes_are_not_marked_as_coming_from_the_device(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/objective-data", [
            'source' => 'manual_operator',
            'payload' => ['notes' => 'TA 120/80'],
        ])->assertCreated();

        Sanctum::actingAs($scenario['doctor']);
        $item = collect($this->getJson('/api/v1/requests')->json('data'))->firstWhere('id', (string) $requestId);

        $this->assertFalse($item['objective_data'][0]['from_device']);
    }

    public function test_the_doctor_starts_the_consultation_and_that_opens_the_chat(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);
        $conversation = Conversation::where('consultation_request_id', $requestId)->firstOrFail();

        // Înainte de examinare, medicul nu poate nici porni, nici scrie.
        Sanctum::actingAs($scenario['doctor']);
        $this->postJson("/api/v1/requests/{$requestId}/start")->assertStatus(422);
        $this->postJson("/api/v1/conversations/{$conversation->id}/messages", ['body' => 'prea devreme'])
            ->assertStatus(422);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/examination-done")->assertOk();

        // Examinarea e gata, dar chatul se deschide abia la pornirea consultației.
        $this->assertNotSame('open', $conversation->refresh()->status);

        Sanctum::actingAs($scenario['doctor']);
        $this->postJson("/api/v1/requests/{$requestId}/start")->assertOk();

        $this->assertSame('open', $conversation->refresh()->status);
        $this->assertNotNull(ConsultationRequest::findOrFail($requestId)->doctor_started_at);

        $this->postJson("/api/v1/conversations/{$conversation->id}/messages", ['body' => 'De când aveți febră?'])
            ->assertCreated();

        Sanctum::actingAs($scenario['patient']->user);
        $this->postJson("/api/v1/conversations/{$conversation->id}/messages", ['body' => 'De ieri.'])
            ->assertCreated();
    }

    public function test_the_doctor_can_conclude_without_any_anamnesis_step(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/examination-done")->assertOk();

        // Acuzele au fost date la solicitare; nu există un al doilea pas.
        Sanctum::actingAs($scenario['doctor']);
        $this->postJson("/api/v1/requests/{$requestId}/start")->assertOk();
        $this->postJson("/api/v1/requests/{$requestId}/complete", [
            'diagnosis' => 'Bronșită acută',
        ])->assertOk();

        $this->assertNotNull(ConsultationRequest::findOrFail($requestId)->conclusion_sent_at);
    }

    public function test_another_doctor_cannot_start_someone_elses_consultation(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/examination-done")->assertOk();

        $intrus = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $intrus->id, 'is_approved' => true, 'consultation_price' => 400]);

        Sanctum::actingAs($intrus);
        $this->postJson("/api/v1/requests/{$requestId}/start")->assertForbidden();
    }

    public function test_the_operator_sees_the_exam_assigned_to_them(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['operator']);
        $items = collect($this->getJson('/api/v1/requests')->assertOk()->json('data'));

        // Solicitarea are `type = doctor` (pacientul a cerut un medic), dar
        // deplasarea la domiciliu e a operatorului — trebuie s-o vadă.
        $item = $items->firstWhere('id', (string) $requestId);

        $this->assertNotNull($item, 'Operatorul nu vede examinarea care i-a fost atribuită.');
        $this->assertSame('doctor', $item['type']);
        $this->assertSame($scenario['operator']->name, $item['operator']['name']);
    }

    public function test_an_operator_does_not_see_exams_assigned_to_someone_else(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        $intrus = $this->userWithRole('operator');
        OperatorProfile::create(['user_id' => $intrus->id, 'is_approved' => true]);

        Sanctum::actingAs($intrus);
        $items = collect($this->getJson('/api/v1/requests')->assertOk()->json('data'));

        $this->assertNull($items->firstWhere('id', (string) $requestId));
    }

    public function test_the_operator_can_finish_the_visit_without_typing_measurements(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        // Măsurătorile s-au făcut cu aparatul HIGO; operatorul doar declară că a
        // terminat, fără să retasteze nimic în dashboard.
        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/examination-done")->assertOk();

        $request = ConsultationRequest::findOrFail($requestId);
        $this->assertNotNull($request->objective_data_completed_at);

        // Datele din aparat sosesc separat și se atașează aceleiași consultații.
        $this->postJson("/api/v1/requests/{$requestId}/objective-data", [
            'source' => 'higo_device',
            'payload' => ['spo2' => 97],
        ])->assertCreated();

        Sanctum::actingAs($scenario['doctor']);
        $item = collect($this->getJson('/api/v1/requests')->json('data'))->firstWhere('id', (string) $requestId);
        $this->assertSame(97, $item['objective_data'][0]['payload']['spo2']);
    }

    public function test_starting_the_consultation_opens_the_chat(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);
        $conversation = Conversation::where('consultation_request_id', $requestId)->firstOrFail();

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/examination-done")->assertOk();

        Sanctum::actingAs($scenario['doctor']);
        $this->postJson("/api/v1/requests/{$requestId}/start")->assertOk();

        $this->assertSame('open', $conversation->refresh()->status);
    }

    public function test_an_operator_cannot_finish_an_examination_assigned_to_someone_else(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        $intrus = $this->userWithRole('operator');
        OperatorProfile::create(['user_id' => $intrus->id, 'is_approved' => true]);

        Sanctum::actingAs($intrus);
        $this->postJson("/api/v1/requests/{$requestId}/examination-done")->assertForbidden();

        $this->assertNull(ConsultationRequest::findOrFail($requestId)->objective_data_completed_at);
    }

    public function test_an_operator_only_visit_can_be_closed_without_objective_data(): void
    {
        $scenario = $this->scenario();
        Wallet::create(['user_id' => $scenario['patient']->user->id, 'balance_minor' => 500000, 'currency' => 'MDL']);
        Sanctum::actingAs($scenario['patient']->user);

        // Vizită fără medic: nu există concluzie medicală de protejat, deci
        // poarta „date obiective + anamneză” nu se aplică.
        $requestId = (int) $this->postJson('/api/v1/requests', [
            'type' => 'operator',
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $scenario['patient']->id,
            'symptoms' => 'Tensiune',
        ])->assertCreated()->json('request.id');

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$requestId}/accept")->assertOk();
        $this->postJson("/api/v1/requests/{$requestId}/complete", [
            'diagnosis' => 'Măsurători efectuate la domiciliu.',
        ])->assertOk();

        $this->assertNotNull(ConsultationRequest::findOrFail($requestId)->completed_at);
    }

    public function test_a_visit_with_a_doctor_still_needs_the_data_before_a_conclusion(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        // Aici există medic, deci poarta rămâne: fără date, fără concluzie.
        Sanctum::actingAs($scenario['doctor']);
        $this->postJson("/api/v1/requests/{$requestId}/complete", ['diagnosis' => 'Grabă'])
            ->assertStatus(422);
    }

    public function test_a_chat_waiting_for_the_examination_is_pending_not_closed(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        Sanctum::actingAs($scenario['patient']->user);
        $chat = collect($this->getJson('/api/v1/conversations')->json('data'))
            ->firstWhere('consultation_request_id', $requestId)['chat'];

        // Nu e „închis”: examinarea pur și simplu nu s-a făcut încă.
        $this->assertSame('pending', $chat['state']);
        $this->assertFalse($chat['can_write']);
        $this->assertFalse($chat['can_reactivate'], 'Reactivarea n-are sens înainte de concluzie.');
        $this->assertStringContainsString('operatorul', $chat['message']);
    }

    public function test_writing_too_early_does_not_mark_the_chat_as_closed(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);
        $conversation = Conversation::where('consultation_request_id', $requestId)->firstOrFail();

        Sanctum::actingAs($scenario['patient']->user);
        $this->postJson("/api/v1/conversations/{$conversation->id}/messages", ['body' => 'salut'])
            ->assertStatus(422);

        // Bug-ul vechi: încercarea de a scrie închidea conversația definitiv.
        $this->assertNotSame('closed', $conversation->refresh()->status);

        $chat = collect($this->getJson('/api/v1/conversations')->json('data'))
            ->firstWhere('consultation_request_id', $requestId)['chat'];
        $this->assertSame('pending', $chat['state']);
    }

    public function test_after_the_conclusion_the_patient_can_reactivate_but_the_doctor_cannot(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        ConsultationRequest::whereKey($requestId)->update([
            'conclusion_sent_at' => now()->subDays(5),
            'free_chat_until' => now()->subDays(2),
            'chat_expires_at' => now()->addDays(9),
        ]);

        Sanctum::actingAs($scenario['patient']->user);
        $chat = collect($this->getJson('/api/v1/conversations')->json('data'))
            ->firstWhere('consultation_request_id', $requestId)['chat'];

        $this->assertSame('reactivatable', $chat['state']);
        $this->assertTrue($chat['can_reactivate']);

        // Medicul vede aceeași stare, dar plata o face pacientul.
        Sanctum::actingAs($scenario['doctor']);
        $chat = collect($this->getJson('/api/v1/conversations')->json('data'))
            ->firstWhere('consultation_request_id', $requestId)['chat'];

        $this->assertSame('reactivatable', $chat['state']);
        $this->assertFalse($chat['can_reactivate']);
    }

    public function test_after_the_window_expires_the_chat_is_closed_for_good(): void
    {
        $scenario = $this->scenario();
        $requestId = $this->createWithExamRequest($scenario);

        ConsultationRequest::whereKey($requestId)->update([
            'conclusion_sent_at' => now()->subDays(20),
            'free_chat_until' => now()->subDays(17),
            'chat_expires_at' => now()->subDays(6),
        ]);

        Sanctum::actingAs($scenario['patient']->user);
        $chat = collect($this->getJson('/api/v1/conversations')->json('data'))
            ->firstWhere('consultation_request_id', $requestId)['chat'];

        $this->assertSame('closed', $chat['state']);
        $this->assertFalse($chat['can_reactivate']);
        $this->assertStringContainsString('definitiv', $chat['message']);
    }

    /**
     * @param  array{patient: PatientProfile, doctor: User, operator: User}  $scenario
     */
    private function createWithExamRequest(array $scenario): int
    {
        Wallet::create(['user_id' => $scenario['patient']->user->id, 'balance_minor' => 500000, 'currency' => 'MDL']);
        Sanctum::actingAs($scenario['patient']->user);

        return (int) $this->postJson('/api/v1/requests', [
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
        ])->assertCreated()->json('request.id');
    }

    /**
     * @return array{patient: PatientProfile, doctor: User, operator: User}
     */
    private function scenario(): array
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $throat = InvestigationType::create(['code' => 'throat_exam', 'name' => 'Gât', 'default_price' => 60, 'requires_device' => true]);

        $patientUser = $this->userWithRole('patient');
        $patient = PatientProfile::create([
            'user_id' => $patientUser->id,
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'birth_date' => now()->subYears(40)->toDateString(),
            'gender' => 'F',
            'medical_summary' => 'Astm bronșic',
            'region' => $region->name,
            'region_id' => $region->id,
            'locality' => $locality->name,
            'locality_id' => $locality->id,
            'address' => 'Str. Test 1',
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);

        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'consultation_price' => 500]);
        DoctorInvestigationRequirement::create(['doctor_id' => $doctor->id, 'investigation_type_id' => $throat->id, 'requirement' => 'required']);

        $operator = $this->userWithRole('operator');
        OperatorProfile::create(['user_id' => $operator->id, 'is_available' => true, 'is_approved' => true, 'accepting_requests' => true]);
        OperatorCoverage::create(['operator_id' => $operator->id, 'region_id' => $region->id]);
        OperatorCapability::create(['operator_id' => $operator->id, 'investigation_type_id' => $throat->id]);

        return ['patient' => $patient, 'doctor' => $doctor, 'operator' => $operator];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
