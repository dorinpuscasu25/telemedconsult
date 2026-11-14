<?php

namespace App\Services;

use App\Jobs\SyncHigoEntity;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\InstitutionTransfer;
use App\Models\MedicalInstitution;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

class InstitutionTransferService
{
    public function request(User $doctor, int $targetId, ?string $note): InstitutionTransfer
    {
        return DB::transaction(function () use ($doctor, $targetId, $note) {
            $doctor = User::whereKey($doctor->id)->lockForUpdate()->firstOrFail();
            $profile = DoctorProfile::where('user_id', $doctor->id)->lockForUpdate()->first();
            abort_unless($doctor->status === 'active' && $doctor->hasRole('doctor') && $profile?->is_approved, 403, 'Contul medicului trebuie să fie activ și aprobat.');
            $target = MedicalInstitution::whereKey($targetId)->lockForUpdate()->firstOrFail();
            abort_unless($target->isActive(), 422, 'Instituția aleasă nu este activă.');
            abort_if((int) $profile->medical_institution_id === $target->id, 422, 'Faci deja parte din această instituție.');
            abort_if(InstitutionTransfer::where('doctor_id', $doctor->id)->where('status', 'pending')->exists(), 422, 'Ai deja o cerere în așteptare. Anuleaz-o înainte de a trimite alta.');
            $transfer = InstitutionTransfer::create(['doctor_id' => $doctor->id, 'from_institution_id' => $profile->medical_institution_id, 'to_institution_id' => $target->id, 'note' => $note]);
            DB::afterCommit(fn () => Notification::send($target->managers()->get(), new AppEventNotification('Cerere de afiliere la instituție', $doctor->name.' solicită afilierea la '.$target->name.'.', '/institution/doctors', 'info')));

            return $transfer;
        }, attempts: 3);
    }

    public function decide(InstitutionTransfer $transfer, MedicalInstitution $institution, User $manager, array $input): InstitutionTransfer
    {
        return DB::transaction(function () use ($transfer, $institution, $manager, $input) {
            $doctor = User::whereKey($transfer->doctor_id)->lockForUpdate()->firstOrFail();
            $profile = DoctorProfile::where('user_id', $doctor->id)->lockForUpdate()->firstOrFail();
            $target = MedicalInstitution::whereKey($institution->id)->lockForUpdate()->firstOrFail();
            $transfer = InstitutionTransfer::whereKey($transfer->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $transfer->to_institution_id === (int) $target->id && $target->managers()->whereKey($manager->id)->exists(), 404);
            abort_unless($target->isActive(), 422, 'Instituția nu mai este activă.');
            abort_unless($transfer->status === 'pending', 422, 'Cererea a fost deja procesată.');
            if ($input['status'] === 'approved') {
                abort_unless($doctor->status === 'active' && $profile->is_approved, 422, 'Contul medicului nu mai este activ și aprobat.');
                abort_unless((int) $profile->medical_institution_id === (int) $transfer->from_institution_id, 409, 'Afilierea medicului s-a schimbat. Este necesară o cerere nouă.');
                $this->freezeLegacyAppointments($profile);
                $profile->forceFill(['medical_institution_id' => $target->id, 'institution_share_percent' => $input['doctor_share_percent'], 'institution_joined_at' => now(), 'requested_institution_id' => null])->save();
                $transfer->doctor_share_percent = $input['doctor_share_percent'];
            }
            $transfer->forceFill(['status' => $input['status'], 'decision_note' => $input['decision_note'] ?? null, 'decided_by' => $manager->id, 'decided_at' => now()])->save();
            DB::afterCommit(function () use ($transfer, $doctor, $target): void {
                $doctor->notify(new AppEventNotification($transfer->status === 'approved' ? 'Afiliere aprobată' : 'Cerere de afiliere respinsă', $target->name.($transfer->status === 'approved' ? ' a aprobat cererea. Afilierea este activă pentru programările noi.' : ' a respins cererea. '.$transfer->decision_note), '/doctor/profile?section=inst'));
                if ($transfer->status === 'approved') {
                    if ($source = $transfer->fromInstitution) {
                        Notification::send($source->managers()->get(), new AppEventNotification('Medic transferat', $doctor->name.' s-a transferat la '.$target->name.'. Evidența consultațiilor și sumele datorate rămân păstrate.', '/institution/reports'));
                    }
                    dispatch(SyncHigoEntity::forUser($doctor->refresh()));
                }
            });

            return $transfer;
        }, attempts: 3);
    }

    public function cancel(InstitutionTransfer $transfer, User $doctor): void
    {
        DB::transaction(function () use ($transfer, $doctor): void {
            User::whereKey($doctor->id)->lockForUpdate()->firstOrFail();
            $transfer = InstitutionTransfer::whereKey($transfer->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $transfer->doctor_id === (int) $doctor->id, 404);
            abort_unless($transfer->status === 'pending', 422, 'Cererea a fost deja procesată.');
            $transfer->forceFill(['status' => 'cancelled', 'decided_at' => now()])->save();
        }, attempts: 3);
    }

    public function freezeLegacyAppointments(DoctorProfile $profile): void
    {
        ConsultationRequest::where('doctor_id', $profile->user_id)->whereNull('pricing_snapshot->institution_id')->lockForUpdate()
            ->chunkById(200, function ($requests) use ($profile): void {
                $known = InstitutionEarning::whereIn('consultation_request_id', $requests->modelKeys())->get()->keyBy('consultation_request_id');
                foreach ($requests as $request) {
                    $snapshot = $request->pricing_snapshot ?? [];
                    if (array_key_exists('institution_id', $snapshot)) {
                        continue;
                    }
                    $earning = $known->get($request->id);
                    $joined = ! $profile->institution_joined_at || $request->created_at->gte($profile->institution_joined_at);
                    $request->forceFill(['pricing_snapshot' => [...$snapshot,
                        'institution_id' => $earning?->medical_institution_id ?? ($joined ? $profile->medical_institution_id : null),
                        'doctor_share_percent' => $earning?->doctor_share_percent ?? ($joined ? $profile->effectiveInstitutionSharePercent() : null),
                        'affiliation_snapshot_source' => 'pre_transfer_legacy',
                    ]])->save();
                }
            });
    }
}
