<?php

namespace App\Console\Commands;

use App\Models\DoctorProfile;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Services\Higo\HigoProvisioner;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

#[Signature('higo:sync {--kind=* : patient|doctor|operator (implicit toate)} {--failed : Doar cele eșuate anterior} {--all : Retrimite inclusiv ce e deja sincronizat}')]
#[Description('Trimite în HIGO profilurile nesincronizate (backfill pentru conturile create înainte de integrare).')]
class HigoSyncCommand extends Command
{
    private const MODELS = [
        'patient' => PatientProfile::class,
        'doctor' => DoctorProfile::class,
        'operator' => OperatorProfile::class,
    ];

    public function handle(HigoProvisioner $provisioner): int
    {
        if (! $provisioner->enabled()) {
            $this->error('Sincronizarea HIGO este oprită: verifică HIGO_BASE_URL, HIGO_SYNC_ENABLED și flagul „higo_devices”.');

            return self::FAILURE;
        }

        $kinds = $this->option('kind') ?: array_keys(self::MODELS);
        $failures = 0;

        foreach ($kinds as $kind) {
            $model = self::MODELS[$kind] ?? null;

            if (! $model) {
                $this->error("Tip necunoscut: {$kind}");

                return self::FAILURE;
            }

            $query = $model::query()->with('user');

            if ($this->option('failed')) {
                $query->where('higo_sync_status', HigoProvisioner::STATUS_FAILED);
            } elseif (! $this->option('all')) {
                $query->where(fn (Builder $builder) => $builder
                    ->whereNull('higo_sync_status')
                    ->orWhere('higo_sync_status', '!=', HigoProvisioner::STATUS_SYNCED));
            }

            $total = (clone $query)->count();

            if ($total === 0) {
                $this->line("{$kind}: nimic de trimis.");

                continue;
            }

            $this->line("{$kind}: {$total} de trimis…");
            $bar = $this->output->createProgressBar($total);

            $query->chunkById(100, function ($profiles) use ($provisioner, $bar, &$failures) {
                foreach ($profiles as $profile) {
                    if (! $provisioner->sync($profile)) {
                        $failures++;
                    }

                    $bar->advance();
                }
            });

            $bar->finish();
            $this->newLine();
        }

        if ($failures > 0) {
            $this->warn("{$failures} profil(uri) nu au putut fi sincronizate. Detaliile sunt în coloana higo_sync_error și în higo_sync_logs.");

            return self::FAILURE;
        }

        $this->info('Sincronizare completă.');

        return self::SUCCESS;
    }
}
