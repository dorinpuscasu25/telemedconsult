<?php

namespace App\Console\Commands;

use App\Services\Higo\HigoClient;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\Client\RequestException;
use Throwable;

/**
 * Testul de fum al integrării: verifică pe rând configurarea, obținerea
 * tokenului OAuth și (opțional) un apel GET real, spunând exact la ce pas se
 * rupe. Nu creează și nu modifică nimic la ei.
 */
#[Signature('higo:ping {--path= : Endpoint GET de probă, ex. /api/fhir/Patient?_count=1} {--fresh : Ignoră tokenul din cache} {--out= : Salvează răspunsul complet în acest fișier}')]
#[Description('Verifică dacă putem vorbi cu HIGO: configurare, OAuth și, opțional, un apel de probă.')]
class HigoPingCommand extends Command
{
    public function handle(HigoClient $client): int
    {
        $this->line('');

        if (! $this->checkConfiguration()) {
            return self::FAILURE;
        }

        $token = $this->checkToken($client);

        if ($token === null) {
            return self::FAILURE;
        }

        $path = $this->option('path');

        if (! $path) {
            $this->line('');
            $this->info('Autentificarea funcționează. Pentru un apel real: php artisan higo:ping --path=/api/fhir/Patient?_count=1');

            return self::SUCCESS;
        }

        return $this->checkCall($client, (string) $path);
    }

    private function checkConfiguration(): bool
    {
        $required = [
            'HIGO_BASE_URL' => config('higo.base_url'),
            'HIGO_CLIENT_ID' => config('higo.client_id'),
            'HIGO_CLIENT_SECRET' => config('higo.client_secret'),
            'HIGO_USERNAME' => config('higo.username'),
            'HIGO_PASSWORD' => config('higo.password'),
        ];

        $missing = array_keys(array_filter($required, fn ($value) => blank($value)));

        if ($missing !== []) {
            $this->error('Lipsesc din .env: '.implode(', ', $missing));

            return false;
        }

        $this->components->twoColumnDetail('Configurare', '<fg=green>completă</>');
        $this->components->twoColumnDetail('Base URL', (string) config('higo.base_url'));
        $this->components->twoColumnDetail('Cache tokenuri', (string) config('higo.cache.store'));

        return true;
    }

    private function checkToken(HigoClient $client): ?string
    {
        $startedAt = microtime(true);

        try {
            $token = $client->accessToken(forceRefresh: (bool) $this->option('fresh'));
        } catch (Throwable $exception) {
            $this->components->twoColumnDetail('Token OAuth', '<fg=red>eșuat</>');
            $this->newLine();
            $this->error($exception->getMessage());
            $this->line('');
            $this->line('Cauze frecvente: credențiale greșite, `token_path` diferit de /oauth/token,');
            $this->line('sau lipsa tabelei `cache_locks` (rulează `php artisan migrate`).');

            return null;
        }

        $elapsed = round((microtime(true) - $startedAt) * 1000);

        // Nu tipărim niciodată tokenul; doar dovada că l-am primit.
        $this->components->twoColumnDetail('Token OAuth', "<fg=green>obținut</> ({$elapsed} ms, ".strlen($token).' caractere)');

        return $token;
    }

    private function checkCall(HigoClient $client, string $path): int
    {
        $startedAt = microtime(true);

        // Guzzle înlocuiește șirul de interogare din URL cu opțiunea `query`,
        // deci un `--path` cu `?...` ar pleca fără parametri: îi despărțim.
        [$endpoint, $queryString] = array_pad(explode('?', $path, 2), 2, '');
        parse_str($queryString, $query);

        try {
            $response = $client->get($endpoint, $query, ['operation' => 'higo.ping']);
        } catch (RequestException $exception) {
            // Mesajul excepției trunchiază corpul, iar tocmai acolo stă motivul
            // real (OperationOutcome, în cazul unui server FHIR).
            $this->components->twoColumnDetail('GET '.$path, '<fg=red>HTTP '.$exception->response->status().'</>');
            $this->newLine();
            $this->output($exception->response->body());

            return self::FAILURE;
        } catch (Throwable $exception) {
            $this->components->twoColumnDetail('GET '.$path, '<fg=red>eșuat</>');
            $this->newLine();
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $elapsed = round((microtime(true) - $startedAt) * 1000);
        $status = $response->status();
        $colour = $response->successful() ? 'green' : 'red';

        $this->components->twoColumnDetail('GET '.$path, "<fg={$colour}>HTTP {$status}</> ({$elapsed} ms)");
        $this->newLine();
        $this->output($response->body());

        return $response->successful() ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Afișează răspunsul și, dacă s-a cerut, îl salvează integral — util pentru
     * capturarea payload-urilor lor, care sunt prea lungi pentru terminal.
     */
    private function output(string $body): void
    {
        $file = $this->option('out');

        if ($file) {
            file_put_contents((string) $file, $this->prettify($body, PHP_INT_MAX));
            $this->components->twoColumnDetail('Salvat în', (string) $file);

            return;
        }

        $this->line($this->prettify($body));
    }

    /**
     * JSON-ul lor citibil, tăiat la o lungime rezonabilă pentru terminal.
     */
    private function prettify(string $body, int $limit = 4000): string
    {
        $decoded = json_decode($body, true);

        if (is_array($decoded)) {
            $body = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: $body;
        }

        return mb_substr($body, 0, $limit);
    }
}
