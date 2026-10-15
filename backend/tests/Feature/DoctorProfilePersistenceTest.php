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

    public function test_description_services_clinic_and_bonus_eligibility_persist(): void
    {
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::create(['name' => 'doctor', 'label' => 'Medic']));
        Sanctum::actingAs($doctor);
        $this->putJson('/api/v1/doctor/profile', ['name' => 'Medic de test', 'bio' => 'Descrierea problemelor tratate', 'service_catalog' => [['name' => 'Consultație pediatrică']], 'clinic_name' => 'Clinica de test', 'clinic_details' => 'Chișinău', 'accepts_points' => true, 'experience_years' => 5, 'video_duration_minutes' => 15])->assertOk();
        $this->getJson('/api/v1/doctor/profile')->assertOk()->assertJsonPath('profile.bio', 'Descrierea problemelor tratate')->assertJsonPath('profile.service_catalog.0.name', 'Consultație pediatrică')->assertJsonPath('profile.clinic_name', 'Clinica de test')->assertJsonPath('profile.accepts_points', true);
    }
}
