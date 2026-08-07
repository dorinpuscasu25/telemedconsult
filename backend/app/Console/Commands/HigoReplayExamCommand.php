<?php

namespace App\Console\Commands;

use App\Services\Higo\HigoExamIngestor;
use App\Services\ObjectiveDataSchema;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Trece un payload de examinare dintr-un fișier JSON prin exact același drum ca
 * webhook-ul, ca maparea să poată fi testată înainte de a exista un aparat real.
 *
 * Cu `--dry` nu scrie nimic: arată doar cum ar fi interpretate câmpurile, ceea
 * ce e util când primim de la HIGO un exemplu de payload și vrem să vedem ce
 * recunoaștem și ce nu.
 */
#[Signature('higo:replay {file : Fișier JSON cu payload-ul examinării} {--dry : Doar arată maparea, fără să scrie nimic}')]
#[Description('Rulează un payload de examinare dintr-un fișier, ca și cum ar fi venit pe webhook.')]
class HigoReplayExamCommand extends Command
{
    public function handle(HigoExamIngestor $ingestor): int
    {
        $file = (string) $this->argument('file');

        if (! is_readable($file)) {
            $this->error("Nu pot citi fișierul: {$file}");

            return self::FAILURE;
        }

        $raw = json_decode((string) file_get_contents($file), true);

        if (! is_array($raw)) {
            $this->error('Fișierul nu conține JSON valid.');

            return self::FAILURE;
        }

        $measurements = $ingestor->measurements($raw);

        $this->line('');
        $this->components->twoColumnDetail('<fg=gray>Câmp</>', '<fg=gray>Valoare</>');

        foreach ($measurements as $key => $value) {
            $known = ObjectiveDataSchema::knows($key);
            $label = $known ? "<fg=green>{$key}</>" : "<fg=yellow>{$key}</> <fg=gray>(nemapat)</>";
            $this->components->twoColumnDetail($label, (string) $value);
        }

        if ($measurements === []) {
            $this->warn('Nicio măsurătoare recunoscută. Verifică `higo.exams.measurements_paths` din config/higo.php.');
        }

        $this->newLine();
        $this->line('Verde = din vocabularul canonic. Galben = ajunge la medic cu numele original;');
        $this->line('adaugă-l în `higo.exams.field_map` și rulează `php artisan higo:remap --all`.');

        if ($this->option('dry')) {
            $this->newLine();
            $this->info('Dry run — nu s-a scris nimic.');

            return self::SUCCESS;
        }

        $payload = $ingestor->ingest($raw);

        $this->newLine();
        $this->components->twoColumnDetail('Stare', $payload->status);

        if ($payload->error) {
            $this->components->twoColumnDetail('Motiv', "<fg=yellow>{$payload->error}</>");
        }

        if ($payload->consultation_request_id) {
            $this->components->twoColumnDetail('Atașat consultației', (string) $payload->consultation_request_id);
        }

        return self::SUCCESS;
    }
}
