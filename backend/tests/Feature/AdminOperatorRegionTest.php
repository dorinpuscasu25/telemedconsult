<?php

namespace Tests\Feature;

use App\Models\OperatorProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminOperatorRegionTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_creating_an_operator_persists_the_selected_region(): void
    {
        foreach (['admin', 'operator'] as $name) {
            Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        }
        Region::create(['name' => 'Strășeni', 'type' => 'raion', 'is_active' => true]);

        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/v1/admin/users', [
            'name' => 'Operator Test',
            'email' => 'operator.test@doctor.md',
            'password' => 'password123',
            'roles' => ['operator'],
            'region' => 'Strășeni',
        ])->assertCreated();

        $operatorId = $response->json('user.id');

        $this->assertDatabaseHas('operator_profiles', [
            'user_id' => $operatorId,
            'region' => 'Strășeni',
        ]);
    }

    public function test_operator_creation_requires_a_region(): void
    {
        foreach (['admin', 'operator'] as $name) {
            Role::firstOrCreate(['name' => $name], ['label' => ucfirst($name)]);
        }

        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Operator Fără Regiune',
            'email' => 'operator.noregion@doctor.md',
            'password' => 'password123',
            'roles' => ['operator'],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('region');

        $this->assertSame(0, OperatorProfile::count());
    }
}
