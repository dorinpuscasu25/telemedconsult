<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\Locality;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\PatientCardPackage;
use App\Models\PatientCardPurchase;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PatientCardsAndConsultationFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_creation_requires_a_patient_profile_id(): void
    {
        $patient = $this->userWithRole('patient');
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', [
            'type' => 'doctor',
            'symptoms' => 'Febra',
            'scheduled_at' => now()->addDay()->toDateTimeString(),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('patient_profile_id');
    }

    public function test_request_creation_rejects_profile_from_another_user(): void
    {
        $patient = $this->userWithRole('patient');
        $otherPatient = $this->userWithRole('patient');
        $profile = $this->activeProfile($otherPatient);

        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', $this->requestPayload($profile))
            ->assertForbidden()
            ->assertJsonPath('message', 'Profilul de pacient nu aparține contului tău.');
    }

    public function test_request_creation_rejects_expired_profiles_with_clear_message(): void
    {
        $patient = $this->userWithRole('patient');
        $profile = $this->activeProfile($patient, ['active_until' => now()->subDay()]);

        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', $this->requestPayload($profile))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Cartela profilului de pacient a expirat. Reînnoiește cartela înainte de o consultație nouă.');
    }

    public function test_request_creation_requires_complete_active_profile(): void
    {
        $patient = $this->userWithRole('patient');
        $profile = PatientProfile::create([
            'user_id' => $patient->id,
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);

        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', $this->requestPayload($profile))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Profilul de pacient este incomplet. Completează numele și IDNP-ul înainte de consultație.');
    }

    public function test_request_creation_links_to_selected_patient_profile(): void
    {
        $patient = $this->userWithRole('patient');
        $profile = $this->activeProfile($patient);
        $this->seedEligibleOperator($profile->region_id);

        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 100000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/requests', $this->requestPayload($profile))
            ->assertCreated()
            ->assertJsonPath('request.patient_profile.id', (string) $profile->id);

        $this->assertTrue(
            ConsultationRequest::where('patient_id', $patient->id)
                ->where('patient_profile_id', $profile->id)
                ->exists(),
        );
    }

    public function test_card_purchase_debits_wallet_and_profile_creation_consumes_slots(): void
    {
        $patient = $this->userWithRole('patient');
        $package = PatientCardPackage::create([
            'name' => '1 profil / an',
            'profile_slots' => 1,
            'price_minor' => 24000,
            'validity_days' => 365,
            'is_active' => true,
        ]);
        $wallet = Wallet::create(['user_id' => $patient->id, 'balance_minor' => 50000, 'currency' => 'MDL']);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases', ['package_id' => $package->id])
            ->assertCreated();

        $this->assertSame(26000, $wallet->refresh()->balance_minor);
        $this->assertDatabaseHas('wallet_transactions', [
            'user_id' => $patient->id,
            'amount_minor' => -24000,
            'type' => 'patient_card_purchase',
            'status' => 'completed',
        ]);

        $this->postJson('/api/v1/patient/profiles', $this->profilePayload('Ana'))
            ->assertCreated();

        $purchase = PatientCardPurchase::where('user_id', $patient->id)->firstOrFail();
        $this->assertSame(1, $purchase->used_slots);
        $this->assertSame(0, $purchase->availableSlots());

        $this->postJson('/api/v1/patient/profiles', $this->profilePayload('Maria'))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Nu ai cartele disponibile pentru un profil nou.');
    }

    public function test_card_purchase_returns_structured_wallet_error_when_balance_is_insufficient(): void
    {
        $patient = $this->userWithRole('patient');
        $package = PatientCardPackage::create([
            'name' => '2 profiluri / an',
            'description' => 'Două profiluri active.',
            'profile_slots' => 2,
            'price_minor' => 45000,
            'validity_days' => 365,
            'is_active' => true,
        ]);
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 10000, 'currency' => 'MDL']);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases', ['package_id' => $package->id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_wallet_balance')
            ->assertJsonPath('required_amount', 450)
            ->assertJsonPath('current_balance', 100)
            ->assertJsonPath('missing_amount', 350);

        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_patient_profile_response_includes_active_package_descriptions(): void
    {
        $patient = $this->userWithRole('patient');
        PatientCardPackage::create([
            'name' => 'Pachet test',
            'description' => 'Descriere afișată pacientului.',
            'profile_slots' => 9,
            'price_minor' => 24000,
            'validity_days' => 365,
            'is_active' => true,
        ]);

        Sanctum::actingAs($patient);

        $response = $this->getJson('/api/v1/patient/profile')
            ->assertOk();

        $this->assertTrue(collect($response->json('card_packages'))->contains(
            fn (array $package) => $package['description'] === 'Descriere afișată pacientului.',
        ));
    }

    public function test_admin_can_manage_patient_card_packages_from_dedicated_endpoints(): void
    {
        $this->assertTrue(Schema::hasColumn('patient_card_packages', 'description'));

        $admin = $this->userWithRole('admin');
        Sanctum::actingAs($admin);

        $created = $this->postJson('/api/v1/admin/patient-card-packages', [
            'name' => 'Familie',
            'description' => 'Pachet pentru familie.',
            'profile_slots' => 4,
            'price' => 550,
            'validity_days' => 365,
            'is_active' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('package.description', 'Pachet pentru familie.')
            ->json('package');

        $this->putJson('/api/v1/admin/patient-card-packages/'.$created['id'], [
            'name' => 'Familie Plus',
            'description' => 'Descriere actualizată.',
            'profile_slots' => 5,
            'price' => 650,
            'validity_days' => 400,
            'is_active' => true,
        ])
            ->assertOk()
            ->assertJsonPath('package.name', 'Familie Plus')
            ->assertJsonPath('package.description', 'Descriere actualizată.')
            ->assertJsonPath('package.price', 650);

        $this->deleteJson('/api/v1/admin/patient-card-packages/'.$created['id'])
            ->assertOk()
            ->assertJsonPath('package.is_active', false);

        $this->assertDatabaseHas('patient_card_packages', [
            'id' => $created['id'],
            'is_active' => false,
        ]);
    }

    public function test_inactive_packages_are_not_purchasable(): void
    {
        $patient = $this->userWithRole('patient');
        $package = PatientCardPackage::create([
            'name' => 'Pachet inactiv',
            'profile_slots' => 1,
            'price_minor' => 10000,
            'validity_days' => 365,
            'is_active' => false,
        ]);
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 50000, 'currency' => 'MDL']);

        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases', ['package_id' => $package->id])
            ->assertNotFound();

        $this->assertSame(0, WalletTransaction::count());
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create([
            'active_role_id' => $role->id,
            'status' => 'active',
        ]);
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function activeProfile(User $user, array $overrides = []): PatientProfile
    {
        $locality = $this->seededLocality();

        return PatientProfile::create([
            'user_id' => $user->id,
            'first_name' => 'Ion',
            'last_name' => 'Popescu',
            'identity_number' => '2000000000000',
            'birth_date' => '1990-01-01',
            'gender' => 'M',
            'country' => 'Republica Moldova',
            'region' => $locality->region->name,
            'region_id' => $locality->region_id,
            'locality' => $locality->name,
            'locality_id' => $locality->id,
            'address' => 'Strada Test 1',
            'status' => 'active',
            'active_until' => now()->addYear(),
            ...$overrides,
        ]);
    }

    private function seedEligibleOperator(int $regionId): User
    {
        $operator = $this->userWithRole('operator');
        OperatorProfile::create([
            'user_id' => $operator->id,
            'is_available' => true,
            'is_approved' => true,
            'accepting_requests' => true,
        ]);
        OperatorCoverage::create(['operator_id' => $operator->id, 'region_id' => $regionId]);

        return $operator;
    }

    private function seededLocality(): Locality
    {
        $region = Region::firstOrCreate(
            ['country' => 'Republica Moldova', 'name' => 'Chișinău'],
            ['type' => 'municipiu', 'is_active' => true],
        );

        return Locality::firstOrCreate(
            ['region_id' => $region->id, 'name' => 'Chișinău'],
            ['type' => 'municipiu', 'is_active' => true],
        );
    }

    private function requestPayload(PatientProfile $profile): array
    {
        return [
            'type' => 'doctor',
            'patient_profile_id' => $profile->id,
            'symptoms' => 'Febra',
            'scheduled_at' => now()->addDay()->toDateTimeString(),
        ];
    }

    private function profilePayload(string $firstName): array
    {
        $locality = $this->seededLocality();

        return [
            'first_name' => $firstName,
            'last_name' => 'Popescu',
            'identity_number' => fake()->unique()->numerify('2############'),
            'birth_date' => '1990-01-01',
            'gender' => 'F',
            'country' => 'Republica Moldova',
            'region_id' => $locality->region_id,
            'locality_id' => $locality->id,
            'address' => 'Strada Test 1',
        ];
    }
}
