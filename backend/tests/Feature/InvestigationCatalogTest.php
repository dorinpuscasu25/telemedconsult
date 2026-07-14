<?php

namespace Tests\Feature;

use App\Models\InvestigationType;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InvestigationCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_catalog_returns_only_active_investigations(): void
    {
        InvestigationType::create(['code' => 'throat_exam', 'name' => 'Examinare gât', 'requires_device' => true, 'higo_exam_type' => 'THROAT_EXAM', 'is_active' => true]);
        InvestigationType::create(['code' => 'retired', 'name' => 'Investigație retrasă', 'is_active' => false]);

        $response = $this->getJson('/api/v1/catalog/investigations')->assertOk();

        $codes = collect($response->json('data'))->pluck('code');
        $this->assertTrue($codes->contains('throat_exam'));
        $this->assertFalse($codes->contains('retired'));
    }

    public function test_admin_can_create_investigation_with_higo_mapping(): void
    {
        Sanctum::actingAs($this->admin());

        $created = $this->postJson('/api/v1/admin/investigation-types', [
            'name' => 'Auscultație plămâni',
            'default_price' => 60,
            'requires_device' => true,
            'higo_exam_type' => 'LUNGS_AUSCULTATION_EXAM',
        ])
            ->assertCreated()
            ->assertJsonPath('investigation_type.code', 'auscultatie_plamani')
            ->assertJsonPath('investigation_type.higo_exam_type', 'LUNGS_AUSCULTATION_EXAM')
            ->assertJsonPath('investigation_type.default_price', 60)
            ->json('investigation_type');

        $this->putJson('/api/v1/admin/investigation-types/'.$created['id'], [
            'name' => 'Auscultație plămâni',
            'default_price' => 80,
            'requires_device' => true,
        ])
            ->assertOk()
            ->assertJsonPath('investigation_type.default_price', 80);

        $this->deleteJson('/api/v1/admin/investigation-types/'.$created['id'])
            ->assertOk()
            ->assertJsonPath('investigation_type.is_active', false);
    }

    public function test_invalid_higo_exam_type_is_rejected(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/v1/admin/investigation-types', [
            'name' => 'Test',
            'higo_exam_type' => 'NOT_A_REAL_TYPE',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('higo_exam_type');
    }

    public function test_investigation_catalog_management_requires_admin(): void
    {
        $patient = $this->userWithRole('patient');
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/admin/investigation-types', ['name' => 'Hack'])
            ->assertForbidden();
    }

    private function admin(): User
    {
        return $this->userWithRole('admin');
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->sync([$role->id]);

        return $user;
    }
}
