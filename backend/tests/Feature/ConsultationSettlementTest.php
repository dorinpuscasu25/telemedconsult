<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Models\Wallet;
use App\Services\ConsultationSettlement;
use App\Services\PlatformConfig;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Banii consultației rămân rezervați până la închidere: recenzia pacientului
 * (sau termenul automat) plătește medicul; consultația care nu are loc își
 * returnează banii.
 */
class ConsultationSettlementTest extends TestCase
{
    use RefreshDatabase;

    private Specialty $specialty;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->specialty = Specialty::create(['name' => 'Medicină de familie', 'slug' => 'medicina-de-familie']);
    }

    public function test_conclusion_keeps_money_held_and_patient_review_pays_the_doctor(): void
    {
        [$patient, $doctor, $request] = $this->acceptedConsultation();

        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Rinofaringită'])->assertOk();

        $request->refresh();
        $this->assertSame('completed', $request->status);
        $this->assertSame('held', $request->payment_status);
        $this->assertNull($request->closed_at);
        $this->assertSame(0, $this->balance($doctor));
        $this->assertEquals(0, $this->getJson('/api/v1/doctor/stats')->assertOk()->json('summary.available_balance'), 'Banii rezervați nu se pot retrage.');

        Sanctum::actingAs($patient);
        $listed = collect($this->getJson('/api/v1/requests')->assertOk()->json('data'))->firstWhere('id', (string) $request->id);
        $this->assertNotNull($listed['auto_close_at']);
        $this->postJson('/api/v1/requests/'.$request->id.'/review', ['rating' => 5, 'comment' => 'Foarte bine'])->assertCreated();

        $request->refresh();
        $this->assertSame('captured', $request->payment_status);
        $this->assertNotNull($request->closed_at);
        $this->assertSame((int) $request->provider_amount_minor, $this->balance($doctor));

        $this->assertStringContainsString('234,50 MDL au intrat în balanța ta', $doctor->notifications()->latest()->first()->data['body']);

        // Soldul de retras al medicului: doar partea lui, abia după închidere.
        Sanctum::actingAs($doctor);
        $this->assertEquals($request->provider_amount_minor / 100, $this->getJson('/api/v1/doctor/stats')->assertOk()->json('summary.available_balance'));
        Sanctum::actingAs($patient);

        // Recenzia salvată a doua oară nu mai plătește încă o dată.
        $this->postJson('/api/v1/requests/'.$request->id.'/review', ['rating' => 4, 'comment' => 'Corectez'])->assertCreated();
        $this->assertSame((int) $request->provider_amount_minor, $this->balance($doctor));
    }

    public function test_completed_consultation_without_review_closes_and_pays_after_the_admin_window(): void
    {
        app(PlatformConfig::class)->upsert(ConsultationSettlement::AUTO_CLOSE_DAYS, 2);
        [, $doctor, $request] = $this->acceptedConsultation();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/requests/'.$request->id.'/complete', ['diagnosis' => 'Test'])->assertOk();

        $this->travel(47)->hours();
        $this->artisan('consultations:settle')->assertSuccessful();
        $this->assertSame('held', $request->fresh()->payment_status);

        $this->travel(2)->hours();
        $this->artisan('consultations:settle')->assertSuccessful();
        $request->refresh();
        $this->assertSame('captured', $request->payment_status);
        $this->assertNotNull($request->closed_at);
        $this->assertSame((int) $request->provider_amount_minor, $this->balance($doctor));
    }

    public function test_consultation_that_did_not_take_place_refunds_the_patient_after_the_admin_window(): void
    {
        app(PlatformConfig::class)->upsert(ConsultationSettlement::NO_SHOW_REFUND_HOURS, 6);
        [$patient, $doctor, $request] = $this->acceptedConsultation(scheduledAt: now()->addHour());
        $before = $this->balance($patient);

        $this->travel(6)->hours();
        $this->artisan('consultations:settle')->assertSuccessful();
        $this->assertSame('held', $request->fresh()->payment_status, 'Nu se returnează înainte de termen.');

        $this->travel(2)->hours();
        $this->artisan('consultations:settle')->assertSuccessful();
        $request->refresh();
        $this->assertSame('refunded', $request->payment_status);
        $this->assertSame('expired', $request->status);
        $this->assertSame($before + (int) $request->amount_minor, $this->balance($patient));
        $this->assertSame(0, $this->balance($doctor));
    }

    public function test_started_consultation_without_conclusion_is_refunded_too(): void
    {
        [$patient, , $request] = $this->acceptedConsultation(scheduledAt: now()->subHours(30));
        $request->forceFill(['doctor_started_at' => now()->subHours(25)])->save();

        $this->artisan('consultations:settle')->assertSuccessful();

        $this->assertSame('refunded', $request->fresh()->payment_status);
        $this->assertSame((int) $request->amount_minor, $this->balance($patient));
    }

    public function test_home_exam_already_done_is_left_for_the_admin(): void
    {
        [, , $request] = $this->acceptedConsultation(scheduledAt: now()->subDays(3));
        $request->forceFill(['objective_data_completed_at' => now()->subDays(3)])->save();

        $this->artisan('consultations:settle')->assertSuccessful();

        $this->assertSame('held', $request->fresh()->payment_status);
        $this->assertSame('accepted', $request->fresh()->status);
    }

    public function test_new_doctor_has_no_rating_until_a_real_review(): void
    {
        $doctor = $this->userWithRole('doctor');
        $profile = DoctorProfile::create(['user_id' => $doctor->id, 'specialty_id' => $this->specialty->id, 'is_approved' => true])->refresh();

        $this->assertEquals(0, $profile->rating);
        $this->assertSame(0, (int) $profile->reviews_count);
    }

    /**
     * @return array{0: User, 1: User, 2: ConsultationRequest}
     */
    private function acceptedConsultation(?\DateTimeInterface $scheduledAt = null): array
    {
        $patient = $this->userWithRole('patient');
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'specialty_id' => $this->specialty->id, 'is_approved' => true]);
        $profile = PatientProfile::create(['user_id' => $patient->id, 'first_name' => 'Elena', 'last_name' => 'Rusu', 'birth_date' => '1986-01-01']);
        Wallet::create(['user_id' => $patient->id, 'type' => 'real', 'balance_minor' => 0, 'currency' => 'MDL']);

        $scheduledAt ??= now()->addHour();
        $request = ConsultationRequest::create([
            'patient_id' => $patient->id,
            'patient_profile_id' => $profile->id,
            'doctor_id' => $doctor->id,
            'type' => 'video',
            'consultation_kind' => 'video',
            'status' => 'accepted',
            'accepted_at' => min(now(), Carbon::instance($scheduledAt)->subHour()),
            'scheduled_at' => $scheduledAt,
            'payment_status' => 'held',
            'symptoms' => 'Tuse',
            'amount_minor' => 35000,
            'real_amount_minor' => 35000,
            'platform_fee_minor' => 11550,
            'provider_amount_minor' => 23450,
        ]);

        return [$patient, $doctor, $request];
    }

    private function balance(User $user): int
    {
        return (int) Wallet::where('user_id', $user->id)->where('type', 'real')->value('balance_minor');
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
