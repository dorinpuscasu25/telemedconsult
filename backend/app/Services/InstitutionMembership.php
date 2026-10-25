<?php

namespace App\Services;

use App\Models\DoctorProfile;
use App\Models\MedicalInstitution;
use App\Models\MedicalInstitutionInvitation;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Notifications\AppEventNotification;
use App\Notifications\InstitutionInvitationNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * Legătura dintre medici și instituții: conturi create direct de instituție,
 * invitații și afilierea propriu-zisă.
 *
 * Medicii adăugați de o instituție sunt aprobați automat: instituția e un
 * partener verificat de admin și răspunde pentru medicii ei.
 */
class InstitutionMembership
{
    public const INVITATION_DAYS = 7;

    /**
     * @param  array{name: string, email: string, phone?: string|null, specialty_id: int, license_number?: string|null, doctor_share_percent?: float|null, password?: string|null}  $data
     * @return array{user: User, password: string|null}
     */
    public function createDoctorAccount(MedicalInstitution $institution, array $data): array
    {
        $generatedPassword = empty($data['password']) ? Str::password(12, symbols: false) : null;

        $user = DB::transaction(function () use ($institution, $data, $generatedPassword) {
            $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
            $user = User::create([
                'name' => $data['name'],
                'email' => Str::lower($data['email']),
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'] ?? $generatedPassword,
                'status' => 'active',
                'active_role_id' => $role->id,
            ]);
            $user->forceFill(['email_verified_at' => now()])->save();
            $user->roles()->sync([$role->id]);
            $this->attachDoctor($institution, $user, $data);

            return $user;
        });

        return ['user' => $user, 'password' => $generatedPassword];
    }

    /**
     * Leagă un medic de instituție, creându-i profilul de medic dacă nu există.
     *
     * @param  array{specialty_id?: int|null, license_number?: string|null, doctor_share_percent?: float|null}  $data
     */
    public function attachDoctor(MedicalInstitution $institution, User $user, array $data = []): DoctorProfile
    {
        $existing = DoctorProfile::where('user_id', $user->id)->first();
        abort_if(
            $existing?->medical_institution_id && (int) $existing->medical_institution_id !== (int) $institution->id,
            422,
            'Medicul face deja parte din altă instituție medicală.'
        );

        $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
        $user->roles()->syncWithoutDetaching([$role->id]);
        if (! $user->active_role_id) {
            $user->forceFill(['active_role_id' => $role->id])->save();
        }

        return DoctorProfile::updateOrCreate(['user_id' => $user->id], [
            'specialty_id' => $data['specialty_id'] ?? $existing?->specialty_id ?? Specialty::first()?->id,
            'license_number' => $data['license_number'] ?? $existing?->license_number,
            'experience_years' => $existing?->experience_years ?? 0,
            'consultation_price' => $existing?->consultation_price ?? 400,
            'platforms' => $existing?->platforms ?? ['Video', 'Chat'],
            'service_catalog' => $existing?->service_catalog ?? [],
            'required_investigations' => $existing?->required_investigations ?? [],
            'affiliate_code' => $existing?->affiliate_code ?? Str::lower(Str::random(10)),
            'is_approved' => true,
            'is_available' => $existing?->is_available ?? true,
            'medical_institution_id' => $institution->id,
            'institution_share_percent' => array_key_exists('doctor_share_percent', $data) ? $data['doctor_share_percent'] : $existing?->institution_share_percent,
            'institution_joined_at' => $existing?->medical_institution_id ? $existing->institution_joined_at : now(),
        ]);
    }

    /**
     * Medicul rămâne pe platformă ca medic independent. Ce i-a rămas de primit
     * de la instituție rămâne datorat de aceasta (câștigurile sunt păstrate).
     */
    public function detachDoctor(DoctorProfile $profile): void
    {
        $profile->forceFill([
            'medical_institution_id' => null,
            'institution_share_percent' => null,
            'institution_joined_at' => null,
        ])->save();
    }

