<?php

namespace Tests\Feature;

use App\Models\PatientCardPackage;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Services\FeatureFlags;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FeatureFlagsTest extends TestCase
{
    use RefreshDatabase;

    public function test_flags_default_to_enabled(): void
    {
        $flags = app(FeatureFlags::class);
        $this->assertTrue($flags->enabled('payments'));
        $this->assertTrue($flags->enabled('with_exam_consultations'));
    }

    public function test_admin_can_list_and_toggle_flags(): void
    {
        Sanctum::actingAs($this->admin());

        $this->getJson('/api/v1/admin/feature-flags')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'payments')
            ->assertJsonPath('data.0.enabled', true);

        $this->putJson('/api/v1/admin/feature-flags', [
            'flags' => [['key' => 'payments', 'enabled' => false]],
        ])->assertOk();

        $this->assertFalse(app(FeatureFlags::class)->enabled('payments'));
    }

    public function test_public_feature_map_reflects_toggles(): void
    {
        app(PlatformConfig::class)->upsert('feature.video_consultations', false, FeatureFlags::GROUP, 'boolean');

        $this->getJson('/api/v1/catalog/features')
            ->assertOk()
            ->assertJsonPath('data.video_consultations', false)
            ->assertJsonPath('data.payments', true);
    }

    public function test_disabling_payments_blocks_wallet_topup(): void
    {
        app(PlatformConfig::class)->upsert('feature.payments', false, FeatureFlags::GROUP, 'boolean');
        $patient = $this->userWithRole('patient');
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 0, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/wallet/top-up', ['amount' => 100])
            ->assertForbidden()
            ->assertJsonPath('message', 'Plățile sunt momentan dezactivate.');
    }

    public function test_disabling_module_blocks_card_purchase(): void
    {
        app(PlatformConfig::class)->upsert('feature.patient_cards', false, FeatureFlags::GROUP, 'boolean');
        $patient = $this->userWithRole('patient');
        $package = PatientCardPackage::create(['name' => 'X', 'profile_slots' => 1, 'price_minor' => 10000, 'validity_days' => 365, 'is_active' => true]);
        Wallet::create(['user_id' => $patient->id, 'balance_minor' => 50000, 'currency' => 'MDL']);
        Sanctum::actingAs($patient);

        $this->postJson('/api/v1/patient/card-purchases', ['package_id' => $package->id])
            ->assertForbidden()
            ->assertJsonPath('message', 'Modulul de cartele este momentan dezactivat.');
    }

    public function test_feature_management_requires_admin(): void
    {
        Sanctum::actingAs($this->userWithRole('patient'));
        $this->getJson('/api/v1/admin/feature-flags')->assertForbidden();
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
