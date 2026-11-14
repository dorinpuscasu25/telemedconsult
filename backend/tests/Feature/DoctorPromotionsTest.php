<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\DoctorPromotion;
use App\Models\DoctorPromotionImpression;
use App\Models\Role;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorPromotionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_budget_is_reserved_and_only_visible_impressions_spend_it_once_per_patient_per_thirty_minutes(): void
    {
        $this->freezeTime();
        [$doctor,$patient] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/promotions', ['points' => 3, 'days' => 30])->assertCreated()->json('data.id');
        $this->assertSame(700, $this->balance($doctor));
        Sanctum::actingAs($patient);
        $row = $this->getJson('/api/v1/patient/doctor-catalog')->assertOk()->json('data.0');
        $this->assertTrue($row['promoted']);
        $this->assertSame(0, DoctorPromotionImpression::count());
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $row['promotion_token']])->assertOk()->assertJsonPath('counted', true);
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $row['promotion_token']])->assertOk()->assertJsonPath('counted', false);
        $row = $this->getJson('/api/v1/patient/doctor-catalog')->json('data.0');
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $row['promotion_token']])->assertOk()->assertJsonPath('counted', false);
        $this->assertSame(200, DoctorPromotion::find($id)->remaining_minor);
        $this->travel(30)->minutes();
        $row = $this->getJson('/api/v1/patient/doctor-catalog')->json('data.0');
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $row['promotion_token']])->assertOk()->assertJsonPath('counted', true);
        $this->assertSame(100, DoctorPromotion::find($id)->remaining_minor);
        Sanctum::actingAs($doctor);
        $this->deleteJson('/api/v1/doctor/promotions/'.$id)->assertOk();
        $this->deleteJson('/api/v1/doctor/promotions/'.$id)->assertOk();
        $this->assertSame(800, $this->balance($doctor));
        $this->assertSame(1, WalletTransaction::where('type', 'promotion_budget_refund')->count());
    }

    public function test_delivery_tokens_are_bound_to_viewer_and_expiry_and_public_catalog_is_not_charged(): void
    {
        [$doctor,$patient] = $this->scenario();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/doctor/promotions', ['points' => 2, 'days' => 1])->assertCreated();
        Sanctum::actingAs($patient);
        $token = $this->getJson('/api/v1/patient/doctor-catalog')->json('data.0.promotion_token');
        Sanctum::actingAs($this->user('patient'));
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $token])->assertUnprocessable();
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => 'invalid'])->assertUnprocessable();
        Sanctum::actingAs($patient);
        $this->travel(31)->minutes();
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $token])->assertUnprocessable();
        $this->assertSame(0, DoctorPromotionImpression::count());
    }

    public function test_exhaustion_and_expiry_stop_promotion_and_unused_budget_is_refunded(): void
    {
        [$doctor,$patient] = $this->scenario();
        Sanctum::actingAs($doctor);
        $id = $this->postJson('/api/v1/doctor/promotions', ['points' => 1, 'days' => 1])->assertCreated()->json('data.id');
        Sanctum::actingAs($patient);
        $token = $this->getJson('/api/v1/patient/doctor-catalog')->json('data.0.promotion_token');
        $this->postJson('/api/v1/patient/promotion-impression', ['token' => $token])->assertOk();
        $this->assertSame('completed', DoctorPromotion::find($id)->status);
        $this->getJson('/api/v1/patient/doctor-catalog')->assertJsonMissingPath('data.0.promotion_token');
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/doctor/promotions', ['points' => 2, 'days' => 1])->assertCreated();
        $this->travel(2)->days();
        $this->artisan('doctors:expire-promotions')->assertSuccessful();
        $this->getJson('/api/v1/doctor/promotions')->assertOk()->assertJsonPath('balance', 9);
        $this->assertSame(900, $this->balance($doctor));
    }

    public function test_roles_ownership_budget_and_active_campaign_are_enforced(): void
    {
        [$doctor,$patient] = $this->scenario();
        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/doctor/promotions', ['points' => 1, 'days' => 1])->assertForbidden();
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/doctor/promotions', ['points' => 11, 'days' => 1])->assertUnprocessable();
        $id = $this->postJson('/api/v1/doctor/promotions', ['points' => 1, 'days' => 1])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/doctor/promotions', ['points' => 1, 'days' => 1])->assertUnprocessable();
        Sanctum::actingAs($this->user('doctor'));
        $this->deleteJson('/api/v1/doctor/promotions/'.$id)->assertNotFound();
        $this->getJson('/api/v1/admin/doctor-promotions')->assertForbidden();
        Sanctum::actingAs($this->user('admin'));
        $this->getJson('/api/v1/admin/doctor-promotions')->assertOk()->assertJsonPath('data.0.budget', 1);
    }

    public function test_distribution_uses_all_three_groups_without_duplicating_a_doctor(): void
    {
        [$doctor,$patient] = $this->scenario();
        for ($i = 0; $i < 17; $i++) {
            $user = $this->user('doctor');
            DoctorProfile::create(['user_id' => $user->id, 'is_approved' => true]);
        }
        Sanctum::actingAs($doctor);
        $this->postJson('/api/v1/doctor/promotions', ['points' => 5, 'days' => 1])->assertCreated();
        $groups = [];
        for ($i = 0; $i < 15; $i++) {
            Sanctum::actingAs($this->user('patient'));
            $rows = $this->getJson('/api/v1/patient/doctor-catalog')->assertOk()->json('data');
            $this->assertCount(18, array_unique(array_column($rows, 'id')));
            foreach ($rows as $index => $row) {
                if ($row['promoted'] ?? false) {
                    $groups[] = intdiv($index, 6);
                }
            }
        }
        sort($groups);
        $this->assertSame([0, 1, 2], array_values(array_unique($groups)));
    }

    private function scenario(): array
    {
        $doctor = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'is_approved' => true]);
        Wallet::create(['user_id' => $doctor->id, 'type' => 'points', 'balance_minor' => 1000, 'currency' => 'MDL']);

        return [$doctor, $this->user('patient')];
    }

    private function balance(User $user): int
    {
        return (int) Wallet::where('user_id', $user->id)->where('type', 'points')->value('balance_minor');
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