    /**
     * @param  array{email: string, name?: string|null, specialty_id?: int|null, license_number?: string|null, doctor_share_percent?: float|null}  $data
     * @return array{invitation: MedicalInstitutionInvitation, token: string}
     */
    public function invite(MedicalInstitution $institution, User $inviter, array $data): array
    {
        $email = Str::lower($data['email']);
        $existingUser = User::with('doctorProfile')->where('email', $email)->first();
        abort_if(
            $existingUser?->doctorProfile?->medical_institution_id === $institution->id,
            422,
            'Acest medic face deja parte din instituția ta.'
        );
        abort_if(
            (bool) $existingUser?->doctorProfile?->medical_institution_id,
            422,
            'Acest medic face deja parte din altă instituție medicală.'
        );

        MedicalInstitutionInvitation::where('medical_institution_id', $institution->id)
            ->where('email', $email)
            ->where('status', 'pending')
            ->update(['status' => 'revoked']);

        $token = Str::random(48);
        $invitation = MedicalInstitutionInvitation::create([
            'medical_institution_id' => $institution->id,
            'email' => $email,
            'name' => $data['name'] ?? $existingUser?->name,
            'specialty_id' => $data['specialty_id'] ?? null,
            'license_number' => $data['license_number'] ?? null,
            'doctor_share_percent' => $data['doctor_share_percent'] ?? null,
            'token_hash' => MedicalInstitutionInvitation::hashToken($token),
            'status' => 'pending',
            'expires_at' => now()->addDays(self::INVITATION_DAYS),
            'invited_by' => $inviter->id,
        ]);

        $this->sendInvitation($invitation, $token, $existingUser);

        return ['invitation' => $invitation, 'token' => $token];
    }

    /** Un link nou, cu termen reînnoit; linkul vechi nu mai funcționează. */
    public function resend(MedicalInstitutionInvitation $invitation): string
    {
        $token = Str::random(48);
        $invitation->forceFill([
            'token_hash' => MedicalInstitutionInvitation::hashToken($token),
            'status' => 'pending',
            'expires_at' => now()->addDays(self::INVITATION_DAYS),
        ])->save();

        $this->sendInvitation($invitation, $token, User::where('email', $invitation->email)->first());

        return $token;
    }

    public function acceptInvitation(MedicalInstitutionInvitation $invitation, User $user, array $data = []): DoctorProfile
    {
        return DB::transaction(function () use ($invitation, $user, $data) {
            $invitation = MedicalInstitutionInvitation::lockForUpdate()->findOrFail($invitation->id);
            abort_unless($invitation->isUsable(), 410, 'Invitația nu mai este valabilă.');

            $profile = $this->attachDoctor($invitation->institution, $user, array_filter([
                'specialty_id' => $data['specialty_id'] ?? $invitation->specialty_id,
                'license_number' => $data['license_number'] ?? $invitation->license_number,
            ]) + ['doctor_share_percent' => $invitation->doctor_share_percent]);

            $invitation->forceFill([
                'status' => 'accepted',
                'accepted_by' => $user->id,
                'accepted_at' => now(),
            ])->save();

            Notification::send($invitation->institution->managers()->get(), new AppEventNotification(
                'Invitație acceptată',
                $user->name.' s-a alăturat instituției tale.',
                '/institution/doctors',
            ));

            return $profile;
        });
    }

    public function invitationUrl(string $token): string
    {
        return rtrim((string) config('services.frontend_url'), '/').'/invitatie/'.$token;
    }

    private function sendInvitation(MedicalInstitutionInvitation $invitation, string $token, ?User $existingUser): void
    {
        $url = $this->invitationUrl($token);
        $institutionName = $invitation->institution->name;

        Notification::route('mail', $invitation->email)
            ->notify(new InstitutionInvitationNotification($institutionName, $invitation->name, $url, $invitation->expires_at, (bool) $existingUser));

        $existingUser?->notify(new AppEventNotification(
            'Invitație de la '.$institutionName,
            $institutionName.' te invită să lucrezi pe platformă prin instituție.',
            '/invitatie/'.$token,
        ));
    }
}
