<?php

namespace App\Console\Commands;

use App\Services\ConsultationSettlement;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Recuperează decontările documentelor publicate și restituie consultațiile neefectuate.
 */
#[Signature('consultations:settle')]
#[Description('Decontează rezultatele publicate și returnează banii consultațiilor neefectuate')]
class SettleConsultations extends Command
{
    public function handle(ConsultationSettlement $settlement): int
    {
        $result = $settlement->settleDue();
        $this->info("Închise: {$result['closed']} · Returnate: {$result['refunded']}");

        return self::SUCCESS;
    }
}
