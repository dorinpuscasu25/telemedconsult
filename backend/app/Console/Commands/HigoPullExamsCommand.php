<?php

namespace App\Console\Commands;

use App\Models\HigoExamPayload;
use App\Services\Higo\HigoExamFetcher;
use App\Services\Higo\HigoExamIngestor;
use App\Services\Higo\HigoProvisioner;
use App\Services\PlatformConfig;
use Carbon\CarbonInterface;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Aduce periodic examinările noi din HIGO, fără să depindem de notificările lor.
 *
 * Webhook-ul rămâne calea preferată (datele ajung în secunde), dar cât timp
 * abonarea nu e activă, comanda asta face aceeași treabă la interval: întreabă
 * ce examinări s-au creat de la ultima rulare și le trece prin exact același
 * lanț de procesare.
 *
 * E sigură la rulări repetate: `higo_exam_payloads.external_id` e unic, deci o
 * examinare adusă de două ori nu produce date duble.
 */
#[Signature('higo:pull {--since= : Data de la care se caută (yyyy-mm-dd hh:mm:ss); implicit, de la ultima rulare} {--overlap=10 : Minute de suprapunere, ca să nu scape examinări la limită}')]
#[Description('Aduce din HIGO examinările create de la ultima rulare și le atașează consultațiilor.')]
class HigoPullExamsCommand extends Command
{
    /** Cheia sub care ținem minte până unde am adus. */
    private const WATERMARK = 'higo.exams.pulled_until';

    public function handle(
        HigoExamFetcher $fetcher,
        HigoExamIngestor $ingestor,
        HigoProvisioner $provisioner,
        PlatformConfig $config,
    ): int {
        // Integrarea oprită NU e o eroare: comanda rulează din scheduler la
        // fiecare 5 minute, iar pe un server unde HIGO încă nu e configurat un
        // exit de eșec ar umple logurile și ar arăta ca o pană reală.
        if (! $provisioner->enabled()) {
            $this->components->warn('Integrarea HIGO este oprită — nu aduc nimic. Verifică HIGO_BASE_URL, HIGO_SYNC_ENABLED și modulul „Aparate & integrare HIGO”.');

            return self::SUCCESS;
        }

        $startedAt = now();
        $since = $this->resolveSince($config);

        $this->components->twoColumnDetail('Caut examinări de la', $since->toDateTimeString());

        $reportIds = $fetcher->reportIdsSince($since);

        if ($reportIds === null) {
            // Interogarea a eșuat: nu avansăm reperul, altfel am sări peste
            // examinările din intervalul pe care nu am reușit să-l citim.
            $this->error('Nu am putut interoga HIGO. Reperul rămâne neschimbat, se reia la următoarea rulare.');

            return self::FAILURE;
        }

        if ($reportIds === []) {
            $this->info('Nicio examinare nouă.');
            $this->rememberWatermark($config, $startedAt);

            return self::SUCCESS;
        }

        $this->line(count($reportIds).' examinări de procesat…');

        $mapped = 0;
        $other = [];

        foreach ($reportIds as $reportId) {
            // Aceeași cale ca la webhook: notificarea sintetică poartă doar id-ul,
            // iar restul datelor se aduc din API.
            $payload = $ingestor->ingestNotification(['data' => ['diagnosticReportId' => $reportId]]);

            if ($payload->status === HigoExamPayload::STATUS_MAPPED) {
                $mapped++;
            } else {
                $other[$payload->status] = ($other[$payload->status] ?? 0) + 1;
            }
        }

        $this->components->twoColumnDetail('Atașate consultațiilor', "<fg=green>{$mapped}</>");

        foreach ($other as $status => $count) {
            $this->components->twoColumnDetail($status, "<fg=yellow>{$count}</>");
        }

        if ($other !== []) {
            $this->line('Cele neatașate rămân salvate brut și pot fi reluate din /admin/higo.');
        }

        $this->rememberWatermark($config, $startedAt);

        return self::SUCCESS;
    }

    private function resolveSince(PlatformConfig $config): CarbonInterface
    {
        if ($explicit = $this->option('since')) {
            return Carbon::parse((string) $explicit);
        }

        $watermark = $config->get(self::WATERMARK);

        // Prima rulare: luăm ultimele 24 de ore, ca să prindem ce s-a întâmplat
        // înainte de a porni sincronizarea.
        return $watermark ? Carbon::parse((string) $watermark) : now()->subDay();
    }

    /**
     * Reținem un moment ușor în urmă: dacă o examinare se scrie la ei fix în
     * timpul rulării, nu vrem s-o pierdem la runda următoare.
     */
    private function rememberWatermark(PlatformConfig $config, CarbonInterface $startedAt): void
    {
        $overlap = max(0, (int) $this->option('overlap'));

        $config->upsert(
            self::WATERMARK,
            $startedAt->subMinutes($overlap)->toDateTimeString(),
            'higo',
            'string',
        );
    }
}
