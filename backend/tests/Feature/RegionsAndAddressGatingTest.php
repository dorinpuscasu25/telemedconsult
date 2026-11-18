<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\Locality;
use App\Models\PatientCardPurchase;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Services\PlatformConfig;
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
            'country' => 'Republica Moldova',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['region_id', 'locality_id', 'birth_date', 'gender'])
            ->assertJsonMissingValidationErrors('address');

        $response = $this->postJson('/api/v1/patient/profiles', [
            'first_name' => 'Ana',
            'last_name' => 'Popescu',
            'country' => 'Republica Moldova',
            'birth_date' => '1990-01-01',
            'gender' => 'F',
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

    public function test_foreign_patient_uses_country_list_and_manual_location_without_moldovan_ids(): void
    {
        $this->getJson('/api/v1/catalog/countries')->assertOk()->assertJsonFragment(['code' => 'RO', 'name' => 'România']);
        $patient = $this->userWithRole('patient');
        $this->grantProfileSlot($patient);
        Sanctum::actingAs($patient);
        $payload = ['first_name' => 'Ana', 'last_name' => 'Popescu', 'birth_date' => '1990-01-01', 'gender' => 'F', 'country_code' => 'RO', 'region' => '  Județul   Iași ', 'city' => ' Iași ', 'locality' => ' Iași '];
        $id = $this->postJson('/api/v1/patient/profiles', $payload)->assertCreated()
            ->assertJsonPath('patient_profile.country', 'România')->assertJsonPath('patient_profile.country_code', 'RO')
            ->assertJsonPath('patient_profile.region', 'Județul Iași')->assertJsonPath('patient_profile.city', 'Iași')->assertJsonPath('patient_profile.region_id', null)->json('patient_profile.id');
        $this->putJson('/api/v1/patient/profiles/'.$id, ['first_name' => 'Ana-Maria'])->assertOk();
        $this->assertDatabaseHas('patient_profiles', ['id' => $id, 'country_code' => 'RO', 'city' => 'Iași', 'locality_id' => null]);
        $this->putJson('/api/v1/patient/profiles/'.$id, ['country_code' => 'MD'])->assertUnprocessable()->assertJsonValidationErrors(['region_id', 'locality_id']);
        $this->assertDatabaseHas('patient_profiles', ['id' => $id, 'country_code' => 'RO']);
        $locality = $this->activeLocality();
        $this->putJson('/api/v1/patient/profiles/'.$id, ['country_code' => 'MD', 'region_id' => $locality->region_id, 'locality_id' => $locality->id])->assertOk();
        $this->assertDatabaseHas('patient_profiles', ['id' => $id, 'country_code' => 'MD', 'country' => 'Republica Moldova', 'city' => null, 'region' => $locality->region->name, 'locality' => $locality->name]);
        $this->putJson('/api/v1/patient/profiles/'.$id, ['country_code' => 'IT', 'city' => 'Roma', 'locality' => 'Roma'])->assertOk();
        $this->assertDatabaseHas('patient_profiles', ['id' => $id, 'country_code' => 'IT', 'city' => 'Roma', 'region' => null, 'region_id' => null, 'locality_id' => null]);
    }

    public function test_foreign_address_rejects_unknown_country_moldovan_catalog_ids_and_missing_locality(): void
    {
        $patient = $this->userWithRole('patient');
        $this->grantProfileSlot($patient);
        $locality = $this->activeLocality();
        Sanctum::actingAs($patient);
        $payload = ['first_name' => 'Ana', 'last_name' => 'Popescu', 'birth_date' => '1990-01-01', 'gender' => 'F', 'country_code' => 'RO', 'city' => 'Iași', 'locality' => 'Iași'];
        $this->postJson('/api/v1/patient/profiles', [...$payload, 'country_code' => 'ZZ'])->assertUnprocessable()->assertJsonValidationErrors('country_code');
        $this->postJson('/api/v1/patient/profiles', [...$payload, 'region_id' => $locality->region_id, 'locality_id' => $locality->id])->assertUnprocessable()->assertJsonValidationErrors(['region_id', 'locality_id']);
        $this->postJson('/api/v1/patient/profiles', [...$payload, 'locality' => ''])->assertUnprocessable()->assertJsonValidationErrors('locality');
        $this->assertSame(0, PatientProfile::count());
    }

    public function test_admin_geography_counts_profiles_separately_and_normalizes_location_spelling(): void
    {
        $owner = $this->userWithRole('patient');
        foreach ([['country_code' => 'RO', 'country' => 'România', 'region' => 'Județul Iași', 'city' => 'Iași', 'locality' => 'Iași'], ['country_code' => 'RO', 'country' => 'România', 'region' => ' județul  iași ', 'city' => 'iasi', 'locality' => 'IAȘI'], ['country' => 'Republica Moldova', 'locality' => 'Chișinău']] as $location) {
            PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Pacient', 'last_name' => 'Test', ...$location]);
        }
        Sanctum::actingAs($owner);
        $this->getJson('/api/v1/admin/geo/patients')->assertForbidden();
        Sanctum::actingAs($this->userWithRole('admin'));
        $response = $this->getJson('/api/v1/admin/geo/patients')->assertOk()->assertJsonPath('unit', 'patient_profiles')->assertJsonCount(2, 'data');
        $romania = collect($response->json('data'))->firstWhere('code', 'RO');
        $this->assertSame(2, $romania['profiles']);
        $this->assertCount(1, $romania['localities']);
        $this->assertSame(2, $romania['localities'][0]['profiles']);
        $this->assertSame(1, collect($response->json('data'))->firstWhere('code', 'MD')['profiles']);
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

    public function test_operator_mode_disabled_allows_direct_doctor_booking_without_address_or_operator_fees(): void
    {
        $patient = $this->userWithRole('patient');
        $profile = $this->profileWithoutAddress($patient);
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'consultation_price' => 700, 'video_price' => 500, 'is_available' => true, 'is_approved' => true]);
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);
        app(PlatformConfig::class)->upsert('feature.with_exam_consultations', false, 'features', 'boolean');
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/requests/preview', ['consultation_kind' => 'video', 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id])
            ->assertOk()->assertJsonPath('eligible', true)->assertJsonPath('cost.doctor_base', 500)->assertJsonPath('cost.travel_fee', 0)->assertJsonCount(0, 'cost.investigations')->assertJsonMissingPath('operator');
        $this->postJson('/api/v1/requests', [
            'type' => 'video', 'consultation_kind' => 'video', 'patient_profile_id' => $profile->id, 'doctor_id' => $doctor->id, 'operator_id' => $doctor->id, 'symptoms' => 'Consultație directă',
        ])->assertCreated()->assertJsonPath('request.consultation_kind', 'video')->assertJsonPath('request.operator_id', null);
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
            'country' => 'Republica Moldova',
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);
    }
}
