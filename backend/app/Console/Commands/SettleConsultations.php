<?php

namespace App\Console\Commands;

use App\Services\ConsultationSettlement;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Banii rezervați nu rămân blocați: consultațiile finalizate fără recenzie se
 * închid și se plătesc la termen, iar cele care nu au avut loc își returnează banii.
 */
#[Signature('consultations:settle')]
#[Description('Închide consultațiile fără recenzie la termen și returnează banii celor care nu au avut loc')]
class SettleConsultations extends Command
{
    public function handle(ConsultationSettlement $settlement): int
    {
        $result = $settlement->settleDue();
        $this->info("Închise: {$result['closed']} · Returnate: {$result['refunded']}");

        return self::SUCCESS;
    }
}
