<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
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
use App\Notifications\AppEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationNotificationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_with_exam_creation_notifies_operator_and_patient_not_doctor(): void
    {
        Notification::fake();
        $scenario = $this->scenario();
        Wallet::create(['user_id' => $scenario['patient']->user->id, 'balance_minor' => 200000, 'currency' => 'MDL']);
        Sanctum::actingAs($scenario['patient']->user);

        $this->postJson('/api/v1/requests', [
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
        ])->assertCreated();

        Notification::assertSentTo($scenario['operator'], AppEventNotification::class, fn (AppEventNotification $n, array $channels, User $to) => str_contains($n->toArray($to)['title'], 'Examinare atribuită'));
        Notification::assertSentTo($scenario['patient']->user, AppEventNotification::class, fn (AppEventNotification $n, array $channels, User $to) => str_contains($n->toArray($to)['title'], 'Operator asignat'));
        Notification::assertNotSentTo($scenario['doctor'], AppEventNotification::class);
    }

    public function test_doctor_is_notified_when_both_flags_ready(): void
    {
        Notification::fake();
        $scenario = $this->scenario();

        $consultationRequest = ConsultationRequest::create([
            'patient_id' => $scenario['patient']->user->id,
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'operator_id' => $scenario['operator']->id,
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'status' => 'accepted',
            'symptoms' => 'Tuse',
            'anamnesis_completed_at' => now(), // anamnesis already done
        ]);

        Sanctum::actingAs($scenario['operator']);
        $this->postJson("/api/v1/requests/{$consultationRequest->id}/objective-data", [
            'payload' => ['temperature' => 37.2],
        ])->assertCreated();

        Notification::assertSentTo($scenario['doctor'], AppEventNotification::class, fn (AppEventNotification $n, array $channels, User $to) => str_contains($n->toArray($to)['title'], 'gata pentru concluzie'));
    }

    public function test_additional_investigation_notifies_operator(): void
    {
        Notification::fake();
        $scenario = $this->scenario();

        $consultationRequest = ConsultationRequest::create([
            'patient_id' => $scenario['patient']->user->id,
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'operator_id' => $scenario['operator']->id,
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'status' => 'accepted',
            'symptoms' => 'Tuse',
        ]);

        Sanctum::actingAs($scenario['doctor']);
        $this->postJson("/api/v1/requests/{$consultationRequest->id}/additional-investigation", [
            'title' => 'Dermatoscopie',
        ])->assertOk();

        Notification::assertSentTo($scenario['operator'], AppEventNotification::class, fn (AppEventNotification $n, array $channels, User $to) => str_contains($n->toArray($to)['title'], 'Investigație suplimentară cerută'));
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
            'first_name' => 'Ana', 'last_name' => 'Pop', 'identity_number' => '2000000000001',
            'region' => $region->name, 'region_id' => $region->id,
            'locality' => $locality->name, 'locality_id' => $locality->id,
            'address' => 'Str. Test 1', 'status' => 'active', 'active_until' => now()->addYear(),
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
