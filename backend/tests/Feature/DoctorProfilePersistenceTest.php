<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorProfilePersistenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_and_mixed_platforms_do_not_block_description_and_services(): void
    {
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::create(['name' => 'doctor', 'label' => 'Medic']));
        Sanctum::actingAs($doctor);
        foreach ([['Video', 'Chat'], [['name' => 'Telegram', 'value' => '@test']], ['Video', 'Chat', ['name' => 'Telegram', 'value' => '@test']]] as $platforms) {
            $this->putJson('/api/v1/doctor/profile', [
                'name' => 'Medic de test', 'bio' => 'Probleme pediatrice', 'service_catalog' => [['name' => 'Consultație pediatrică'], ['name' => 'Monitorizare']], 'platforms' => $platforms,
            ])->assertOk();
            $this->getJson('/api/v1/doctor/profile')->assertOk()
                ->assertJsonPath('profile.bio', 'Probleme pediatrice')
                ->assertJsonPath('profile.service_catalog.1.name', 'Monitorizare')
                ->assertJsonPath('profile.platforms', $platforms);
        }
        $this->getJson('/api/v1/catalog/doctors')->assertOk()->assertJsonPath('data.0.platforms', ['Video', 'Chat', 'Telegram']);
    }

    public function test_incomplete_or_invalid_platform_contacts_are_rejected_without_changing_profile(): void
    {
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::create(['name' => 'doctor', 'label' => 'Medic']));
        Sanctum::actingAs($doctor);
        $this->putJson('/api/v1/doctor/profile', ['name' => 'Medic', 'bio' => 'Descriere salvată', 'platforms' => ['Video', 'Chat']])->assertOk();
        foreach ([[['name' => 'Telegram']], [123], [['name' => 'Telegram', 'value' => '@test', 'unexpected' => true]]] as $platforms) {
            $this->putJson('/api/v1/doctor/profile', ['name' => 'Medic', 'bio' => 'Nu se salvează', 'platforms' => $platforms])->assertUnprocessable()->assertJsonValidationErrors('platforms.0');
        }
        $this->getJson('/api/v1/doctor/profile')->assertOk()->assertJsonPath('profile.bio', 'Descriere salvată');
    }

    public function test_description_services_clinic_and_bonus_eligibility_persist(): void
    {
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::create(['name' => 'doctor', 'label' => 'Medic']));
        Sanctum::actingAs($doctor);
        $this->putJson('/api/v1/doctor/profile', ['name' => 'Medic de test', 'bio' => 'Descrierea problemelor tratate', 'service_catalog' => [['name' => 'Consultație pediatrică']], 'clinic_name' => 'Clinica de test', 'clinic_details' => 'Chișinău', 'accepts_points' => true, 'experience_years' => 5, 'video_duration_minutes' => 15])->assertOk();
        $this->getJson('/api/v1/doctor/profile')->assertOk()->assertJsonPath('profile.bio', 'Descrierea problemelor tratate')->assertJsonPath('profile.service_catalog.0.name', 'Consultație pediatrică')->assertJsonPath('profile.clinic_name', 'Clinica de test')->assertJsonPath('profile.accepts_points', true);
    }
}
