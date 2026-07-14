<?php

namespace Tests\Feature;

use App\Models\Role;
use Database\Seeders\RolesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RolesSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_all_required_roles_idempotently(): void
    {
        $this->seed(RolesSeeder::class);
        $this->seed(RolesSeeder::class);

        $this->assertSame(count(RolesSeeder::ROLES), Role::query()->count());

        foreach (RolesSeeder::ROLES as $role) {
            $this->assertDatabaseHas('roles', $role);
        }
    }
}
