<?php

namespace Database\Seeders;

use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\Message;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\Region;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Models\Wallet;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Date demo pentru verificarea vizuală a interfeței (pacient, medic, operator).
 *
 * Doar pentru mediul local — nu este apelat din DatabaseSeeder. Rulare:
 * `php artisan db:seed --class=UiDemoSeeder`. Poate fi rulat de mai multe ori:
 * consultațiile demo anterioare se șterg înainte de a fi recreate.
 */
class UiDemoSeeder extends Seeder
{
    public const PASSWORD = 'demo-ui-2026';

    public const PATIENT_EMAIL = 'demo.pacient@telemed.test';

    public const DOCTOR_EMAIL = 'demo.medic@telemed.test';

    public const OPERATOR_EMAIL = 'demo.operator@telemed.test';

    public const INSTITUTION_EMAIL = 'demo.clinica@telemed.test';

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('UiDemoSeeder nu rulează în producție.');

            return;
        }

        $region = Region::query()->where('is_active', true)->orderBy('id')->first();
        $specialty = Specialty::query()->orderBy('id')->first();

        $patient = $this->user(self::PATIENT_EMAIL, 'Elena Rusu', 'patient', '+37369000001');
        $doctor = $this->user(self::DOCTOR_EMAIL, 'Andrei Ceban', 'doctor', '+37369000002');
        $operator = $this->user(self::OPERATOR_EMAIL, 'Mihai Lungu', 'operator', '+37369000003');

        DoctorProfile::updateOrCreate(['user_id' => $doctor->id], [
            'specialty_id' => $specialty?->id,
            'license_number' => 'DEMO-001',
            'bio' => 'Medic de familie cu experiență în consultații la distanță.',
            'experience_years' => 12,
            'consultation_price' => 400,
            'video_price' => 350,
            'video_duration_minutes' => 20,
            'rating' => 4.8,
            'reviews_count' => 37,
            'is_available' => true,
            'is_approved' => true,
            'accepts_points' => true,
        ]);

        OperatorProfile::updateOrCreate(['user_id' => $operator->id], [
            'region' => $region?->name,
            'is_available' => true,
            'accepting_requests' => true,
            'is_approved' => true,
        ]);
        if ($region) {
            OperatorCoverage::firstOrCreate(['operator_id' => $operator->id, 'region_id' => $region->id]);
        }

        Wallet::firstOrCreate(['user_id' => $patient->id, 'type' => 'real'], ['balance_minor' => 250000, 'currency' => 'MDL']);

        $elena = $this->patientProfile($patient, 'Elena', 'Rusu', '1986-04-12', 'F', $region);
        $ion = $this->patientProfile($patient, 'Ion', 'Rusu', '1952-09-03', 'M', $region);
        $maria = $this->patientProfile($patient, 'Maria', 'Rusu', '2016-01-20', 'F', $region);

        ConsultationRequest::query()->where('patient_id', $patient->id)->each(function (ConsultationRequest $request): void {
            Conversation::query()->where('consultation_request_id', $request->id)->each(function (Conversation $conversation): void {
                $conversation->messages()->delete();
                $conversation->delete();
            });
            $request->objectiveData()->delete();
            $request->delete();
        });

        $now = Carbon::now();
        $base = [
            'patient_id' => $patient->id,
            'doctor_id' => $doctor->id,
            'specialty_id' => $specialty?->id,
            'type' => 'doctor',
        ];

        $this->consultation($base + [
            'patient_profile_id' => $ion->id,
            'consultation_kind' => 'video',
            'status' => 'new',
            'symptoms' => "Tensiune arterială crescută dimineața (160/95), amețeli ușoare de 3 zile.\nIa enalapril 10 mg o dată pe zi.",
            'current_illness_history' => 'Hipertensiune diagnosticată în 2015. Valorile au crescut după ce a întrerupt tratamentul o săptămână.',
            'scheduled_at' => $now->copy()->addDay()->setTime(10, 30),
            'acceptance_expires_at' => $now->copy()->addMinutes(48),
            'amount_minor' => 35000,
            'payment_status' => 'held',
        ], $patient, $doctor, null, 'Bună ziua, tatăl meu are tensiunea mare de câteva zile.');

        $this->consultation($base + [
            'patient_profile_id' => $maria->id,
            'consultation_kind' => 'with_exam',
            'operator_id' => $operator->id,
            'status' => 'new',
            'symptoms' => 'Febră 38,5°C de ieri seară, tuse uscată, durere în gât.',
            'acceptance_expires_at' => $now->copy()->addMinutes(12),
            'amount_minor' => 52000,
            'payment_status' => 'held',
        ], $patient, $doctor, $operator, 'Copilul are febră și tuse.');

        $this->consultation($base + [
            'patient_profile_id' => $elena->id,
            'consultation_kind' => 'video',
            'status' => 'accepted',
            'accepted_at' => $now->copy()->subHour(),
            'symptoms' => 'Erupție pe antebrațe, cu mâncărime, apărută după schimbarea detergentului.',
            'scheduled_at' => $now->copy()->subMinutes(5),
            'amount_minor' => 35000,
            'payment_status' => 'held',
        ], $patient, $doctor, null, 'Am atașat mai jos descrierea, vă aștept la ora stabilită.');

        $exam = $this->consultation($base + [
            'patient_profile_id' => $ion->id,
            'consultation_kind' => 'with_exam',
            'operator_id' => $operator->id,
            'status' => 'accepted',
            'accepted_at' => $now->copy()->subHours(3),
            'operator_accepted_at' => $now->copy()->subHours(3),
            'doctor_started_at' => $now->copy()->subMinutes(20),
            'objective_data_completed_at' => $now->copy()->subMinutes(40),
            'symptoms' => 'Dispnee la efort, edeme la gambe seara.',
            'amount_minor' => 61000,
            'payment_status' => 'held',
        ], $patient, $doctor, $operator, 'Operatorul a făcut măsurătorile.');
        ConsultationObjectiveData::create([
            'consultation_request_id' => $exam->id,
            'patient_profile_id' => $ion->id,
            'operator_id' => $operator->id,
            'source' => 'manual_operator',
            'payload' => ['systolic' => 152, 'diastolic' => 91, 'heart_rate' => 88, 'spo2' => 94, 'temperature' => 36.7],
            'completed_at' => $now->copy()->subMinutes(40),
        ]);

        $this->consultation($base + [
            'patient_profile_id' => $maria->id,
            'consultation_kind' => 'with_exam',
            'operator_id' => $operator->id,
            'status' => 'accepted',
            'accepted_at' => $now->copy()->subMinutes(30),
            'operator_accepted_at' => $now->copy()->subMinutes(30),
            'scheduled_at' => $now->copy()->addHours(2),
            'symptoms' => 'Durere de ureche dreapta, a început azi-noapte.',
            'amount_minor' => 58000,
            'payment_status' => 'held',
        ], $patient, $doctor, $operator, 'Vă așteptăm acasă.');

        $this->consultation($base + [
            'patient_profile_id' => $elena->id,
            'consultation_kind' => 'video',
            'status' => 'rescheduled',
            'symptoms' => 'Control după tratamentul pentru sinuzită.',
            'scheduled_at' => $now->copy()->addDays(2)->setTime(9, 0),
            'proposed_scheduled_at' => $now->copy()->addDays(2)->setTime(16, 0),
            'proposed_by' => $doctor->id,
            'amount_minor' => 35000,
            'payment_status' => 'held',
        ], $patient, $doctor, null, 'Pot doar dimineața.');

        $this->consultation($base + [
            'patient_profile_id' => $elena->id,
            'consultation_kind' => 'video',
            'status' => 'completed',
            'accepted_at' => $now->copy()->subDays(6),
            'doctor_started_at' => $now->copy()->subDays(6),
            'completed_at' => $now->copy()->subDays(6)->addMinutes(25),
            'symptoms' => 'Durere în gât și febră 37,8°C.',
            'amount_minor' => 35000,
            'payment_status' => 'captured',
        ], $patient, $doctor, null, 'Mulțumesc pentru recomandări!');

        $this->consultation($base + [
            'patient_profile_id' => $ion->id,
            'consultation_kind' => 'video',
            'status' => 'cancelled',
            'cancelled_at' => $now->copy()->subDays(10),
            'cancellation_reason' => 'Anulată de pacient înainte de confirmare.',
            'symptoms' => 'Dureri de spate.',
            'amount_minor' => 35000,
            'payment_status' => 'refunded',
        ], $patient, $doctor, null, 'Dureri de spate.');

        // Instituția demo: medicul demo lucrează prin ea, cu 70% din suma netă.
        $institution = MedicalInstitution::updateOrCreate(['name' => 'Clinica Demo Sănătate'], [
            'legal_name' => 'Clinica Demo Sănătate SRL',
            'fiscal_code' => '1000600000000',
            'iban' => 'MD24AG000225100013104168',
            'bank_name' => 'Banca Demo',
            'email' => 'contact@clinica-demo.test',
            'doctor_share_percent' => 70,
            'status' => 'active',
        ]);
        $manager = $this->user(self::INSTITUTION_EMAIL, 'Victoria Manager', 'institution', '+37369000004');
        $institution->managers()->syncWithoutDetaching([$manager->id]);
        DoctorProfile::where('user_id', $doctor->id)->update(['medical_institution_id' => $institution->id, 'institution_joined_at' => now()->subMonths(2)]);
        $completed = ConsultationRequest::where('patient_id', $patient->id)->where('status', 'completed')->first();
        if ($completed) {
            InstitutionEarning::updateOrCreate(['consultation_request_id' => $completed->id], [
                'medical_institution_id' => $institution->id,
                'doctor_id' => $doctor->id,
                'gross_amount_minor' => 35000,
                'provider_amount_minor' => 21000,
                'doctor_share_percent' => 70,
                'doctor_amount_minor' => 14700,
                'institution_amount_minor' => 6300,
            ]);
        }

        $this->command?->info('Conturi demo create. Parola: UiDemoSeeder::PASSWORD.');
    }

    private function user(string $email, string $name, string $roleName, string $phone): User
    {
        $role = Role::firstOrCreate(['name' => $roleName], ['label' => ucfirst($roleName)]);
        $user = User::updateOrCreate(['email' => $email], [
            'name' => $name,
            'phone' => $phone,
            'password' => self::PASSWORD,
            'status' => 'active',
            'active_role_id' => $role->id,
        ]);
        $user->forceFill(['email_verified_at' => $user->email_verified_at ?? now()])->save();
        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function patientProfile(User $owner, string $firstName, string $lastName, string $birthDate, string $gender, ?Region $region): PatientProfile
    {
        return PatientProfile::updateOrCreate(
            ['user_id' => $owner->id, 'first_name' => $firstName, 'last_name' => $lastName],
            [
                'birth_date' => $birthDate,
                'gender' => $gender,
                'region' => $region?->name,
                'region_id' => $region?->id,
                'locality' => $region?->name,
                'address' => 'Str. Ștefan cel Mare 12, ap. 5',
                'status' => 'active',
                'active_until' => now()->addYear(),
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function consultation(array $attributes, User $patient, User $doctor, ?User $operator, string $firstMessage): ConsultationRequest
    {
        $request = ConsultationRequest::create($attributes + ['provider_amount_minor' => (int) (($attributes['amount_minor'] ?? 0) * 0.8)]);

        $conversation = Conversation::create([
            'consultation_request_id' => $request->id,
            'patient_id' => $patient->id,
            'patient_profile_id' => $request->patient_profile_id,
            'doctor_id' => $doctor->id,
            'operator_id' => $operator?->id,
            'status' => in_array($request->status, ['completed', 'cancelled'], true) ? 'closed' : 'open',
        ]);

        Message::create(['conversation_id' => $conversation->id, 'sender_id' => $patient->id, 'body' => $firstMessage]);
        if ($request->status !== 'new') {
            Message::create(['conversation_id' => $conversation->id, 'sender_id' => $doctor->id, 'body' => 'Bună ziua! Am văzut descrierea, discutăm la consultație.']);
        }

        return $request;
    }
}
