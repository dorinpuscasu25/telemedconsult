<?php

namespace App\Console\Commands;

use App\Services\TelegramBot;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('telegram:poll')]
#[Description('Modul polling: citește mesajele noi ale botului (fără webhook).')]
class TelegramPollCommand extends Command
{
    public function handle(TelegramBot $bot): int
    {
        if (! $bot->polling()) {
            return self::SUCCESS;
        }

        $count = $bot->pollUpdates();
        if ($count > 0) {
            $this->line("Mesaje tratate: {$count}");
        }

        return self::SUCCESS;
    }
}
