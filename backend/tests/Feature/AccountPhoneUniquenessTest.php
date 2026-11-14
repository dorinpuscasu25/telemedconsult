<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountPhoneUniquenessTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_requires_phone_and_rejects_equivalent_phone_or_email_independently(): void
    {
        Mail::fake();
        Role::create(['name' => 'patient', 'label' => 'Pacient']);
        $existing = User::factory()->create(['phone' => '069 123 456']);
        $payload = ['name' => 'Pacient', 'email' => 'new@example.test', 'password' => 'password123', 'password_confirmation' => 'password123', 'account_type' => 'patient'];
        $this->postJson('/api/v1/auth/register', $payload)->assertUnprocessable()->assertJsonValidationErrors('phone');
        foreach (['+37369123456', '00373 69123456', '069123456'] as $phone) {
            $this->postJson('/api/v1/auth/register', [...$payload, 'phone' => $phone])->assertUnprocessable()->assertJsonValidationErrors('phone');
        }
        $this->postJson('/api/v1/auth/register', [...$payload, 'email' => $existing->email, 'phone' => '069123457'])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/api/v1/auth/register', [...$payload, 'phone' => '069123457'])->assertCreated();
        $this->assertSame('+37369123457', User::where('email', $payload['email'])->firstOrFail()->normalized_phone);
    }

    public function test_own_phone_can_be_saved_but_another_accounts_phone_is_rejected(): void
    {
        $role = Role::create(['name' => 'patient', 'label' => 'Pacient']);
        $user = User::factory()->create(['phone' => '069123456', 'active_role_id' => $role->id]);
        $user->roles()->attach($role);
        User::factory()->create(['phone' => '069123457']);
        Sanctum::actingAs($user);
        $this->putJson('/api/v1/patient/profile', ['name' => $user->name, 'phone' => '+37369123456'])->assertOk();
        $this->putJson('/api/v1/patient/profile', ['name' => $user->name, 'phone' => '+37369123457'])->assertUnprocessable()->assertJsonValidationErrors('phone');
    }

    public function test_database_blocks_duplicate_normalized_phone(): void
    {
        User::factory()->create(['phone' => '069123456']);
        $this->expectException(UniqueConstraintViolationException::class);
        User::factory()->create(['phone' => '+373 69 123 456']);
    }
}
