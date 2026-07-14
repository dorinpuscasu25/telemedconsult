<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\IntegrationEvent;
use App\Models\MedicalDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function status(): JsonResponse
    {
        return response()->json([
            'external_access' => false,
            'message' => 'Integrările externe sunt pregătite ca structură, dar nu sunt active fără contracte, certificate și acces oficial.',
            'providers' => [
                ['key' => 'fhir', 'label' => 'HL7 FHIR export', 'status' => 'ready_internal'],
                ['key' => 'mconnect', 'label' => 'MConnect Moldova', 'status' => 'pending_credentials'],
                ['key' => 'msign', 'label' => 'MSign / CloudSign', 'status' => 'pending_credentials'],
                ['key' => 'cnam', 'label' => 'CNAM Moldova', 'status' => 'pending_credentials'],
                ['key' => 'cnas', 'label' => 'CNAS România', 'status' => 'pending_credentials'],
            ],
        ]);
    }

    public function events(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('admin'), 403);

        return response()->json([
            'data' => IntegrationEvent::latest()->limit(100)->get(),
        ]);
    }

    public function queueDocument(Request $request, MedicalDocument $medicalDocument): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('admin') || $user->hasRole('doctor'), 403);

        $event = IntegrationEvent::create([
            'user_id' => $user->id,
            'medical_document_id' => $medicalDocument->id,
            'provider' => $request->input('provider', 'mconnect'),
            'event_type' => 'document_transmission',
            'status' => 'queued',
            'request_payload' => [
                'document_id' => $medicalDocument->id,
                'fhir_payload' => $medicalDocument->fhir_payload,
            ],
        ]);

        return response()->json([
            'message' => 'Eveniment pregătit pentru integrare externă.',
            'event' => $event,
        ], 201);
    }
}
