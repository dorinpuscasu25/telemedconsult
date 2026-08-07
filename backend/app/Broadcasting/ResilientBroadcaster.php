<?php

namespace App\Broadcasting;

use Illuminate\Contracts\Broadcasting\Broadcaster;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Înfășoară broadcaster-ul real și înghite erorile de transmitere.
 *
 * Notificările în timp real sunt un strat de prezentare: fac interfața să se
 * actualizeze singură. Dacă serverul de broadcasting e oprit sau pică, asta nu
 * are voie să anuleze operațiunea de business — iar înainte exact asta se
 * întâmpla: o consultație creată într-o tranzacție era ștearsă complet fiindcă
 * nu se putea trimite un eveniment de UI.
 *
 * Autentificarea canalelor NU e înfășurată: acolo o eroare trebuie să se vadă,
 * fiindcă ține de acces, nu de livrare.
 */
class ResilientBroadcaster implements Broadcaster
{
    public function __construct(private readonly Broadcaster $inner) {}

    public function auth($request)
    {
        return $this->inner->auth($request);
    }

    public function validAuthenticationResponse($request, $result)
    {
        return $this->inner->validAuthenticationResponse($request, $result);
    }

    /**
     * Restul metodelor (`channel()`, rezolvarea utilizatorului autentificat etc.)
     * merg neatinse la broadcaster-ul real: aici nu decorăm nimic, doar livrarea.
     *
     * @param  array<int, mixed>  $parameters
     */
    public function __call(string $method, array $parameters): mixed
    {
        return $this->inner->{$method}(...$parameters);
    }

    public function broadcast(array $channels, $event, array $payload = []): void
    {
        try {
            $this->inner->broadcast($channels, $event, $payload);
        } catch (Throwable $exception) {
            Log::warning('Broadcast eșuat — operațiunea continuă', [
                'event' => $event,
                'channels' => array_map(fn ($channel) => (string) $channel, $channels),
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
