<?php

namespace App\Services;

use Carbon\CarbonImmutable;

class PayoutRequestWindow
{
    public function __construct(private readonly PlatformConfig $config) {}

    public function current(?CarbonImmutable $now = null): array
    {
        $now = ($now ?? CarbonImmutable::now())->setTimezone('Europe/Chisinau');
        $start = (int) $this->config->number('payout.request_day_start', 1);
        $end = (int) $this->config->number('payout.request_day_end', 10);
        $valid = $start >= 1 && $end <= 31 && $start <= $end;

        return ['start_day' => $start, 'end_day' => $end, 'valid' => $valid, 'open' => $valid && $now->day >= $start && $now->day <= $end, 'today' => $now->toDateString(), 'timezone' => 'Europe/Chisinau'];
    }
}
