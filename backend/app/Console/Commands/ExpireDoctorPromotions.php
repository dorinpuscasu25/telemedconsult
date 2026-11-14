<?php

namespace App\Console\Commands;

use App\Models\DoctorPromotion;
use App\Services\DoctorPromotions;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('doctors:expire-promotions')]
class ExpireDoctorPromotions extends Command
{
    public function handle(DoctorPromotions $promotions): int
    {
        DoctorPromotion::with('doctor')->where('status', 'active')->where('ends_at', '<=', now())->lazyById(100)->each(fn ($campaign) => $promotions->stop($campaign->doctor, $campaign));

        return self::SUCCESS;
    }
}
