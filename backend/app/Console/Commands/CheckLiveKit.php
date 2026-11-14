<?php

namespace App\Console\Commands;

use App\Services\LiveKitService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

#[Signature('livekit:check {--connect : Verifică și autentificarea la serverul LiveKit}')]
#[Description('Verifică integrarea LiveKit fără a afișa chei sau tokenuri')]
class CheckLiveKit extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(LiveKitService $livekit): int
    {
        if (! $livekit->configured()) {
            $this->error('Configurație LiveKit invalidă. Verifică LIVEKIT_URL, LIVEKIT_API_KEY și LIVEKIT_API_SECRET (minimum 32 de caractere).');

            return self::FAILURE;
        }
        $this->info('Configurația LiveKit este validă.');
        if (! $this->option('connect')) {
            $this->comment('Folosește --connect pentru a verifica și conexiunea, fără a crea o cameră.');

            return self::SUCCESS;
        }
        try {
            $livekit->checkConnection();
        } catch (ConnectionException) {
            $this->error('LiveKit nu poate fi contactat. Verifică adresa proiectului și accesul la rețea.');

            return self::FAILURE;
        } catch (RequestException $exception) {
            $this->error('LiveKit a respins verificarea (HTTP '.$exception->response->status().'). Verifică proiectul și cheile de acces.');

            return self::FAILURE;
        }
        $this->info('Conexiunea și autentificarea LiveKit funcționează.');

        return self::SUCCESS;
    }
}
