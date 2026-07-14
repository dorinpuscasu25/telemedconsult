<?php

namespace Tests\Feature;

use App\Models\Locality;
use App\Models\PatientCardPurchase;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RegionsAndAddressGatingTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_region_catalog_returns_only_active_units(): void
    {
        $active = Region::create(['name' => 'Strășeni', 'type' => 'raion', 'is_active' => true]);
        $active->localities()->create(['name' => 'Strășeni', 'type' => 'oras', 'is_active' => true]);
        $active->localities()->create(['name' => 'Căpriana', 'type' => 'sat', 'is_active' => false]);

        Region::create(['name' => 'Regiune inactivă', 'type' => 'raion', 'is_active' => false]);

        $response = $this->getJson('/api/v1/catalog/regions')->assertOk();

        $names = collect($response->json('data'))->pluck('name');
        $this->assertTrue($names->contains('Strășeni'));
        $this->assertFalse($names->contains('Regiune inactivă'));

        $strășeni = collect($response->json('data'))->firstWhere('name', 'Strășeni');
        $localityNames = collect($strășeni['localities'])->pluck('name');
        $this->assertTrue($localityNames->contains('Strășeni'));
        $this->assertFalse($localityNames->contains('Căpriana'));
    }

    public function test_admin_can_create_and_deactivate_regions_and_localities(): void
    {
        $admin = $this->userWithRole('admin');
        Sanctum::actingAs($admin);

        $region = $this->postJson('/api/v1/admin/geo/regions', [
            'name' => 'Orhei',
            'type' => 'raion',
        ])
            ->assertCreated()
            ->assertJsonPath('region.is_active', true)
            ->json('region');

        $this->postJson('/api/v1/admin/geo/regions/'.$region['id'].'/localities', [
            'name' => 'Orhei',
            'type' => 'oras',
        ])
            ->assertCreated()
            ->assertJsonPath('locality.name', 'Orhei');

        $this->putJson('/api/v1/admin/geo/regions/'.$region['id'], [
            'name' => 'Orhei',
            'type' => 'raion',
            'is_active' => false,
        ])
            ->assertOk()
            ->assertJsonPath('region.is_active', false);

        $this->assertDatabaseHas('regions', ['id' => $region['id'], 'is_active' => false]);
    }

    public function test_region_management_is_forbidden_for_non_admins(): void
    {
        $patient = $this->userWithRole('patient');
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/admin/geo/regions', ['name' => 'Hack', 'type' => 'raion'])
            ->assertForbidden();
    }

    public function test_patient_profile_requires_catalog_backed_address(): void
    {
        $patient = $this->userWithRole('patient');
        $this->grantProfileSlot($patient);
        $locality = $this->activeLocality();

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/profiles', [
            'first_name' => 'Ana',
            'last_name' => 'Popescu',
            'identity_number' => '2000000000001',
            'country' => 'Republica Moldova',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['region_id', 'locality_id', 'address']);

        $response = $this->postJson('/api/v1/patient/profiles', [
            'first_name' => 'Ana',
            'last_name' => 'Popescu',
            'identity_number' => '2000000000001',
            'country' => 'Republica Moldova',
            'region_id' => $locality->region_id,
            'locality_id' => $locality->id,
            'address' => 'Strada Ismail 5',
        ])->assertCreated();

        $profile = PatientProfile::findOrFail($response->json('patient_profile.id'));
        $this->assertSame($locality->region_id, $profile->region_id);
        $this->assertSame($locality->id, $profile->locality_id);
        $this->assertSame($locality->region->name, $profile->region);
        $this->assertSame($locality->name, $profile->locality);
        $this->assertTrue($profile->hasCompleteAddress());
    }

    public function test_locality_must_belong_to_the_selected_region(): void
    {
        $patient = $this->userWithRole('patient');
        $this->grantProfileSlot($patient);

        $regionA = Region::create(['name' => 'Cahul', 'type' => 'raion', 'is_active' => true]);
        $regionB = Region::create(['name' => 'Soroca', 'type' => 'raion', 'is_active' => true]);
        $localityB = $regionB->localities()->create(['name' => 'Soroca', 'type' => 'oras', 'is_active' => true]);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/profiles', [
            'first_name' => 'Ana',
            'last_name' => 'Popescu',
            'identity_number' => '2000000000002',
            'country' => 'Republica Moldova',
            'region_id' => $regionA->id,
            'locality_id' => $localityB->id,
            'address' => 'Strada Test 1',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('locality_id');
    }

    public function test_with_exam_request_is_blocked_without_a_complete_address(): void
    {
        $patient = $this->userWithRole('patient');
        $profile = $this->profileWithoutAddress($patient);
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', [
            'type' => 'doctor',
            'patient_profile_id' => $profile->id,
            'symptoms' => 'Febra',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Completează adresa profilului (raion, localitate și stradă) înainte de o consultație cu examinare la domiciliu.');
    }

    public function test_video_request_is_not_blocked_by_missing_address(): void
    {
        $patient = $this->userWithRole('patient');
        $profile = $this->profileWithoutAddress($patient);
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', [
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $profile->id,
            'symptoms' => 'Consult preliminar',
        ])->assertCreated();
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function activeLocality(): Locality
    {
        $region = Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);

        return $region->localities()->create(['name' => 'Chișinău', 'type' => 'municipiu', 'is_active' => true]);
    }

    private function grantProfileSlot(User $user): void
    {
        PatientCardPurchase::create([
            'user_id' => $user->id,
            'profile_slots' => 1,
            'amount_minor' => 24000,
            'validity_days' => 365,
            'used_slots' => 0,
            'expires_at' => now()->addYear(),
        ]);
    }

    private function profileWithoutAddress(User $user): PatientProfile
    {
        return PatientProfile::create([
            'user_id' => $user->id,
            'first_name' => 'Ion',
            'last_name' => 'Popescu',
            'identity_number' => '2000000000009',
            'country' => 'Republica Moldova',
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);
    }
}
