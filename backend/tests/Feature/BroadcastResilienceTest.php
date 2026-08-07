<?php

namespace Tests\Feature;

use App\Broadcasting\ResilientBroadcaster;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\PatientProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Contracts\Broadcasting\Broadcaster;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * Notificările în timp real sunt un strat de prezentare. Un server de
 * broadcasting picat nu are voie să anuleze operațiunea care l-a declanșat —
 * exact ce se întâmpla înainte: consultația se crea într-o tranzacție, iar
 * eroarea de livrare o ștergea complet.
 */
class BroadcastResilienceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_broadcast_failure_does_not_roll_back_the_consultation(): void
    {
        $this->pretendBroadcastingIsDown();

        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'is_approved' => true,
            'is_available' => true,
            'consultation_price' => 400,
            'video_price' => 300,
        ]);

        $patientUser = $this->userWithRole('patient');
        Wallet::create(['user_id' => $patientUser->id, 'balance_minor' => 500000, 'currency' => 'MDL']);
        $patient = PatientProfile::create([
            'user_id' => $patientUser->id,
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'status' => 'active',
            'active_until' => now()->addYear(),
        ]);

        Sanctum::actingAs($patientUser);

        $this->postJson('/api/v1/requests', [
            'type' => 'video',
            'consultation_kind' => 'video',
            'patient_profile_id' => $patient->id,
            'doctor_id' => $doctor->id,
            'symptoms' => 'Tuse',
        ])->assertCreated();

        $this->assertSame(1, ConsultationRequest::count());
    }

    /**
     * Broadcaster-ul real aruncă, ca atunci când serverul Reverb e oprit.
     */
    private function pretendBroadcastingIsDown(): void
    {
        Broadcast::extend('exploding', fn () => new class implements Broadcaster
        {
            public function auth($request) {}

            public function validAuthenticationResponse($request, $result) {}

            public function broadcast(array $channels, $event, array $payload = [])
            {
                throw new RuntimeException('cURL error 7: Failed to connect to 127.0.0.1:8090');
            }
        });

        config([
            'broadcasting.connections.exploding' => ['driver' => 'exploding'],
            'broadcasting.connections.guarded' => ['driver' => 'resilient', 'inner' => 'exploding'],
            'broadcasting.default' => 'guarded',
        ]);

        $this->assertInstanceOf(ResilientBroadcaster::class, Broadcast::connection());
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
