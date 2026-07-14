<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\InvestigationType;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoctorInvestigationRequirementsTest extends TestCase
{
    use RefreshDatabase;

    public function test_doctor_sets_required_and_optional_investigations_from_catalog(): void
    {
        [$doctor, $saturation, $throat, $skin] = $this->doctorAndCatalog();
        Sanctum::actingAs($doctor);

        $response = $this->putJson('/api/v1/doctor/profile', [
            'name' => 'Dr. Test',
            'consultation_price' => 500,
            'video_price' => 300,
            'required_investigation_ids' => [$saturation->id, $throat->id],
            'optional_investigation_ids' => [$skin->id],
        ])->assertOk();

        $this->assertEqualsCanonicalizing([$saturation->id, $throat->id], $response->json('profile.required_investigation_ids'));
        $this->assertSame([$skin->id], $response->json('profile.optional_investigation_ids'));

        $this->assertDatabaseHas('doctor_investigation_requirements', ['doctor_id' => $doctor->id, 'investigation_type_id' => $saturation->id, 'requirement' => 'required']);
        $this->assertDatabaseHas('doctor_investigation_requirements', ['doctor_id' => $doctor->id, 'investigation_type_id' => $skin->id, 'requirement' => 'optional']);

        // Denormalized JSON stays in sync (names) for existing displays.
        $names = collect(DoctorProfile::where('user_id', $doctor->id)->value('required_investigations'))->pluck('name');
        $this->assertTrue($names->contains($saturation->name));
        $this->assertTrue($names->contains($throat->name));
        $this->assertFalse($names->contains($skin->name));
    }

    public function test_catalog_exposes_structured_requirements_with_prices(): void
    {
        [$doctor, $saturation, $throat, $skin] = $this->doctorAndCatalog();
        Sanctum::actingAs($doctor);

        $this->putJson('/api/v1/doctor/profile', [
            'name' => 'Dr. Test',
            'required_investigation_ids' => [$saturation->id],
            'optional_investigation_ids' => [$skin->id],
        ])->assertOk();

        $response = $this->getJson('/api/v1/catalog/doctors')->assertOk();
        $entry = collect($response->json('data'))->firstWhere('id', (string) $doctor->id);

        $this->assertSame($saturation->id, $entry['investigation_requirements']['required'][0]['id']);
        $this->assertSame($saturation->default_price, $entry['investigation_requirements']['required'][0]['default_price']);
        $this->assertSame($skin->id, $entry['investigation_requirements']['optional'][0]['id']);
    }

    public function test_same_investigation_in_both_lists_is_required(): void
    {
        [$doctor, $saturation] = $this->doctorAndCatalog();
        Sanctum::actingAs($doctor);

        $this->putJson('/api/v1/doctor/profile', [
            'name' => 'Dr. Test',
            'required_investigation_ids' => [$saturation->id],
            'optional_investigation_ids' => [$saturation->id],
        ])->assertOk();

        $this->assertDatabaseHas('doctor_investigation_requirements', ['doctor_id' => $doctor->id, 'investigation_type_id' => $saturation->id, 'requirement' => 'required']);
        $this->assertSame(1, \App\Models\DoctorInvestigationRequirement::where('doctor_id', $doctor->id)->count());
    }

    public function test_invalid_investigation_id_is_rejected(): void
    {
        [$doctor] = $this->doctorAndCatalog();
        Sanctum::actingAs($doctor);

        $this->putJson('/api/v1/doctor/profile', [
            'name' => 'Dr. Test',
            'required_investigation_ids' => [99999],
        ])->assertUnprocessable()->assertJsonValidationErrors('required_investigation_ids.0');
    }

    /**
     * @return array{0: User, 1: InvestigationType, 2: InvestigationType, 3: InvestigationType}
     */
    private function doctorAndCatalog(): array
    {
        $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
        $doctor = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $doctor->roles()->sync([$role->id]);

        $specialty = Specialty::firstOrCreate(['slug' => 'pediatrie'], ['name' => 'Pediatrie']);
        DoctorProfile::create(['user_id' => $doctor->id, 'specialty_id' => $specialty->id, 'is_approved' => true, 'consultation_price' => 400]);

        $saturation = InvestigationType::create(['code' => 'oxygen_saturation', 'name' => 'Saturație O₂', 'default_price' => 40, 'requires_device' => true, 'higo_exam_type' => 'OXYGEN_SATURATION_EXAM']);
        $throat = InvestigationType::create(['code' => 'throat_exam', 'name' => 'Examinare gât', 'default_price' => 60, 'requires_device' => true, 'higo_exam_type' => 'THROAT_EXAM']);
        $skin = InvestigationType::create(['code' => 'skin_exam', 'name' => 'Examinare piele', 'default_price' => 80, 'requires_device' => true, 'higo_exam_type' => 'SKIN_EXAM']);

        return [$doctor, $saturation, $throat, $skin];
    }
}
