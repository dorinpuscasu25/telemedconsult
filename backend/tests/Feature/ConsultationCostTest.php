<?php

namespace Tests\Feature;

use App\Models\DoctorInvestigationRequirement;
use App\Models\DoctorProfile;
use App\Models\InvestigationType;
use App\Models\Locality;
use App\Models\OperatorCapability;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\OperatorTravelFee;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationCostTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_itemizes_cost_with_operator_override_and_travel_fee(): void
    {
        $scenario = $this->scenario();
        Sanctum::actingAs($scenario['patient']->user);

        $response = $this->postJson('/api/v1/requests/preview', [
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
        ])->assertOk();

        $response->assertJsonPath('eligible', true);
        $response->assertJsonPath('operator.id', (string) $scenario['operator']->id);
        $response->assertJsonPath('cost.doctor_base', 500);
        // throat override 90 + lungs catalog 70 = 160
        $response->assertJsonPath('cost.investigations_total', 160);
        $response->assertJsonPath('cost.travel_fee', 50);
        $response->assertJsonPath('cost.total', 710);
    }

    public function test_stored_request_charges_the_composed_total(): void
    {
        $scenario = $this->scenario();
        Wallet::create(['user_id' => $scenario['patient']->user->id, 'balance_minor' => 200000, 'currency' => 'MDL']);
        Sanctum::actingAs($scenario['patient']->user);

        $this->postJson('/api/v1/requests', [
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse și febră',
        ])
            ->assertCreated()
            ->assertJsonPath('request.amount', 710);

        $this->assertDatabaseHas('consultation_requests', [
            'patient_id' => $scenario['patient']->user->id,
            'amount_minor' => 71000,
        ]);
    }

    public function test_preview_reports_no_operator_without_pricing(): void
    {
        $scenario = $this->scenario(withOperator: false);
        Sanctum::actingAs($scenario['patient']->user);

        $this->postJson('/api/v1/requests/preview', [
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
        ])
            ->assertOk()
            ->assertJsonPath('eligible', false)
            ->assertJsonPath('reason', 'no_coverage');
    }

    /**
     * @return array{patient: PatientProfile, doctor: User, operator: ?User}
     */
    private function scenario(bool $withOperator = true): array
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);

        $throat = InvestigationType::create(['code' => 'throat_exam', 'name' => 'Gât', 'default_price' => 60, 'requires_device' => true]);
        $lungs = InvestigationType::create(['code' => 'lungs', 'name' => 'Plămâni', 'default_price' => 70, 'requires_device' => true]);

        $patientUser = $this->userWithRole('patient');
        $patient = PatientProfile::create([
            'user_id' => $patientUser->id,
            'first_name' => 'Ana', 'last_name' => 'Pop', 'identity_number' => '2000000000001',
            'region' => $region->name, 'region_id' => $region->id,
            'locality' => $locality->name, 'locality_id' => $locality->id,
            'address' => 'Str. Test 1', 'status' => 'active', 'active_until' => now()->addYear(),
        ]);

        $doctorUser = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctorUser->id, 'is_approved' => true, 'consultation_price' => 500]);
        foreach ([$throat->id, $lungs->id] as $id) {
            DoctorInvestigationRequirement::create(['doctor_id' => $doctorUser->id, 'investigation_type_id' => $id, 'requirement' => 'required']);
        }

        $operatorUser = null;
        if ($withOperator) {
            $operatorUser = $this->userWithRole('operator');
            OperatorProfile::create(['user_id' => $operatorUser->id, 'is_available' => true, 'is_approved' => true, 'accepting_requests' => true]);
            OperatorCoverage::create(['operator_id' => $operatorUser->id, 'region_id' => $region->id]);
            OperatorCapability::create(['operator_id' => $operatorUser->id, 'investigation_type_id' => $throat->id, 'price_override' => 90]);
            OperatorCapability::create(['operator_id' => $operatorUser->id, 'investigation_type_id' => $lungs->id]);
            OperatorTravelFee::create(['operator_id' => $operatorUser->id, 'region_id' => $region->id, 'fee' => 50]);
        }

        return ['patient' => $patient, 'doctor' => $doctorUser, 'operator' => $operatorUser];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
