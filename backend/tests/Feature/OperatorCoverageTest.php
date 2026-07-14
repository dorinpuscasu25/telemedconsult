<?php

namespace Tests\Feature;

use App\Models\InvestigationType;
use App\Models\Locality;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\OperatorTravelFee;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OperatorCoverageTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_creates_operator_with_coverage_capabilities_and_travel_fees(): void
    {
        Role::firstOrCreate(['name' => 'operator'], ['label' => 'Operator']);
        [$region, $locality, $investigation] = $this->catalog();

        Sanctum::actingAs($this->admin());

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Operator Coverage',
            'email' => 'op.coverage@doctor.md',
            'password' => 'password123',
            'roles' => ['operator'],
            'region' => $region->name,
            'base_fee' => 40,
            'accepting_requests' => false,
            'coverage' => [
                ['region_id' => $region->id],
                ['region_id' => $region->id, 'locality_id' => $locality->id],
            ],
            'capabilities' => [
                ['investigation_type_id' => $investigation->id, 'price_override' => 90],
            ],
            'travel_fees' => [
                ['region_id' => $region->id, 'fee' => 50],
                ['region_id' => $region->id, 'locality_id' => $locality->id, 'fee' => 75],
            ],
        ])->assertCreated();

        $operatorId = $response->json('user.id');

        $this->assertDatabaseHas('operator_coverage', ['operator_id' => $operatorId, 'region_id' => $region->id, 'locality_id' => null]);
        $this->assertDatabaseHas('operator_coverage', ['operator_id' => $operatorId, 'region_id' => $region->id, 'locality_id' => $locality->id]);
        $this->assertDatabaseHas('operator_capabilities', ['operator_id' => $operatorId, 'investigation_type_id' => $investigation->id, 'price_override' => 90]);
        $this->assertDatabaseHas('operator_travel_fees', ['operator_id' => $operatorId, 'region_id' => $region->id, 'locality_id' => null, 'fee' => 50]);
        $this->assertDatabaseHas('operator_travel_fees', ['operator_id' => $operatorId, 'region_id' => $region->id, 'locality_id' => $locality->id, 'fee' => 75]);
        $this->assertDatabaseHas('operator_profiles', ['user_id' => $operatorId, 'accepting_requests' => false]);

        // Serialized back for the admin form.
        $operator = $response->json('user.profiles.operator');
        $this->assertCount(2, $operator['coverage']);
        $this->assertCount(1, $operator['capabilities']);
        $this->assertSame(90, $operator['capabilities'][0]['price_override']);
        $this->assertContains($region->name, $operator['served_areas']);
    }

    public function test_travel_fee_resolver_prefers_locality_then_falls_back_to_region(): void
    {
        [$region, $locality] = $this->catalog();
        $operator = User::factory()->create();
        $profile = OperatorProfile::create(['user_id' => $operator->id]);

        OperatorTravelFee::create(['operator_id' => $operator->id, 'region_id' => $region->id, 'locality_id' => null, 'fee' => 50]);
        OperatorTravelFee::create(['operator_id' => $operator->id, 'region_id' => $region->id, 'locality_id' => $locality->id, 'fee' => 75]);

        $this->assertSame(75, $profile->resolveTravelFee($region->id, $locality->id));

        $otherLocality = $region->localities()->create(['name' => 'Alt sat', 'type' => 'sat', 'is_active' => true]);
        $this->assertSame(50, $profile->fresh()->resolveTravelFee($region->id, $otherLocality->id));

        $otherRegion = Region::create(['name' => 'Cahul', 'type' => 'raion', 'is_active' => true]);
        $this->assertNull($profile->fresh()->resolveTravelFee($otherRegion->id, null));
    }

    public function test_editing_operator_replaces_coverage(): void
    {
        [$region, $locality, $investigation] = $this->catalog();
        $regionB = Region::create(['name' => 'Ungheni', 'type' => 'raion', 'is_active' => true]);

        $operator = $this->operatorWith($region);

        Sanctum::actingAs($this->admin());

        $this->putJson('/api/v1/admin/users/'.$operator->id, [
            'coverage' => [['region_id' => $regionB->id]],
        ])->assertOk();

        $this->assertDatabaseMissing('operator_coverage', ['operator_id' => $operator->id, 'region_id' => $region->id]);
        $this->assertDatabaseHas('operator_coverage', ['operator_id' => $operator->id, 'region_id' => $regionB->id]);
    }

    public function test_invalid_coverage_region_is_rejected(): void
    {
        Role::firstOrCreate(['name' => 'operator'], ['label' => 'Operator']);
        Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Bad Coverage',
            'email' => 'bad.coverage@doctor.md',
            'password' => 'password123',
            'roles' => ['operator'],
            'region' => 'Chișinău',
            'coverage' => [['region_id' => 99999]],
        ])->assertUnprocessable()->assertJsonValidationErrors('coverage.0.region_id');
    }

    /**
     * @return array{0: Region, 1: Locality, 2: InvestigationType}
     */
    private function catalog(): array
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $locality = $region->localities()->create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
        $investigation = InvestigationType::create(['code' => 'throat_exam', 'name' => 'Examinare gât', 'default_price' => 70, 'requires_device' => true, 'higo_exam_type' => 'THROAT_EXAM']);

        return [$region, $locality, $investigation];
    }

    private function operatorWith(Region $region): User
    {
        $role = Role::firstOrCreate(['name' => 'operator'], ['label' => 'Operator']);
        $operator = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $operator->roles()->sync([$role->id]);
        OperatorProfile::create(['user_id' => $operator->id, 'region' => $region->name]);
        OperatorCoverage::create(['operator_id' => $operator->id, 'region_id' => $region->id]);

        return $operator;
    }

    private function admin(): User
    {
        $role = Role::firstOrCreate(['name' => 'admin'], ['label' => 'Administrator']);
        $admin = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $admin->roles()->sync([$role->id]);

        return $admin;
    }
}
