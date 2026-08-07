<?php

namespace Tests\Feature\Higo;

use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Services\Higo\HigoProvisioner;
use App\Services\Higo\HigoResourceBuilder;
use App\Services\PlatformConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HigoProvisioningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'higo.base_url' => 'https://higo.test',
            'higo.client_id' => 'client-id',
            'higo.client_secret' => 'client-secret',
            'higo.username' => 'integration-user',
            'higo.password' => 'integration-password',
            'higo.cache.store' => 'database',
            'higo.http.retry_times' => 1,
            'higo.sync.enabled' => true,
        ]);

        foreach (['admin', 'patient', 'doctor', 'operator'] as $role) {
            Role::firstOrCreate(['name' => $role], ['label' => ucfirst($role)]);
        }
    }

    /**
     * Statusul cu care răspunde HIGO la resursele Practitioner. Îl ținem ca stare
     * a testului pentru că `Http::fake()` nu suprascrie stub-urile deja
     * înregistrate — primul care se potrivește câștigă — deci un test care vrea
     * întâi o pană și apoi o revenire trebuie să comute de aici.
     */
    private int $practitionerStatus = 201;

    private function fakeHigo(): void
    {
        Http::fake([
            'https://higo.test/oauth/token' => Http::response([
                'access_token' => 'jwt-token',
                'token_type' => 'bearer',
                'expires_in' => 3599,
            ]),
            'https://higo.test/api/fhir/Patient*' => Http::response(['resourceType' => 'Patient', 'id' => 'higo-patient-1'], 201),
            'https://higo.test/api/fhir/*Resource*' => fn () => $this->practitionerStatus >= 400
                ? Http::response(['error' => 'upstream down'], $this->practitionerStatus)
                : Http::response(['id' => 'higo-practitioner-1'], $this->practitionerStatus),
        ]);
    }

    private function userWithRole(string $roleName): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        // HIGO cere telefonul obligatoriu la medici și operatori.
        $user = User::factory()->create(['active_role_id' => $role->id, 'status' => 'active', 'phone' => '069484967']);
        $user->roles()->sync([$role->id]);

        return $user;
    }

    public function test_creating_a_doctor_from_admin_provisions_them_in_higo(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));
        $specialty = Specialty::create(['name' => 'Cardiologie', 'slug' => 'cardiologie']);

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Ion Popescu',
            'email' => 'ion@example.com',
            'phone' => '069484967',
            'roles' => ['doctor'],
            'specialty_id' => $specialty->id,
            'license_number' => 'LIC-42',
        ])->assertCreated();

        $profile = DoctorProfile::firstOrFail();

        $this->assertSame('higo-practitioner-1', $profile->higo_doctor_id);
        $this->assertSame(HigoProvisioner::STATUS_SYNCED, $profile->higo_sync_status);
        $this->assertNotNull($profile->higo_synced_at);

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://higo.test/api/fhir/DoctorResource'
            && $request->method() === 'POST'
            && $request['resourceType'] === 'DoctorResource'
            // `name` e obiect, nu listă, iar credențialele sunt obligatorii la creare.
            && $request['name']['family'] === 'Popescu'
            && $request['name']['given'][0] === 'Ion'
            && $request['username'] === 'ion@example.com'
            && filled($request['password'])
            && $request['qualification'][0]['code']['text'] === 'Cardiologie'
            && $request['identifier']['text'] === 'LICENCE_ID'
            && $request['identifier']['value'] === 'LIC-42');
    }

    public function test_creating_an_operator_from_admin_provisions_them_in_higo(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Maria Ionescu',
            'email' => 'maria@example.com',
            'phone' => '069484967',
            'roles' => ['operator'],
            'region' => $this->activeRegionName(),
        ])->assertCreated();

        $profile = OperatorProfile::firstOrFail();

        $this->assertSame('higo-practitioner-1', $profile->higo_operator_id);
        $this->assertSame(HigoProvisioner::STATUS_SYNCED, $profile->higo_sync_status);
    }

    public function test_updating_an_operator_pushes_an_update_to_the_existing_higo_resource(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $operator = $this->userWithRole('operator');
        OperatorProfile::create([
            'user_id' => $operator->id,
            'higo_operator_id' => 'higo-operator-1',
            'region' => $this->activeRegionName(),
            'is_approved' => true,
        ]);

        $this->putJson("/api/v1/admin/users/{$operator->id}", ['name' => 'Operator Nume Nou'])->assertOk();

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://higo.test/api/fhir/MedicalOperatorResource/higo-operator-1'
            && $request->method() === 'PUT');

        $this->assertSame('higo-operator-1', OperatorProfile::firstOrFail()->higo_operator_id);
    }

    public function test_an_already_created_doctor_is_not_resent_because_their_api_has_no_update(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'higo_doctor_id' => 'higo-doctor-1',
            'experience_years' => 3,
            'consultation_price' => 400,
            'is_approved' => true,
        ]);

        $this->putJson("/api/v1/admin/users/{$doctor->id}", ['name' => 'Dr. Nume Nou'])->assertOk();

        // DoctorResource acceptă doar `create`, deci nu batem degeaba în API.
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), 'DoctorResource'));

        $profile = DoctorProfile::firstOrFail();
        $this->assertSame('higo-doctor-1', $profile->higo_doctor_id);
        $this->assertSame(HigoProvisioner::STATUS_SYNCED, $profile->higo_sync_status);
    }

    public function test_approving_a_pending_registration_provisions_the_account(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $doctor = $this->userWithRole('doctor');
        $doctor->forceFill(['status' => 'pending'])->save();
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'experience_years' => 1,
            'consultation_price' => 300,
            'is_approved' => false,
        ]);

        $this->postJson("/api/v1/admin/users/{$doctor->id}/approve")->assertOk();

        $this->assertSame('higo-practitioner-1', DoctorProfile::firstOrFail()->higo_doctor_id);
    }

    public function test_a_higo_outage_does_not_break_user_creation_and_is_recorded(): void
    {
        $this->practitionerStatus = 503;
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Ion Popescu',
            'email' => 'ion@example.com',
            'phone' => '069484967',
            'roles' => ['doctor'],
        ])->assertCreated();

        $profile = DoctorProfile::firstOrFail();

        $this->assertNull($profile->higo_doctor_id);
        $this->assertSame(HigoProvisioner::STATUS_FAILED, $profile->higo_sync_status);
        $this->assertStringContainsString('503', (string) $profile->higo_sync_error);
    }

    public function test_nothing_is_sent_when_the_higo_module_is_disabled(): void
    {
        $this->fakeHigo();
        app(PlatformConfig::class)->upsert('feature.higo_devices', false, 'features', 'boolean');
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Ion Popescu',
            'email' => 'ion@example.com',
            'phone' => '069484967',
            'roles' => ['doctor'],
        ])->assertCreated();

        Http::assertNothingSent();
        $this->assertNull(DoctorProfile::firstOrFail()->higo_doctor_id);
    }

    public function test_nothing_is_sent_without_a_configured_base_url(): void
    {
        $this->fakeHigo();
        config(['higo.base_url' => null]);
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Ion Popescu',
            'email' => 'ion@example.com',
            'phone' => '069484967',
            'roles' => ['doctor'],
        ])->assertCreated();

        Http::assertNothingSent();
    }

    public function test_admin_accounts_are_never_sent_to_higo(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Admin Nou',
            'email' => 'admin2@example.com',
            'roles' => ['admin'],
        ])->assertCreated();

        Http::assertNothingSent();
    }

    public function test_admin_can_see_sync_state_and_retry_a_failed_profile(): void
    {
        $this->practitionerStatus = 503;
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $doctor = $this->userWithRole('doctor');
        $profile = DoctorProfile::create([
            'user_id' => $doctor->id,
            'experience_years' => 1,
            'consultation_price' => 300,
            'is_approved' => true,
        ]);

        app(HigoProvisioner::class)->sync($profile);

        $this->getJson('/api/v1/admin/higo/sync')
            ->assertOk()
            ->assertJsonPath('summary.enabled', true)
            ->assertJsonPath('data.0.status', HigoProvisioner::STATUS_FAILED)
            ->assertJsonPath('data.0.kind', 'doctor');

        // HIGO revine, adminul reia sincronizarea din panou.
        $this->practitionerStatus = 201;

        $this->postJson("/api/v1/admin/higo/sync/doctor/{$profile->id}")
            ->assertOk()
            ->assertJsonPath('data.status', HigoProvisioner::STATUS_SYNCED)
            ->assertJsonPath('data.higo_id', 'higo-practitioner-1');
    }

    /**
     * HIGO refuză întreaga resursă cu `error.fhir.practitioner.phone.invalid.format`
     * dacă numărul nu e E.164 — bug întâlnit la primul medic creat pe real.
     */
    public function test_local_phone_numbers_are_converted_to_e164(): void
    {
        $builder = app(HigoResourceBuilder::class);

        $this->assertSame('+37369484967', $builder->normalizePhone('069484967'));
        $this->assertSame('+37369484967', $builder->normalizePhone('069 484 967'));
        $this->assertSame('+37369484967', $builder->normalizePhone('+373 69 484 967'));
        $this->assertSame('+37369484967', $builder->normalizePhone('0037369484967'));
        $this->assertSame('+37369484967', $builder->normalizePhone('69484967'));
        $this->assertSame('+40721234567', $builder->normalizePhone('+40721234567'));

        // Un număr imposibil de normalizat e omis, nu trimis invalid.
        $this->assertNull($builder->normalizePhone('123'));
        $this->assertNull($builder->normalizePhone('nu-e-telefon'));
        $this->assertNull($builder->normalizePhone(null));
    }

    public function test_doctor_payload_carries_an_e164_phone(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Medic Test',
            'email' => 'medic@t.md',
            'phone' => '069484967',
            'roles' => ['doctor'],
        ])->assertCreated();

        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'DoctorResource')
            && collect($request['telecom'])->contains(
                fn (array $entry) => $entry['system'] === 'phone' && $entry['value'] === '(+373)69484967'
            ));
    }

    public function test_an_unusable_phone_is_rejected_before_it_can_reach_higo(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        // Validarea foloseste aceeasi normalizare ca provizionarea, deci un numar
        // pe care HIGO l-ar refuza nu poate intra deloc in sistem.
        $this->postJson('/api/v1/admin/users', [
            'name' => 'Medic Fara Telefon',
            'email' => 'medic2@t.md',
            'phone' => '123',
            'roles' => ['doctor'],
        ])->assertStatus(422)->assertJsonValidationErrors('phone');

        Http::assertNothingSent();
    }

    public function test_the_higo_id_is_read_from_the_content_location_header(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Ion Popescu',
            'email' => 'ion3@example.com',
            'phone' => '069484967',
            'roles' => ['doctor'],
        ])->assertCreated();

        // Corpul răspunsului lor e gol la DoctorResource; id-ul e doar în antet.
        $this->assertSame('higo-practitioner-1', DoctorProfile::firstOrFail()->higo_doctor_id);
    }

    public function test_a_patient_without_birth_date_or_id_number_is_not_sent(): void
    {
        $this->fakeHigo();

        $owner = $this->userWithRole('patient');
        $profile = PatientProfile::create(['user_id' => $owner->id, 'first_name' => 'Ana', 'last_name' => 'Pop']);

        $this->assertFalse(app(HigoProvisioner::class)->sync($profile));

        $error = (string) $profile->refresh()->higo_sync_error;
        $this->assertStringContainsString('data nașterii', $error);

        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/Patient'));
    }

    public function test_a_self_registered_provider_is_not_sent_before_approval(): void
    {
        $this->fakeHigo();

        // Înregistrare proprie: contul rămâne în așteptare.
        $doctor = $this->userWithRole('doctor');
        $doctor->forceFill(['status' => 'pending'])->save();
        $profile = DoctorProfile::create([
            'user_id' => $doctor->id,
            'experience_years' => 1,
            'consultation_price' => 300,
            'is_approved' => false,
        ]);

        $this->assertFalse(app(HigoProvisioner::class)->sync($profile));

        Http::assertNothingSent();
        $this->assertSame(HigoProvisioner::STATUS_SKIPPED, $profile->refresh()->higo_sync_status);
        $this->assertStringContainsString('aprobarea adminului', (string) $profile->higo_sync_error);

        // Adminul aprobă — abia acum pleacă spre HIGO.
        Sanctum::actingAs($this->userWithRole('admin'));
        $this->postJson("/api/v1/admin/users/{$doctor->id}/approve")->assertOk();

        $profile->refresh();
        $this->assertSame(HigoProvisioner::STATUS_SYNCED, $profile->higo_sync_status);
        $this->assertSame('higo-practitioner-1', $profile->higo_doctor_id);
    }

    public function test_editing_a_pending_provider_does_not_leak_them_to_higo(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $doctor = $this->userWithRole('doctor');
        $doctor->forceFill(['status' => 'pending'])->save();
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'experience_years' => 1,
            'consultation_price' => 300,
            'is_approved' => false,
        ]);

        $this->putJson("/api/v1/admin/users/{$doctor->id}", ['name' => 'Nume Corectat'])->assertOk();

        Http::assertNothingSent();
        $this->assertNull(DoctorProfile::firstOrFail()->higo_doctor_id);
    }

    public function test_the_account_holder_is_not_sent_only_the_patients_they_add(): void
    {
        $this->fakeHigo();

        // Contul de utilizator are un profil-coajă, fără date de identitate.
        $owner = $this->userWithRole('patient');
        $shell = PatientProfile::create(['user_id' => $owner->id]);

        $this->assertFalse(app(HigoProvisioner::class)->sync($shell));
        Http::assertNothingSent();
        $this->assertSame(HigoProvisioner::STATUS_SKIPPED, $shell->refresh()->higo_sync_status);

        // Pacientul adăugat după cumpărarea pachetului are date complete.
        $patient = PatientProfile::create([
            'user_id' => $owner->id,
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'birth_date' => '1990-01-01',
            'gender' => 'F',
            'status' => 'active',
        ]);

        $this->assertTrue(app(HigoProvisioner::class)->sync($patient));
        $this->assertSame('higo-patient-1', $patient->refresh()->higo_patient_id);
    }

    public function test_the_patient_is_linked_to_the_operator_when_one_is_assigned(): void
    {
        $this->fakeHigo();

        $operator = $this->userWithRole('operator');
        OperatorProfile::create([
            'user_id' => $operator->id,
            'higo_operator_id' => 'higo-operator-77',
            'is_approved' => true,
        ]);

        $owner = $this->userWithRole('patient');
        $patient = PatientProfile::create([
            'user_id' => $owner->id,
            'higo_patient_id' => 'higo-patient-1',
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'birth_date' => '1990-01-01',
            'gender' => 'F',
            'status' => 'active',
        ]);

        $this->assertTrue(app(HigoProvisioner::class)->linkPatientToOperator($patient, $operator));

        // Update-ul lor e PUT cu resursa completă, nu un patch.
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://higo.test/api/fhir/Patient/higo-patient-1'
            && $request->method() === 'PUT'
            && $request['id'] === 'higo-patient-1'
            && $request['birthDate'] === '1990-01-01'
            && $request['generalPractitioner'][0]['identifier']['id'] === 'higo-operator-77');

        $this->assertSame('higo-operator-77', $patient->refresh()->higo_general_practitioner_id);
    }

    public function test_the_same_link_is_not_sent_twice(): void
    {
        $this->fakeHigo();

        $operator = $this->userWithRole('operator');
        OperatorProfile::create([
            'user_id' => $operator->id,
            'higo_operator_id' => 'higo-operator-77',
            'is_approved' => true,
        ]);

        $owner = $this->userWithRole('patient');
        $patient = PatientProfile::create([
            'user_id' => $owner->id,
            'higo_patient_id' => 'higo-patient-1',
            'first_name' => 'Ana',
            'birth_date' => '1990-01-01',
            'gender' => 'F',
            'status' => 'active',
        ]);

        // Câmpurile de sincronizare nu sunt mass-assignable, tocmai fiindcă
        // profilurile se creează din input de utilizator.
        $patient->forceFill(['higo_general_practitioner_id' => 'higo-operator-77'])->save();

        $this->assertTrue(app(HigoProvisioner::class)->linkPatientToOperator($patient, $operator));

        Http::assertNotSent(fn (Request $request): bool => $request->method() === 'PUT');
    }

    public function test_linking_is_skipped_when_the_operator_is_not_in_higo_yet(): void
    {
        $this->fakeHigo();

        $operator = $this->userWithRole('operator');
        OperatorProfile::create(['user_id' => $operator->id, 'is_approved' => true]);

        $owner = $this->userWithRole('patient');
        $patient = PatientProfile::create([
            'user_id' => $owner->id,
            'higo_patient_id' => 'higo-patient-1',
            'first_name' => 'Ana',
            'birth_date' => '1990-01-01',
            'status' => 'active',
        ]);

        $this->assertFalse(app(HigoProvisioner::class)->linkPatientToOperator($patient, $operator));
        Http::assertNothingSent();
    }

    public function test_every_patient_gets_a_unique_six_digit_code(): void
    {
        $owner = $this->userWithRole('patient');

        $codes = collect(range(1, 25))
            ->map(fn (int $i) => PatientProfile::create([
                'user_id' => $owner->id,
                'first_name' => 'Pacient'.$i,
            ])->patient_code);

        $this->assertCount(25, $codes->unique(), 'Codurile trebuie să fie unice.');
        $codes->each(fn (?string $code) => $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $code));
    }

    public function test_the_generated_code_is_sent_to_higo_instead_of_an_id_document(): void
    {
        $this->fakeHigo();

        $owner = $this->userWithRole('patient');
        $profile = PatientProfile::create([
            'user_id' => $owner->id,
            'first_name' => 'Ana',
            'last_name' => 'Pop',
            'birth_date' => '1990-01-01',
            'gender' => 'F',
            'status' => 'active',
        ]);

        $this->assertTrue(app(HigoProvisioner::class)->sync($profile));

        // Platforma nu colectează IDNP; identificatorul trimis e codul generat.
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/Patient')
            && $request['identifier']['value'] === $profile->patient_code
            && $request['identifier']['type']['text'] === 'PESEL');
    }

    public function test_the_code_cannot_be_set_from_user_input(): void
    {
        $owner = $this->userWithRole('patient');

        $profile = PatientProfile::create([
            'user_id' => $owner->id,
            'first_name' => 'Ana',
            'patient_code' => '111111',
        ]);

        $this->assertNotSame('111111', $profile->patient_code);
    }

    public function test_the_higo_password_is_stored_so_the_operator_can_log_into_their_app(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $this->postJson('/api/v1/admin/users', [
            'name' => 'Maria Ionescu',
            'email' => 'maria@example.com',
            'phone' => '069484967',
            'roles' => ['operator'],
            'region' => $this->activeRegionName(),
        ])->assertCreated();

        $profile = OperatorProfile::firstOrFail();
        $stored = $profile->higo_password;

        $this->assertNotEmpty($stored);

        // Parola trimisă la ei e exact cea păstrată local, altfel operatorul nu
        // s-ar putea autentifica în aplicația lor mobilă.
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'MedicalOperatorResource')
            && $request['password'] === $stored);

        // Și e criptată în baza de date, nu în clar.
        $raw = \DB::table('operator_profiles')->where('id', $profile->id)->value('higo_password');
        $this->assertNotSame($stored, $raw);
    }

    public function test_an_operator_password_can_be_regenerated(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $operator = $this->userWithRole('operator');
        $profile = OperatorProfile::create([
            'user_id' => $operator->id,
            'higo_operator_id' => 'higo-operator-1',
            'is_approved' => true,
        ]);

        $response = $this->postJson("/api/v1/admin/higo/credentials/operator/{$profile->id}/reset")->assertOk();

        $this->assertNotEmpty($response->json('data.higo_password'));
        $this->assertSame($response->json('data.higo_password'), $profile->refresh()->higo_password);

        // Update-ul lor cere `id` în corpul resursei (HAPI-0419).
        Http::assertSent(fn (Request $request): bool => $request->method() === 'PUT'
            && $request['id'] === 'higo-operator-1');
    }

    public function test_a_doctor_password_cannot_be_reset_because_their_api_has_no_update(): void
    {
        $this->fakeHigo();
        Sanctum::actingAs($this->userWithRole('admin'));

        $doctor = $this->userWithRole('doctor');
        $profile = DoctorProfile::create([
            'user_id' => $doctor->id,
            'higo_doctor_id' => 'higo-doctor-1',
            'experience_years' => 1,
            'consultation_price' => 300,
            'is_approved' => true,
        ]);

        $this->postJson("/api/v1/admin/higo/credentials/doctor/{$profile->id}/reset")->assertStatus(422);
    }

    public function test_sync_panel_requires_admin(): void
    {
        Sanctum::actingAs($this->userWithRole('patient'));

        $this->getJson('/api/v1/admin/higo/sync')->assertForbidden();
    }

    public function test_backfill_command_sends_profiles_created_before_the_integration(): void
    {
        $this->fakeHigo();

        $doctor = $this->userWithRole('doctor');
        DoctorProfile::create([
            'user_id' => $doctor->id,
            'experience_years' => 1,
            'consultation_price' => 300,
            'is_approved' => true,
        ]);

        $this->artisan('higo:sync --kind=doctor')->assertSuccessful();

        $this->assertSame('higo-practitioner-1', DoctorProfile::firstOrFail()->higo_doctor_id);
    }

    public function test_patient_payload_carries_identity_and_birth_date(): void
    {
        $this->fakeHigo();

        $owner = $this->userWithRole('patient');
        $profile = PatientProfile::create([
            'user_id' => $owner->id,
            'first_name' => 'Ana',
            'last_name' => 'Rusu',
            'birth_date' => '1990-01-01',
            'gender' => 'F',
            'status' => 'active',
        ]);

        $this->assertTrue(app(HigoProvisioner::class)->sync($profile));

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://higo.test/api/fhir/Patient'
            && $request['resourceType'] === 'Patient'
            && $request['gender'] === 'female'
            && $request['birthDate'] === '1990-01-01'
            && $request['identifier']['type']['text'] === 'PESEL'
            && $request['identifier']['value'] === $profile->refresh()->patient_code
            && $request['name']['family'] === 'Rusu');

        $this->assertSame('higo-patient-1', $profile->refresh()->higo_patient_id);
    }

    private function activeRegionName(): string
    {
        return Region::query()->where('is_active', true)->value('name')
            ?? Region::create(['name' => 'Chișinău', 'type' => 'municipiu', 'country' => 'Republica Moldova', 'is_active' => true])->name;
    }
}
