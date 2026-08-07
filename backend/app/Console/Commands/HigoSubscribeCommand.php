<?php

namespace App\Console\Commands;

use App\Services\Higo\HigoClient;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Http\Client\RequestException;
use Throwable;

/**
 * Înregistrează la HIGO endpoint-ul nostru de notificări.
 *
 * Abonarea se creează cu status „CREATED”, apoi HIGO ne apelează endpoint-ul ca
 * handshake; abia dacă acel apel reușește devine „ACTIVE”. De aceea aplicația
 * trebuie să fie accesibilă public înainte de a rula comanda.
 */
#[Signature('higo:subscribe {--url= : URL-ul public al aplicației (implicit APP_URL)} {--criteria= : Encounter|DiagnosticReport|Media}')]
#[Description('Abonează platforma la notificările de examinare din HIGO.')]
class HigoSubscribeCommand extends Command
{
    public function handle(HigoClient $client): int
    {
        $secret = config('higo.exams.webhook_secret');
        $clientId = config('higo.exams.notify_client_id');
        $clientSecret = config('higo.exams.notify_client_secret');

        if (blank($secret) || blank($clientId) || blank($clientSecret)) {
            $this->error('Lipsesc din .env: HIGO_EXAM_WEBHOOK_SECRET, HIGO_NOTIFY_CLIENT_ID, HIGO_NOTIFY_CLIENT_SECRET.');
            $this->line('Generează-le cu: openssl rand -hex 24');

            return self::FAILURE;
        }

        $base = rtrim((string) ($this->option('url') ?: config('app.url')), '/');

        if (! str_starts_with($base, 'https://')) {
            $this->error('HIGO cere HTTPS. Folosește --url=https://... (local: un tunel).');

            return self::FAILURE;
        }

        // Ei cer endpoint-ul fără schemă: `<domeniu>/<cale>`.
        $endpoint = preg_replace('#^https://#', '', $base).'/api/v1/higo/exams/webhook/'.$secret;
        $criteria = (string) ($this->option('criteria') ?: config('higo.exams.subscription_criteria', 'DiagnosticReport'));

        $this->components->twoColumnDetail('Endpoint', $endpoint);
        $this->components->twoColumnDetail('Nivel notificări', $criteria);

        try {
            $response = $client->post('/api/fhir/NotificationSubscription', [
                'resourceType' => 'NotificationSubscription',
                'clientId' => $clientId,
                'clientSecret' => $clientSecret,
                'endpoint' => $endpoint,
                'criteria' => $criteria,
            ], ['operation' => 'higo.subscription.create']);
        } catch (RequestException $exception) {
            $this->components->twoColumnDetail('Abonare', '<fg=red>HTTP '.$exception->response->status().'</>');
            $this->newLine();
            $this->line($exception->response->body());

            return self::FAILURE;
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        // 201 = activă (handshake reușit); 200 = creată, dar nu ne-au putut apela.
        if ($response->status() === 201) {
            $this->components->twoColumnDetail('Abonare', '<fg=green>ACTIVĂ</>');

            return self::SUCCESS;
        }

        $this->components->twoColumnDetail('Abonare', '<fg=yellow>creată, dar neactivată</>');
        $this->warn('HIGO nu a putut apela endpoint-ul nostru. Verifică dacă e accesibil public și rulează comanda din nou.');
        $this->line($response->body());

        return self::FAILURE;
    }
}
