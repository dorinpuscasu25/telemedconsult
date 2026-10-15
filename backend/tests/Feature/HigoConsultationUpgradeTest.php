<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorInvestigationRequirement;
use App\Models\DoctorProfile;
use App\Models\InvestigationType;
use App\Models\Locality;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\ConsultationCostEstimator;
use App\Services\OperatorAssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HigoConsultationUpgradeTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_proposes_and_only_owner_confirms_extra_cost_once(): void
    {
        [$request, $investigation, $operator] = $this->scenario();
        $this->mockServices($operator);
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-proposal', ['investigation_ids' => [$investigation->id], 'notes' => 'Examinare recomandată'])->assertOk();
        $this->assertSame('video', $request->fresh()->consultation_kind);
        $this->assertSame(0, WalletTransaction::count());
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-confirm', ['proposal_id' => 'fake', 'additional_minor' => 50000])->assertForbidden();
        Sanctum::actingAs($request->patient);
        $quote = $this->getJson('/api/v1/requests/'.$request->id.'/higo-quote')->assertOk()->json();
        $this->assertSame(50000, $quote['additional_minor']);
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-confirm', ['proposal_id' => $quote['proposal_id'], 'additional_minor' => 1])->assertUnprocessable();
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-confirm', ['proposal_id' => $quote['proposal_id'], 'additional_minor' => $quote['additional_minor']])->assertOk();
        $this->assertSame('with_exam', $request->fresh()->consultation_kind);
        $this->assertSame($operator->id, $request->fresh()->operator_id);
        $this->assertSame(80000, $request->fresh()->amount_minor);
        $this->assertSame(10000, Wallet::where('user_id', $request->patient_id)->value('balance_minor'));
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-confirm', ['proposal_id' => $quote['proposal_id'], 'additional_minor' => $quote['additional_minor']])->assertUnprocessable();
        $this->assertSame(1, WalletTransaction::count());
    }

    public function test_insufficient_cash_does_not_change_consultation_or_reserve_money(): void
    {
        [$request, $investigation, $operator] = $this->scenario();
        $this->mockServices($operator);
        Wallet::where('user_id', $request->patient_id)->update(['balance_minor' => 100]);
        Sanctum::actingAs($request->doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-proposal', ['investigation_ids' => [$investigation->id]])->assertOk();
        Sanctum::actingAs($request->patient);
        $quote = $this->getJson('/api/v1/requests/'.$request->id.'/higo-quote')->assertOk()->json();
        $this->postJson('/api/v1/requests/'.$request->id.'/higo-confirm', ['proposal_id' => $quote['proposal_id'], 'additional_minor' => $quote['additional_minor']])->assertUnprocessable();
        $this->assertSame('video', $request->fresh()->consultation_kind);
        $this->assertSame(0, WalletTransaction::count());
    }

    private function mockServices(User $operator): void
    {
        $this->mock(OperatorAssignmentService::class)->shouldReceive('pickOperatorId')->andReturn($operator->id);
        $this->mock(ConsultationCostEstimator::class)->shouldReceive('estimate')->andReturn(['doctor_base' => 500, 'investigations' => [['id' => 1, 'name' => 'Otoscopie', 'price' => 250]], 'investigations_total' => 250, 'travel_fee' => 50, 'total' => 800]);
    }

    private function scenario(): array
    {
        Queue::fake();
        $owner = User::factory()->create();
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']));
        DoctorProfile::create(['user_id' => $doctor->id, 'consultation_price' => 500]);
        $operator = User::factory()->create();
        $region = Region::create(['name' => 'Chișinău', 'slug' => 'chisinau', 'is_active' => true]);
        $locality = Locality::create(['region_id' => $region->id, 'name' => 'Chișinău', 'slug' => 'chisinau', 'is_active' => true]);
        $patient = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Eva', 'last_name' => 'Pop', 'region_id' => $region->id, 'locality_id' => $locality->id, 'address' => 'Adresă test']);
        $investigation = InvestigationType::create(['name' => 'Otoscopie', 'code' => 'otoscopy', 'default_price' => 250, 'is_active' => true]);
        DoctorInvestigationRequirement::create(['doctor_id' => $doctor->id, 'investigation_type_id' => $investigation->id, 'requirement' => 'optional']);
        Wallet::create(['user_id' => $owner->id, 'type' => 'real', 'currency' => 'MDL', 'balance_minor' => 60000]);
        $request = ConsultationRequest::create(['patient_id' => $owner->id, 'patient_profile_id' => $patient->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'payment_status' => 'held', 'amount_minor' => 30000, 'real_amount_minor' => 30000]);

        return [$request, $investigation, $operator];
    }
}
