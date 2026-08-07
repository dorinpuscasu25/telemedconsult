<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HigoExamPayload;
use App\Services\Higo\HigoExamIngestor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HigoExamController extends Controller
{
    public function __construct(private readonly HigoExamIngestor $ingestor) {}

    /**
     * Endpoint-ul de notificare pe care îl înregistrăm la ei (`higo:subscribe`).
     *
     * HIGO se autentifică prin Basic auth cu perechea de credențiale pe care le-am
     * dat la abonare — nu cu tokenul nostru OAuth, care merge în sens invers.
     * Secretul din URL rămâne ca strat suplimentar.
     *
     * Notificarea nu conține măsurători, doar `diagnosticReportId`: examinarea
     * propriu-zisă se aduce din API imediat după.
     */
    public function store(Request $request, string $secret): JsonResponse
    {
        $expected = config('higo.exams.webhook_secret');

        if (! $expected || ! hash_equals((string) $expected, $secret)) {
            abort(404);
        }

        if (! $this->authenticated($request)) {
            abort(401);
        }

        $notification = $request->all();

        if ($notification === []) {
            return response()->json(['message' => 'Payload gol.'], 422);
        }

        // Prima notificare e handshake-ul care activează abonarea la ei: trebuie
        // să răspundem cu succes chiar dacă nu are ce examinare să aducă.
        $payload = $this->ingestor->ingestNotification($notification);

        return response()->json([
            'received' => true,
            'status' => $payload->status,
            'reference' => (string) $payload->id,
        ], $payload->status === HigoExamPayload::STATUS_MAPPED ? 201 : 202);
    }

    /**
     * Perechea pe care HIGO o folosește ca să ne apeleze. E separată de
     * credențialele cu care noi îi apelăm pe ei.
     */
    private function authenticated(Request $request): bool
    {
        $id = (string) config('higo.exams.notify_client_id');
        $secret = (string) config('higo.exams.notify_client_secret');

        if ($id === '' || $secret === '') {
            // Nu sunt configurate încă: secretul din URL rămâne singura pază.
            return true;
        }

        return hash_equals($id, (string) $request->getUser())
            && hash_equals($secret, (string) $request->getPassword());
    }
}
