<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CreateAdminUserCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_grants_admin_access_to_an_existing_user_without_replacing_the_password(): void
    {
        $this->seed(RolesSeeder::class);
        $patientRole = Role::query()->where('name', 'patient')->firstOrFail();
        $user = User::factory()->create([
            'email' => 'owner@telemedconsult.md',
            'password' => 'ExistingPassword123!',
            'active_role_id' => $patientRole->id,
        ]);
        $user->roles()->attach($patientRole);

        $this->artisan('admin:create', ['email' => $user->email])
            ->expectsOutputToContain('are acum acces de administrator')
            ->assertSuccessful();

        $user->refresh();
        $this->assertSame('admin', $user->activeRole?->name);
        $this->assertSame('active', $user->status);
        $this->assertNotNull($user->email_verified_at);
        $this->assertTrue(Hash::check('ExistingPassword123!', $user->password));
        $this->assertEqualsCanonicalizing(['admin', 'patient'], $user->roles()->pluck('name')->all());
    }

    public function test_it_creates_a_new_admin_with_an_interactively_entered_password(): void
    {
        $this->seed(RolesSeeder::class);

        $this->artisan('admin:create', [
            'email' => 'admin@telemedconsult.md',
            '--name' => 'Administrator Principal',
        ])
            ->expectsQuestion('Parola nouă (minimum 12 caractere)', 'StrongAdminPassword123!')
            ->expectsQuestion('Confirmă parola', 'StrongAdminPassword123!')
            ->assertSuccessful();

        $admin = User::query()->where('email', 'admin@telemedconsult.md')->firstOrFail();
        $this->assertSame('Administrator Principal', $admin->name);
        $this->assertSame('admin', $admin->activeRole?->name);
        $this->assertTrue($admin->hasRole('admin'));
        $this->assertTrue(Hash::check('StrongAdminPassword123!', $admin->password));
    }
}
