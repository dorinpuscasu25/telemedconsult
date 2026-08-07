<?php

namespace App\Jobs;

use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\User;
use App\Services\Higo\HigoProvisioner;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\SerializesModels;

/**
 * Trimite un profil (sau toate profilurile unui utilizator) către HIGO.
 *
 * Job-ul e doar învelișul de coadă: toată logica și tratarea erorilor stau în
 * HigoProvisioner, care nu aruncă excepții. Așa, chiar și pe driverul `sync`
 * (unde job-ul rulează în cererea HTTP), o pană la HIGO nu strică răspunsul
 * dat adminului.
 */
class SyncHigoEntity implements ShouldQueue
{
    use Queueable, SerializesModels;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [10, 60];

    private function __construct(
        private readonly ?Model $entity,
        private readonly ?User $user,
        private readonly ?User $linkOperator = null,
    ) {
        $this->onQueue(config('higo.sync.queue'));
    }

    /**
     * @param  PatientProfile|DoctorProfile|OperatorProfile  $entity
     */
    public static function forEntity(Model $entity): self
    {
        return new self($entity, null);
    }

    /**
     * Sincronizează toate profilurile utilizatorului care au corespondent în HIGO.
     */
    public static function forUser(User $user): self
    {
        return new self(null, $user);
    }

    /**
     * Leagă pacientul de operatorul care îl va examina. Pacientul e creat în
     * HIGO fără legătură; aceasta se adaugă la atribuirea operatorului.
     */
    public static function linkPatientToOperator(PatientProfile $patient, User $operator): self
    {
        return new self($patient, null, $operator);
    }

    public function handle(HigoProvisioner $provisioner): void
    {
        if (! $provisioner->enabled()) {
            return;
        }

        if ($this->linkOperator && $this->entity instanceof PatientProfile) {
            $provisioner->linkPatientToOperator($this->entity, $this->linkOperator);

            return;
        }

        if ($this->user) {
            $provisioner->syncUser($this->user);

            return;
        }

        if ($this->entity) {
            $provisioner->sync($this->entity);
        }
    }
}
