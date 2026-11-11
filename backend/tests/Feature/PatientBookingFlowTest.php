<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorAvailability;
use App\Models\DoctorProfile;
use App\Models\DoctorVacation;
use App\Models\PatientProfile;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Services\MaibCheckout;
use App\Services\PaymentVerification;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Programarea rezolvă blocajele pe loc: ore libere după programul medicului,
 * diferența de sold calculată dinainte și întoarcerea la programare după plată.
 */
class PatientBookingFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_free_slots_follow_the_schedule_and_skip_booked_and_past_times(): void
    {
        // Luni, 9 noiembrie 2026, 08:00 la Chișinău.
        $this->travelTo(CarbonImmutable::parse('2026-11-09 08:00', 'Europe/Chisinau')->utc());
        $scenario = $this->scenario(balanceMinor: 0);
        $this->availability($scenario['doctor'], Carbon::MONDAY, '09:00', '11:00');
        $this->bookedAt($scenario, '2026-11-09 09:30');

        $response = $this->getJson('/api/v1/catalog/doctors/'.$scenario['doctor']->id.'/slots?days=8')
            ->assertOk()
            ->assertJsonPath('has_schedule', true)
            ->assertJsonPath('days.0.date', '2026-11-09');

        $this->assertSame(['09:00', '10:00', '10:30'], collect($response->json('days.0.slots'))->pluck('time')->all());
        $this->assertSame([], $response->json('days.1.slots'));
        $this->assertSame('2026-11-16', $response->json('days.7.date'));
        $this->assertCount(4, $response->json('days.7.slots'));
    }

    public function test_without_a_schedule_the_default_weekday_hours_are_offered_and_vacation_is_empty(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 08:00', 'Europe/Chisinau')->utc());
        $scenario = $this->scenario(balanceMinor: 0);

        // Fără program setat: luni–vineri 09:00–18:00, câte 30 de minute; weekendul gol.
        $default = $this->getJson('/api/v1/catalog/doctors/'.$scenario['doctor']->id.'/slots')
            ->assertOk()
            ->assertJsonPath('has_schedule', true)
            ->assertJsonPath('default_schedule', true);
        $this->assertSame('09:00', $default->json('days.0.slots.0.time'));
        $this->assertCount(18, $default->json('days.0.slots'));
        $this->assertSame([], $default->json('days.5.slots'));

        $this->availability($scenario['doctor'], Carbon::MONDAY, '09:00', '11:00');
        DoctorVacation::create(['doctor_id' => $scenario['doctor']->id, 'starts_on' => '2026-11-09', 'ends_on' => '2026-11-09']);

        $this->getJson('/api/v1/catalog/doctors/'.$scenario['doctor']->id.'/slots')
            ->assertOk()
            ->assertJsonPath('days.0.slots', []);
    }

    public function test_every_listed_slot_is_accepted_by_request_creation(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 08:00', 'Europe/Chisinau')->utc());
        $scenario = $this->scenario(balanceMinor: 500000);
        $this->availability($scenario['doctor'], Carbon::TUESDAY, '14:00', '15:00');

        $slot = $this->getJson('/api/v1/catalog/doctors/'.$scenario['doctor']->id.'/slots')->json('days.1.slots.0');
        $this->assertSame('14:00', $slot['time']);

        $this->postJson('/api/v1/requests', $this->videoRequest($scenario, $slot['starts_at']))->assertCreated();

        $times = collect($this->getJson('/api/v1/catalog/doctors/'.$scenario['doctor']->id.'/slots')->json('days.1.slots'))->pluck('time')->all();
        $this->assertSame(['14:30'], $times);
    }

    public function test_preview_reports_balances_and_shortfall(): void
    {
        $scenario = $this->scenario(balanceMinor: 10000);

        $this->postJson('/api/v1/requests/preview', [
            'consultation_kind' => 'video',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
        ])
            ->assertOk()
            ->assertJsonPath('cost.total', 300)
            ->assertJsonPath('wallet.balance', 100)
            ->assertJsonPath('wallet.shortfall', 200);
    }

    public function test_insufficient_balance_error_says_how_much_is_missing(): void
    {
        $scenario = $this->scenario(balanceMinor: 10000);

        $this->postJson('/api/v1/requests', $this->videoRequest($scenario))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_wallet_balance')
            ->assertJsonPath('missing_amount', 200)
            ->assertJsonPath('required_amount', 300);

        $this->assertSame(0, ConsultationRequest::count());
    }

    public function test_top_up_returns_to_the_requested_patient_page_after_payment(): void
    {
        $scenario = $this->scenario(balanceMinor: 0);
        $this->mock(MaibCheckout::class)->shouldReceive('start')->andReturnUsing(function (Payment $payment) {
            $payment->update(['provider_payment_id' => 'pay-'.$payment->id]);

            return (object) ['payId' => 'pay-'.$payment->id, 'payUrl' => 'https://maib.test/pay'];
        });
        $this->mock(PaymentVerification::class)->shouldReceive('settled')->andReturnTrue();

        $this->postJson('/api/v1/wallet/top-up', ['amount' => 200, 'return_to' => '/patient/doctors?resume=booking'])->assertOk();
        $payment = Payment::sole();
        $this->assertSame('/patient/doctors?resume=booking', $payment->metadata['return_to']);

        $this->get('/api/v1/payments/maib/ok?orderId='.$payment->id)
            ->assertRedirectContains('/patient/doctors?resume=booking&payment=ok');
        $this->assertSame(20000, Wallet::where('user_id', $scenario['patient']->user_id)->where('type', 'real')->value('balance_minor'));
    }

    public function test_top_up_rejects_external_return_paths(): void
    {
        $this->scenario(balanceMinor: 0);

        foreach (['https://evil.test/x', '//evil.test', '/admin/settings', '/patient/../admin'] as $returnTo) {
            $this->postJson('/api/v1/wallet/top-up', ['amount' => 200, 'return_to' => $returnTo])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('return_to');
        }
    }

    /**
     * @param  array{patient: PatientProfile, doctor: User}  $scenario
     */
    private function videoRequest(array $scenario, ?string $scheduledAt = null): array
    {
        return array_filter([
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id,
            'symptoms' => 'Tuse',
            'scheduled_at' => $scheduledAt,
        ]);
    }

    private function availability(User $doctor, int $weekday, string $from, string $to): void
    {
        DoctorAvailability::create(['doctor_id' => $doctor->id, 'weekday' => $weekday, 'starts_at' => $from.':00', 'ends_at' => $to.':00', 'is_active' => true]);
    }

    /**
     * @param  array{patient: PatientProfile, doctor: User}  $scenario
     */
    private function bookedAt(array $scenario, string $localTime): void
    {
        ConsultationRequest::create([
            'patient_id' => $scenario['patient']->user_id, 'patient_profile_id' => $scenario['patient']->id,
            'doctor_id' => $scenario['doctor']->id, 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted',
            'scheduled_at' => CarbonImmutable::parse($localTime, 'Europe/Chisinau')->setTimezone(config('app.timezone')), 'symptoms' => 'Tuse',
        ]);
    }

    /**
     * @return array{patient: PatientProfile, doctor: User}
     */
    private function scenario(int $balanceMinor): array
    {
        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true, 'is_available' => true, 'consultation_price' => 400, 'video_price' => 300]);

        $patientUser = $this->userWithRole('patient');
        Wallet::create(['user_id' => $patientUser->id, 'type' => 'real', 'balance_minor' => $balanceMinor, 'currency' => 'MDL']);
        $patient = PatientProfile::create(['user_id' => $patientUser->id, 'first_name' => 'Ana', 'last_name' => 'Pop', 'status' => 'active', 'active_until' => now()->addYear()]);
        Sanctum::actingAs($patientUser);

        return ['patient' => $patient, 'doctor' => $doctor];
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
