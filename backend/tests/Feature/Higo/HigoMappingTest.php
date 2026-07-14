<?php

namespace Tests\Feature\Higo;

use App\Models\DoctorProfile;
use App\Models\HigoDevice;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\Specialty;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class HigoMappingTest extends TestCase
{
    use RefreshDatabase;

    public function test_higo_mapping_columns_exist_on_core_entities(): void
    {
        $this->assertTrue(Schema::hasColumn('users', 'higo_person_id'));
        $this->assertTrue(Schema::hasColumn('patient_profiles', 'higo_patient_id'));
        $this->assertTrue(Schema::hasColumn('operator_profiles', 'higo_operator_id'));
        $this->assertTrue(Schema::hasColumn('doctor_profiles', 'higo_doctor_id'));

        foreach ([
            'higo_device_id',
            'serial_number',
            'box_serial_number',
            'assigned_user_id',
            'assigned_higo_user_type',
            'status',
        ] as $column) {
            $this->assertTrue(Schema::hasColumn('higo_devices', $column));
        }
    }

    public function test_higo_ids_are_persisted_without_changing_existing_profiles(): void
    {
        $patientOwner = User::factory()->create(['higo_person_id' => 'person-100']);
        $patientProfile = PatientProfile::create([
            'user_id' => $patientOwner->id,
            'higo_patient_id' => 'patient-200',
            'first_name' => 'Ana',
            'last_name' => 'Popa',
            'identity_number' => '2000000000000',
            'birth_date' => '1990-01-01',
            'gender' => 'female',
            'status' => 'active',
        ]);

        $operatorUser = User::factory()->create();
        $operatorProfile = OperatorProfile::create([
            'user_id' => $operatorUser->id,
            'higo_operator_id' => 'operator-300',
            'region' => 'Chisinau',
            'equipment' => ['HIGO'],
            'is_available' => true,
            'is_approved' => true,
        ]);

        $doctorUser = User::factory()->create();
        $specialty = Specialty::create(['name' => 'Pediatrie', 'slug' => 'pediatrie']);
        $doctorProfile = DoctorProfile::create([
            'user_id' => $doctorUser->id,
            'higo_doctor_id' => 'doctor-400',
            'specialty_id' => $specialty->id,
            'license_number' => 'LIC-1',
            'experience_years' => 5,
            'consultation_price' => 400,
            'platforms' => ['Chat'],
            'is_available' => true,
            'is_approved' => true,
        ]);

        $this->assertSame('person-100', $patientOwner->refresh()->higo_person_id);
        $this->assertSame('patient-200', $patientProfile->refresh()->higo_patient_id);
        $this->assertSame('operator-300', $operatorProfile->refresh()->higo_operator_id);
        $this->assertSame('doctor-400', $doctorProfile->refresh()->higo_doctor_id);
    }

    public function test_higo_device_can_be_assigned_to_a_local_user(): void
    {
        $user = User::factory()->create(['higo_person_id' => 'person-100']);

        $device = HigoDevice::create([
            'higo_device_id' => 'device-500',
            'serial_number' => '00D21320015T',
            'box_serial_number' => 'BOX-123',
            'assigned_user_id' => $user->id,
            'assigned_higo_user_type' => 'person',
            'status' => 'active',
        ]);

        $this->assertTrue($device->assignedUser->is($user));
        $this->assertTrue($user->higoDevices->first()->is($device));
    }
}
