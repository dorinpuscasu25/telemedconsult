<?php

namespace Tests\Feature;

use App\Models\DoctorInvestigationRequirement;
use App\Models\InvestigationType;
use App\Models\Locality;
use App\Models\OperatorCapability;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\OperatorReview;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Services\OperatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OperatorAssignmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_operators_covering_region_and_capable_are_eligible(): void
    {
        [$region, $locality] = $this->place();
        $throat = InvestigationType::create(['code' => 'throat_exam', 'name' => 'Gât', 'requires_device' => true]);
        $patient = $this->patient($region, $locality);

        $capable = $this->operator($region->id, [$throat->id]);       // covers + capable
        $incapable = $this->operator($region->id, []);                 // covers, cannot do throat
        $elsewhere = $this->operator($this->otherRegion()->id, [$throat->id]); // capable, wrong region

        $picked = app(OperatorAssignmentService::class)->pickOperatorId($patient, [$throat->id]);

        $this->assertSame($capable->id, $picked);
        $this->assertNotSame($incapable->id, $picked);
        $this->assertNotSame($elsewhere->id, $picked);
    }

    public function test_no_coverage_message_when_region_has_no_operator(): void
    {
        [$region, $locality] = $this->place();
        $patient = $this->patient($region, $locality);
        $doctor = $this->doctorWithRequired([]);

        Sanctum::actingAs($patient->user);

        $this->postJson('/api/v1/requests', $this->payload($patient, $doctor))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Momentan nu avem operator în regiunea ta. Te anunțăm când apare unul disponibil.');
    }

    public function test_capability_gap_message_when_covered_but_not_capable(): void
    {
        [$region, $locality] = $this->place();
        $throat = InvestigationType::create(['code' => 'throat_exam', 'name' => 'Gât', 'requires_device' => true]);
        $patient = $this->patient($region, $locality);
        $doctor = $this->doctorWithRequired([$throat->id]);

        $this->operator($region->id, []); // covers region but cannot do throat

        Sanctum::actingAs($patient->user);

        $this->postJson('/api/v1/requests', $this->payload($patient, $doctor))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Operatorii din regiunea ta nu pot efectua toate investigațiile cerute de acest medic. Alege alt medic sau o consultație video.');
    }

    public function test_ranking_prefers_locality_match_then_lower_rating_loses(): void
    {
        [$region, $locality] = $this->place();
        $patient = $this->patient($region, $locality);

        // Region-wide operator with a great rating.
        $regionWide = $this->operator($region->id, []);
        OperatorReview::create(['operator_id' => $regionWide->id, 'patient_id' => $patient->user->id, 'rating' => 5, 'comment' => 'x']);

        // Locality-specific operator with a lower rating — proximity beats rating.
        $localityOperator = $this->operator($region->id, [], $locality->id);
        OperatorReview::create(['operator_id' => $localityOperator->id, 'patient_id' => $patient->user->id, 'rating' => 3, 'comment' => 'y']);

        $picked = app(OperatorAssignmentService::class)->pickOperatorId($patient, []);

        $this->assertSame($localityOperator->id, $picked);
    }

    // --- helpers ---

    /**
     * @return array{0: Region, 1: Locality}
     */
    private function place(): array
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);

        return [$region, $locality];
    }

    private function otherRegion(): Region
    {
        return Region::create(['name' => 'Cahul', 'type' => 'raion', 'is_active' => true]);
    }

    private function patient(Region $region, Locality $locality): PatientProfile
    {
        $user = $this->userWithRole('patient');

        return PatientProfile::create([
            'user_id' => $user->id,
            'first_name' => 'Ion',
            'last_name' => 'Pop',
            'identity_number' => '2000000000001',
            'region' => $region->name,
            'region_id' => $region->id,
            'locality' => $locality->name,
            'locality_id' => $locality->id,
            'address' => 'Str. Test 1',
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);
    }

    /**
     * @param  list<int>  $capabilityIds
     */
    private function operator(int $regionId, array $capabilityIds, ?int $localityId = null): User
    {
        $user = $this->userWithRole('operator');
        OperatorProfile::create(['user_id' => $user->id, 'is_available' => true, 'is_approved' => true, 'accepting_requests' => true]);
        OperatorCoverage::create(['operator_id' => $user->id, 'region_id' => $regionId, 'locality_id' => $localityId]);

        foreach ($capabilityIds as $investigationId) {
            OperatorCapability::create(['operator_id' => $user->id, 'investigation_type_id' => $investigationId]);
        }

        return $user;
    }

    /**
     * @param  list<int>  $requiredInvestigationIds
     */
    private function doctorWithRequired(array $requiredInvestigationIds): User
    {
        $doctor = $this->userWithRole('doctor');

        foreach ($requiredInvestigationIds as $investigationId) {
            DoctorInvestigationRequirement::create([
                'doctor_id' => $doctor->id,
                'investigation_type_id' => $investigationId,
                'requirement' => 'required',
            ]);
        }

        return $doctor;
    }

    private function payload(PatientProfile $patient, User $doctor): array
    {
        return [
            'type' => 'doctor',
            'consultation_kind' => 'with_exam',
            'patient_profile_id' => $patient->id,
            'doctor_id' => $doctor->id,
            'symptoms' => 'Tuse',
        ];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
