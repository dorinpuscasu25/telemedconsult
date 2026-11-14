<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionTransfer;
use App\Models\MedicalInstitution;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Services\FinancialBreakdown;
use App\Services\InstitutionLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InstitutionTransferTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_target_manager_approves_and_affiliation_stays_until_approval(): void
    {
        [$doctor, $source, $target, $managerA, $managerB] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id, 'note' => 'Mă transfer'])->assertCreated()->json('transfer.id');
        $this->assertSame($source->id, $doctor->doctorProfile->fresh()->medical_institution_id);
        $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertUnprocessable();
        Sanctum::actingAs($managerA);
        $this->getJson('/api/v1/institution/transfers?status=pending')->assertOk()->assertJsonPath('data.0.direction', 'outgoing');
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 60])->assertNotFound();
        Sanctum::actingAs($managerB);
        $this->getJson('/api/v1/institution/transfers?status=pending')->assertOk()->assertJsonPath('data.0.direction', 'incoming');
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 60])->assertOk();
        $this->assertSame($target->id, $doctor->doctorProfile->fresh()->medical_institution_id);
        $this->assertEquals(60, $doctor->doctorProfile->fresh()->institution_share_percent);
        $this->assertSame($managerB->id, InstitutionTransfer::findOrFail($id)->decided_by);
        $this->assertSame('active', $doctor->fresh()->status);
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 10])->assertUnprocessable();
        $this->assertEquals(60, $doctor->doctorProfile->fresh()->institution_share_percent);
        Sanctum::actingAs($managerA);
        $this->putJson('/api/v1/institution/doctors/'.$doctor->id, ['doctor_share_percent' => 10])->assertNotFound();
        $this->deleteJson('/api/v1/institution/doctors/'.$doctor->id)->assertNotFound();
    }

    public function test_existing_and_legacy_bookings_keep_source_while_explicit_independent_booking_stays_independent(): void
    {
        [$doctor, $source, $target, , $manager] = $this->scenario();
        $old = $this->booking($doctor, ['institution_id' => $source->id, 'doctor_share_percent' => 40]);
        $legacy = $this->booking($doctor, []);
        $independent = $this->booking($doctor, ['institution_id' => null, 'doctor_share_percent' => null]);
        $beforeJoin = $this->booking($doctor, []);
        $beforeJoin->forceFill(['created_at' => now()->subDays(5)])->save();
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertCreated()->json('transfer.id');
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 60])->assertOk();
        $ledger = app(InstitutionLedger::class);
        foreach ([$old, $legacy] as $request) {
            $earning = $ledger->recordEarning($request->fresh(), $doctor->fresh());
            $this->assertSame($source->id, $earning->medical_institution_id);
            $this->assertSame(17000, $earning->doctor_amount_minor);
        }
        $this->assertNull($ledger->recordEarning($independent->fresh(), $doctor->fresh()));
        $this->assertNull($ledger->recordEarning($beforeJoin->fresh(), $doctor->fresh()));
        $future = app(FinancialBreakdown::class)->forProvider(50000, $doctor->fresh());
        $this->assertSame($target->id, $future['institution_id']);
        $this->assertEquals(60, $future['doctor_share_percent']);
        $patient = $this->user('patient');
        $patientProfile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Ana', 'last_name' => 'Exemplu', 'status' => 'active']);
        Wallet::create(['user_id' => $patient->id, 'type' => 'real', 'balance_minor' => 100000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);
        $newId = $this->postJson('/api/v1/requests', ['type' => 'video', 'doctor_id' => $doctor->id, 'patient_profile_id' => $patientProfile->id, 'symptoms' => 'Consultație după transfer'])->assertCreated()->json('request.id');
        $newRequest = ConsultationRequest::findOrFail($newId);
        $this->assertSame($target->id, $newRequest->pricing_snapshot['institution_id']);
        $this->assertEquals(60, $newRequest->pricing_snapshot['doctor_share_percent']);
    }

    public function test_rejection_and_cancellation_preserve_source_and_allow_new_request(): void
    {
        [$doctor, $source, $target, , $manager] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertCreated()->json('transfer.id');
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'rejected'])->assertUnprocessable();
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'rejected', 'decision_note' => 'Nu sunt locuri'])->assertOk();
        $this->assertSame($source->id, $doctor->doctorProfile->fresh()->medical_institution_id);
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertCreated()->json('transfer.id');
        $this->deleteJson("/api/v1/doctor/institution-transfers/{$id}")->assertOk();
        $this->deleteJson("/api/v1/doctor/institution-transfers/{$id}")->assertUnprocessable();
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 50])->assertUnprocessable();
    }

    public function test_foreign_doctor_manager_inactive_institution_and_stale_source_are_blocked(): void
    {
        [$doctor, $source, $target, , $manager] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $source->id])->assertUnprocessable();
        $target->update(['status' => 'suspended']);
        $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertUnprocessable();
        $target->update(['status' => 'active']);
        $id = $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertCreated()->json('transfer.id');
        Sanctum::actingAs($this->user('doctor'));
        $this->deleteJson("/api/v1/doctor/institution-transfers/{$id}")->assertNotFound();
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/doctor/institution-transfers')->assertForbidden();
        $doctor->doctorProfile->update(['medical_institution_id' => null]);
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 50])->assertStatus(409);
        $this->assertNull($doctor->doctorProfile->fresh()->medical_institution_id);
    }

    public function test_doctor_can_request_historical_institution_balance_and_only_original_manager_pays(): void
    {
        [$doctor, $source, $target, $managerA, $managerB] = $this->scenario();
        $request = $this->booking($doctor, ['institution_id' => $source->id, 'doctor_share_percent' => 40]);
        app(InstitutionLedger::class)->recordEarning($request, $doctor);
        $doctor->doctorProfile->update(['medical_institution_id' => $target->id]);
        Sanctum::actingAs($doctor);
        $rows = $this->getJson('/api/v1/doctor/stats')->assertOk()->json('institution_balances');
        $this->assertEquals(170, collect($rows)->firstWhere('id', $source->id)['balance']);
        $id = $this->postJson('/api/v1/doctor/withdrawals', ['source' => 'institution', 'institution_id' => $source->id, 'amount' => 100])->assertCreated()->json('withdrawal.id');
        $this->postJson('/api/v1/doctor/withdrawals', ['source' => 'institution', 'institution_id' => $source->id, 'amount' => 100])->assertUnprocessable();
        $foreign = MedicalInstitution::create(['name' => 'Străină', 'status' => 'active']);
        $this->postJson('/api/v1/doctor/withdrawals', ['source' => 'institution', 'institution_id' => $foreign->id, 'amount' => 1])->assertNotFound();
        Sanctum::actingAs($managerB);
        $this->putJson("/api/v1/institution/withdrawals/{$id}", ['status' => 'approved'])->assertNotFound();
        Sanctum::actingAs($managerA);
        $this->putJson("/api/v1/institution/withdrawals/{$id}", ['status' => 'approved'])->assertOk();
        $this->assertEquals(7000, app(InstitutionLedger::class)->doctorBalanceMinor($source->id, $doctor->id));
    }

    public function test_independent_doctor_can_join_and_zero_percent_is_preserved(): void
    {
        [$doctor, , $target, , $manager] = $this->scenario();
        $doctor->doctorProfile->update(['medical_institution_id' => null, 'institution_share_percent' => null, 'institution_joined_at' => null]);
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/institution-transfers', ['institution_id' => $target->id])->assertCreated()->json('transfer.id');
        Sanctum::actingAs($manager);
        $this->postJson("/api/v1/institution/transfers/{$id}/decision", ['status' => 'approved', 'doctor_share_percent' => 0])->assertOk();
        $this->assertEquals(0, $doctor->doctorProfile->fresh()->effectiveInstitutionSharePercent());
    }

    public function test_institution_with_unsettled_booking_cannot_be_deleted(): void
    {
        [$doctor, $source] = $this->scenario();
        $this->booking($doctor, ['institution_id' => $source->id, 'doctor_share_percent' => 40]);
        Sanctum::actingAs($this->user('admin'));
        $this->deleteJson('/api/v1/admin/institutions/'.$source->id)->assertUnprocessable();
        $this->assertNotNull($source->fresh());
    }

    private function scenario(): array
    {
        $this->travelTo(now()->startOfSecond());
        $source = MedicalInstitution::create(['name' => 'Instituția A', 'status' => 'active', 'doctor_share_percent' => 40]);
        $target = MedicalInstitution::create(['name' => 'Instituția B', 'status' => 'active', 'doctor_share_percent' => 50]);
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'medical_institution_id' => $source->id, 'institution_share_percent' => 40, 'institution_joined_at' => now()->subDay()]);
        $managerA = $this->user('institution');
        $managerB = $this->user('institution');
        $source->managers()->attach($managerA);
        $target->managers()->attach($managerB);
        Notification::fake();
        Queue::fake();

        return [$doctor, $source, $target, $managerA, $managerB];
    }

    private function booking(User $doctor, array $snapshot): ConsultationRequest
    {
        return ConsultationRequest::create(['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => 'accepted', 'amount_minor' => 50000, 'provider_amount_minor' => 42500, 'pricing_snapshot' => $snapshot]);
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
