<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\DoctorService;
use App\Models\Locality;
use App\Models\PatientCardPackage;
use App\Models\PatientCardPurchase;
use App\Models\PatientProfile;
use App\Models\Payment;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FreePatientProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_choose_another_person_and_create_one_year_profile_without_payment_or_bonus(): void
    {
        $owner = $this->owner();
        $this->getJson('/api/v1/patient/profile')->assertOk()->assertJsonPath('free_profile.available', true)->assertJsonPath('free_profile.validity_years', 1)->assertJsonPath('can_add_patient', true);
        $id = $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->assertJsonPath('patient_profile.is_free', true)->assertJsonPath('patient_profile.first_name', 'Ana')->json('patient_profile.id');
        $profile = PatientProfile::findOrFail($id);
        $this->assertSame($owner->id, $profile->user_id);
        $this->assertTrue($profile->active_until->equalTo(now()->addYearNoOverflow()));
        $this->assertTrue($owner->fresh()->free_patient_profile_claimed_at->equalTo(now()));
        $this->getJson('/api/v1/patient/profile')->assertOk()->assertJsonPath('free_profile.available', false)->assertJsonPath('can_add_patient', false)->assertJsonPath('patient_profiles.0.can_request_consultation', true);
        foreach ([Wallet::class, WalletTransaction::class, Payment::class, PatientCardPurchase::class] as $model) {
            $this->assertSame(0, $model::count());
        }
    }

    public function test_replayed_request_reloads_account_under_lock_and_cannot_claim_again(): void
    {
        $owner = $this->owner();
        $payload = $this->payload();
        $this->postJson('/api/v1/patient/profiles', $payload)->assertCreated();
        $this->assertNull($owner->free_patient_profile_claimed_at);
        $this->postJson('/api/v1/patient/profiles', $payload)->assertUnprocessable()->assertJsonPath('code', 'free_profile_already_claimed');
        $this->assertSame(1, PatientProfile::where('user_id', $owner->id)->count());
    }

    public function test_free_choice_does_not_consume_paid_slot_and_next_profile_can_use_paid_package(): void
    {
        $owner = $this->owner();
        $package = PatientCardPackage::create(['name' => 'Familie', 'profile_slots' => 2, 'price_minor' => 45000, 'bonus_points_minor' => 45000, 'validity_days' => 365, 'is_active' => true]);
        $purchase = PatientCardPurchase::create(['user_id' => $owner->id, 'patient_card_package_id' => $package->id, 'profile_slots' => 2, 'used_slots' => 0, 'amount_minor' => 45000, 'validity_days' => 365, 'expires_at' => now()->addDays(365)]);
        $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->assertJsonPath('patient_profile.is_free', true);
        $this->assertSame(0, $purchase->fresh()->used_slots);
        $this->getJson('/api/v1/patient/profile')->assertJsonPath('can_add_patient', true)->assertJsonPath('free_profile.available', false);
        $paid = $this->postJson('/api/v1/patient/profiles', array_replace($this->payload(), ['first_name' => 'Ion', 'use_free_profile' => false]))->assertCreated();
        $this->assertFalse(PatientProfile::findOrFail($paid->json('patient_profile.id'))->is_free);
        $this->assertSame(1, $purchase->fresh()->used_slots);
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_deleting_free_profile_does_not_restore_entitlement(): void
    {
        $owner = $this->owner();
        $id = $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->json('patient_profile.id');
        $this->deleteJson('/api/v1/patient/profiles/'.$id)->assertOk();
        $this->assertNotNull($owner->fresh()->free_patient_profile_claimed_at);
        $this->getJson('/api/v1/patient/profile')->assertJsonPath('free_profile.available', false)->assertJsonPath('can_add_patient', false);
        $this->postJson('/api/v1/patient/profiles', $this->payload())->assertUnprocessable()->assertJsonPath('code', 'free_profile_already_claimed');
        $this->postJson('/api/v1/patient/profiles', array_replace($this->payload(), ['use_free_profile' => false]))->assertUnprocessable()->assertJsonPath('code', 'package_required');
        $this->assertSame(0, PatientProfile::count());
    }

    public function test_expiry_blocks_new_consultation_at_exact_deadline_and_does_not_restore_grant(): void
    {
        $this->owner();
        $id = $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->json('patient_profile.id');
        $this->travelTo(PatientProfile::findOrFail($id)->active_until);
        $this->getJson('/api/v1/patient/profile')->assertJsonPath('patient_profiles.0.can_request_consultation', false)->assertJsonPath('free_profile.available', false);
        $this->postJson('/api/v1/requests', ['type' => 'doctor', 'patient_profile_id' => $id, 'symptoms' => 'Descriere', 'scheduled_at' => now()->addDay()->toDateTimeString()])->assertUnprocessable()->assertJsonPath('message', 'Cartela profilului de pacient a expirat. Reînnoiește cartela înainte de o consultație nouă.');
        $this->postJson('/api/v1/patient/profiles', $this->payload())->assertUnprocessable()->assertJsonPath('code', 'free_profile_already_claimed');
    }

    public function test_free_profile_does_not_include_free_consultation(): void
    {
        $this->owner();
        $id = $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->json('patient_profile.id');
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        $service = DoctorService::create(['doctor_id' => $doctor->id, 'name' => 'Consultație în chat', 'type' => 'chat', 'price' => 150, 'duration' => 24]);
        $request = ['patient_profile_id' => $id, 'doctor_id' => $doctor->id, 'service_id' => $service->id];
        $this->postJson('/api/v1/requests/preview', $request)->assertOk()->assertJsonPath('cost.total', 150)->assertJsonPath('payment.total', 150);
        $this->postJson('/api/v1/requests', $request + ['type' => 'video', 'symptoms' => 'Descriere'])->assertUnprocessable()->assertJsonPath('code', 'insufficient_wallet_balance');
        $this->assertSame(0, ConsultationRequest::count());
        $this->assertSame(0, WalletTransaction::count());
    }

    public function test_invalid_details_and_eligibility_spoofing_do_not_consume_free_profile(): void
    {
        $owner = $this->owner();
        $this->postJson('/api/v1/patient/profiles', array_replace($this->payload(), ['gender' => 'invalid']))->assertUnprocessable()->assertJsonValidationErrors('gender');
        $this->postJson('/api/v1/patient/profiles', array_replace($this->payload(), ['use_free_profile' => 'invalid']))->assertUnprocessable()->assertJsonValidationErrors('use_free_profile');
        $this->postJson('/api/v1/patient/profiles', $this->payload() + ['is_free' => true, 'user_id' => $this->user('patient')->id, 'active_until' => now()->addYears(10)->toDateTimeString()])->assertUnprocessable()->assertJsonValidationErrors(['is_free', 'user_id', 'active_until']);
        $this->assertNull($owner->fresh()->free_patient_profile_claimed_at);
        $this->assertSame(0, PatientProfile::count());
        $id = $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->json('patient_profile.id');
        $this->putJson('/api/v1/patient/profiles/'.$id, ['use_free_profile' => true, 'is_free' => false, 'active_until' => now()->addYears(10)->toDateTimeString()])->assertUnprocessable()->assertJsonValidationErrors(['use_free_profile', 'is_free', 'active_until']);
        $this->assertTrue(PatientProfile::findOrFail($id)->active_until->equalTo(now()->addYearNoOverflow()));
    }

    public function test_calendar_year_from_leap_day_ends_on_february_twenty_eight(): void
    {
        $this->owner();
        $this->travelTo(Carbon::create(2028, 2, 29, 12, 0, 0));
        $id = $this->postJson('/api/v1/patient/profiles', $this->payload())->assertCreated()->json('patient_profile.id');
        $this->assertSame('2029-02-28', PatientProfile::findOrFail($id)->active_until->toDateString());
    }

    public function test_provider_without_patient_role_cannot_claim_profile(): void
    {
        $this->owner();
        Sanctum::actingAs($this->user('doctor'));
        $this->postJson('/api/v1/patient/profiles', $this->payload())->assertForbidden();
        $this->assertSame(0, PatientProfile::count());
    }

    private function owner(): User
    {
        $this->travelTo(now()->startOfDay()->addHours(12));
        $user = $this->user('patient');
        Queue::fake();
        Sanctum::actingAs($user);

        return $user;
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['name' => 'Titularul contului', 'active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }

    private function payload(): array
    {
        $region = Region::firstOrCreate(['country' => 'Republica Moldova', 'name' => 'Chișinău'], ['type' => 'municipiu', 'is_active' => true]);
        $locality = Locality::firstOrCreate(['region_id' => $region->id, 'name' => 'Chișinău'], ['type' => 'municipiu', 'is_active' => true]);

        return ['first_name' => 'Ana', 'last_name' => 'Exemplu', 'birth_date' => '2018-01-01', 'gender' => 'F', 'country' => 'Republica Moldova', 'region_id' => $region->id, 'locality_id' => $locality->id, 'address' => 'Strada Demo 1', 'use_free_profile' => true];
    }
}
