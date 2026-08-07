<?php

namespace App\Console\Commands;

use App\Models\HigoExamPayload;
use App\Services\Higo\HigoExamIngestor;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('higo:remap {--all : Reprocesează inclusiv examinările deja mapate} {--id=* : Doar payload-urile cu aceste id-uri}')]
#[Description('Reaplică maparea peste payload-urile HIGO deja primite, după corectarea config/higo.php.')]
class HigoRemapExamsCommand extends Command
{
    public function handle(HigoExamIngestor $ingestor): int
    {
        $query = HigoExamPayload::query();

        if ($ids = $this->option('id')) {
            $query->whereIn('id', $ids);
        } elseif (! $this->option('all')) {
            // Implicit reluăm doar ce n-a reușit; `--all` e pentru cazul în care
            // maparea era greșită, nu absentă.
            $query->whereIn('status', [
                HigoExamPayload::STATUS_RECEIVED,
                HigoExamPayload::STATUS_UNMATCHED,
                HigoExamPayload::STATUS_FAILED,
            ]);
        }

        $total = (clone $query)->count();

        if ($total === 0) {
            $this->info('Nimic de remapat.');

            return self::SUCCESS;
        }

        $this->line("Remapez {$total} examinări…");
        $bar = $this->output->createProgressBar($total);
        $mapped = 0;

        $query->chunkById(100, function ($payloads) use ($ingestor, $bar, &$mapped) {
            foreach ($payloads as $payload) {
                if ($ingestor->map($payload)->status === HigoExamPayload::STATUS_MAPPED) {
                    $mapped++;
                }

                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine();

        $failed = $total - $mapped;
        $this->info("Mapate: {$mapped}.");

        if ($failed > 0) {
            $this->warn("Rămase nemapate: {$failed}. Vezi coloana `error` din higo_exam_payloads.");
        }

        return self::SUCCESS;
    }
}
