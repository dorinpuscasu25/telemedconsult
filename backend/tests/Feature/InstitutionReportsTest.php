<?php

namespace Tests\Feature;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InstitutionReportsTest extends TestCase
{
    use RefreshDatabase;

    public function test_reports_scope_rows_totals_and_former_doctors_to_own_institution(): void
    {
        [$institution, $doctor, $former, $foreign, $manager] = $this->scenario();
        Sanctum::actingAs($manager);
        $response = $this->getJson('/api/v1/institution/reports?from=2026-11-01&to=2026-11-30')->assertOk()
            ->assertJsonPath('summary.appointments', 3)->assertJsonPath('summary.settled_consultations', 2)
            ->assertJsonPath('summary.doctor_total', 297.5)->assertJsonPath('summary.institution_total', 382.5)
            ->assertJsonPath('rows.total', 3)->assertJsonMissingPath('rows.data.0.symptoms')->assertJsonMissingPath('rows.data.0.patient_id');
        $this->assertFalse(collect($response->json('doctors'))->firstWhere('id', $former->id)['is_current']);
        $this->assertTrue(collect($response->json('doctors'))->firstWhere('id', $doctor->id)['is_current']);
        $this->assertNotContains($foreign->id, collect($response->json('doctors'))->pluck('id')->all());
        $this->getJson('/api/v1/institution/reports?doctor_id='.$foreign->id)->assertNotFound();
        $this->getJson('/api/v1/institution/reports?doctor_id='.$former->id.'&mode=earnings')->assertOk()->assertJsonPath('rows.total', 1)->assertJsonPath('summary.doctor_total', 127.5);
    }

    public function test_filters_apply_to_list_summary_and_per_doctor_counts_before_pagination(): void
    {
        [, $doctor, , , $manager] = $this->scenario();
        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/reports?from=2026-11-01&to=2026-11-30&doctor_id='.$doctor->id.'&status=completed&per_page=1')->assertOk()
            ->assertJsonPath('summary.appointments', 1)->assertJsonPath('summary.settled_consultations', 1)->assertJsonPath('summary.doctor_total', 170)->assertJsonPath('rows.total', 1)->assertJsonPath('rows.data.0.status', 'completed');
        $this->getJson('/api/v1/institution/reports?from=2026-11-01&to=2026-11-30&per_page=1')->assertOk()->assertJsonCount(1, 'rows.data')->assertJsonPath('rows.total', 3)->assertJsonPath('summary.appointments', 3);
        $this->getJson('/api/v1/institution/reports?from=2026-11-01&to=2026-11-30&status=cancelled')->assertOk()->assertJsonPath('summary.appointments', 1)->assertJsonPath('summary.settled_consultations', 0)->assertJsonPath('summary.doctor_total', 0);
        $this->getJson('/api/v1/institution/reports?to=2026-11-30')->assertOk();
    }

    public function test_invalid_filters_and_non_manager_are_rejected(): void
    {
        [, , , , $manager] = $this->scenario();
        Sanctum::actingAs($manager);
        foreach (['from=invalid', 'from=2026-11-20&to=2026-11-01', 'status=unknown', 'page=0', 'per_page=101'] as $query) {
            $this->getJson('/api/v1/institution/reports?'.$query)->assertUnprocessable();
        }
        Sanctum::actingAs($this->user('patient'));
        $this->getJson('/api/v1/institution/reports')->assertForbidden();
        Sanctum::actingAs($this->user('institution'));
        $this->getJson('/api/v1/institution/reports')->assertForbidden();
    }

    public function test_independent_snapshot_is_not_assigned_to_current_institution_by_legacy_fallback(): void
    {
        [$institution, $doctor, , , $manager] = $this->scenario();
        $this->booking($institution, $doctor, 'accepted', '2026-11-14')->update(['pricing_snapshot' => ['institution_id' => null]]);
        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/reports?from=2026-11-01&to=2026-11-30')->assertOk()->assertJsonPath('summary.appointments', 3);
    }

    public function test_period_uses_moldovan_calendar_dates_even_when_database_uses_utc(): void
    {
        [$institution, $doctor, , , $manager] = $this->scenario();
        $inside = $this->booking($institution, $doctor, 'new', '2026-11-14');
        $inside->update(['scheduled_at' => Carbon::parse('2026-11-13T22:15:00Z')]);
        $outside = $this->booking($institution, $doctor, 'new', '2026-11-14');
        $outside->update(['scheduled_at' => Carbon::parse('2026-11-14T22:15:00Z')]);
        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/institution/reports?from=2026-11-14&to=2026-11-14')->assertOk()
            ->assertJsonPath('timezone', 'Europe/Chisinau')->assertJsonPath('summary.appointments', 1)->assertJsonPath('rows.data.0.id', $inside->id);
    }

    private function scenario(): array
    {
        $this->travelTo(Carbon::create(2026, 11, 14, 12));
        $institution = MedicalInstitution::create(['name' => 'Clinica A', 'status' => 'active']);
        $other = MedicalInstitution::create(['name' => 'Clinica B', 'status' => 'active']);
        $doctor = $this->user('doctor');
        $former = $this->user('doctor');
        $foreign = $this->user('doctor');
        DoctorProfile::create(['user_id' => $doctor->id, 'medical_institution_id' => $institution->id, 'is_approved' => true]);
        DoctorProfile::create(['user_id' => $former->id, 'medical_institution_id' => $other->id, 'is_approved' => true]);
        DoctorProfile::create(['user_id' => $foreign->id, 'medical_institution_id' => $other->id, 'is_approved' => true]);
        $manager = $this->user('institution');
        $institution->managers()->attach($manager);
        $first = $this->booking($institution, $doctor, 'completed', '2026-11-10');
        $second = $this->booking($institution, $former, 'completed', '2026-11-12');
        $this->booking($institution, $doctor, 'cancelled', '2026-11-13');
        $this->booking($institution, $doctor, 'new', '2026-12-01');
        $this->booking($other, $foreign, 'completed', '2026-11-10');
        InstitutionEarning::create(['medical_institution_id' => $institution->id, 'doctor_id' => $doctor->id, 'consultation_request_id' => $first->id, 'gross_amount_minor' => 50000, 'provider_amount_minor' => 42500, 'doctor_amount_minor' => 17000, 'institution_amount_minor' => 25500, 'doctor_share_percent' => 40, 'currency' => 'MDL']);
        InstitutionEarning::create(['medical_institution_id' => $institution->id, 'doctor_id' => $former->id, 'consultation_request_id' => $second->id, 'gross_amount_minor' => 30000, 'provider_amount_minor' => 25500, 'doctor_amount_minor' => 12750, 'institution_amount_minor' => 12750, 'doctor_share_percent' => 50, 'currency' => 'MDL']);

        return [$institution, $doctor, $former, $foreign, $manager];
    }

    private function booking(MedicalInstitution $institution, User $doctor, string $status, string $date): ConsultationRequest
    {
        return ConsultationRequest::create(['patient_id' => $this->user('patient')->id, 'doctor_id' => $doctor->id, 'type' => 'video', 'status' => $status, 'scheduled_at' => $date.' 12:00:00', 'amount_minor' => 50000, 'symptoms' => 'Date medicale private', 'pricing_snapshot' => ['institution_id' => $institution->id]]);
    }

    private function user(string $name): User
    {
        $role = Role::firstOrCreate(['name' => $name], ['label' => $name]);
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active']);
        $user->roles()->attach($role);

        return $user;
    }
}
