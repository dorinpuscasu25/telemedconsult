<?php

namespace App\Http\Controllers\Api;

use App\Events\ConversationMessageSent;
use App\Events\ConversationUpdated;
use App\Http\Controllers\Controller;
use App\Jobs\SyncHigoEntity;
use App\Models\Consultation;
use App\Models\ConsultationObjectiveData;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\DoctorInvestigationRequirement;
use App\Models\HigoExamMedia;
use App\Models\MedicalDocument;
use App\Models\Message;
use App\Models\PatientProfile;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\AppEventNotification;
use App\Services\ConsultationCostEstimator;
use App\Services\ConsultationStateMachine;
use App\Services\FeatureFlags;
use App\Services\FinancialBreakdown;
use App\Services\ObjectiveDataSchema;
use App\Services\OperatorAssignmentService;
use App\Services\PlatformConfig;
use App\Services\WalletLedger;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;

class WorkflowController extends Controller
{
    private const ACCEPTANCE_WINDOW_MINUTES = 15;

    private function acceptanceWindowMinutes(): int
    {
        return (int) app(PlatformConfig::class)->number('assignment.acceptance_window_minutes', self::ACCEPTANCE_WINDOW_MINUTES);
    }

    public function requests(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');

        $this->expireStaleRequests();

        $requests = ConsultationRequest::with(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])
            ->when($user->hasRole('patient') && ! $user->hasRole('admin'), fn ($query) => $query->where('patient_id', $user->id))
            ->when($user->hasRole('doctor') && ! $user->hasRole('admin'), fn ($query) => $query->where(function ($q) use ($user) {
                $q->where('type', 'doctor')->orWhere('doctor_id', $user->id);
            }))
            // Operatorul își vede examinările atribuite indiferent de tipul
            // solicitării: la o consultație cu examinare, `type` e „doctor”, dar
            // deplasarea la domiciliu e tot a lui. Plus solicitările de operator
            // încă neatribuite, care rămân disponibile pentru preluare.
            ->when($user->hasRole('operator') && ! $user->hasRole('admin'), fn ($query) => $query->where(function ($q) use ($user) {
                $q->where('operator_id', $user->id)
                    ->orWhere(fn ($pool) => $pool->where('type', 'operator')->whereNull('operator_id'));
            }))
            ->latest()
            ->get()
            ->map(fn (ConsultationRequest $item) => $this->serializeRequest($item));

        return response()->json(['data' => $requests]);
    }

    /**
     * Pre-payment preview (spec §6 ordering, UI3): resolves the auto-assigned
     * operator + the itemized cost so the patient confirms with the real total.
     * Returns eligibility diagnostics instead of aborting, so the UI can guide.
     */
    public function previewRequest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'consultation_kind' => ['nullable', Rule::in(['with_exam', 'video', 'preliminary'])],
            'patient_profile_id' => ['required', 'integer', 'exists:patient_profiles,id'],
            'doctor_id' => ['nullable', 'exists:users,id'],
            'selected_services' => ['nullable', 'array'],
        ]);

        $patientProfile = $this->resolvePatientProfile($request, (int) $validated['patient_profile_id']);
        $kind = $validated['consultation_kind'] ?? 'with_exam';
        $features = app(FeatureFlags::class);

        if (! empty($validated['doctor_id']) || $kind !== 'with_exam') {
            abort_unless($features->enabled('doctors'), 403, 'Catalogul medicilor este momentan dezactivat.');
        }

        if ($kind === 'with_exam') {
            abort_unless($features->enabled('with_exam_consultations'), 403, 'Consultațiile cu examinare sunt momentan dezactivate.');
            abort_unless($features->enabled('operators'), 403, 'Operatorii sunt momentan dezactivați.');
        } else {
            abort_unless($features->enabled('video_consultations'), 403, 'Consultațiile video sunt momentan dezactivate.');
        }

        if ($kind !== 'with_exam') {
            $doctor = ! empty($validated['doctor_id']) ? User::with('doctorProfile')->find($validated['doctor_id']) : null;
            $base = (int) ($doctor?->doctorProfile?->video_price ?? app(PlatformConfig::class)->number('video.default_price', 300));

            return response()->json([
                'eligible' => true,
                'consultation_kind' => $kind,
                'cost' => ['doctor_base' => $base, 'investigations' => [], 'investigations_total' => 0, 'travel_fee' => 0, 'total' => $base],
            ]);
        }

        if (! $patientProfile->hasCompleteAddress()) {
            return response()->json([
                'eligible' => false,
                'reason' => 'address_incomplete',
                'message' => 'Completează adresa profilului (raion, localitate și stradă) pentru o consultație cu examinare.',
            ]);
        }

        $doctor = ! empty($validated['doctor_id']) ? User::with('doctorProfile')->find($validated['doctor_id']) : null;
        $requiredIds = $this->doctorRequiredInvestigationIds($validated['doctor_id'] ?? null);
        $service = app(OperatorAssignmentService::class);
        $operatorId = $service->pickOperatorId($patientProfile, $requiredIds);

        if ($operatorId === null) {
            $availability = $service->availability($patientProfile, $requiredIds);

            return response()->json([
                'eligible' => false,
                'reason' => $availability['covered'] ? 'no_capability' : 'no_coverage',
                'message' => $availability['covered']
                    ? 'Operatorii din regiunea ta nu pot efectua toate investigațiile cerute de acest medic. Alege alt medic sau o consultație video.'
                    : 'Momentan nu avem operator în regiunea ta. Te anunțăm când apare unul disponibil.',
            ]);
        }

        $operator = User::find($operatorId);
        $cost = app(ConsultationCostEstimator::class)->estimate($doctor, $patientProfile, $operatorId, $validated['selected_services'] ?? []);

        return response()->json([
            'eligible' => true,
            'consultation_kind' => 'with_exam',
            'operator' => [
                'id' => (string) $operatorId,
                'name' => $operator?->name,
                'region' => $operator?->operatorProfile?->region,
            ],
            'cost' => $cost,
        ]);
    }

    public function storeRequest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['doctor', 'operator', 'video'])],
            'consultation_kind' => ['nullable', Rule::in(['with_exam', 'video', 'preliminary'])],
            'patient_profile_id' => ['required', 'integer', 'exists:patient_profiles,id'],
            'doctor_id' => ['nullable', 'exists:users,id'],
            'operator_id' => ['nullable', 'exists:users,id'],
            'specialty_id' => ['nullable', 'exists:specialties,id'],
            'symptoms' => ['required', 'string', 'max:2000'],
            'selected_services' => ['nullable', 'array'],
            'scheduled_at' => ['nullable', 'date'],
            'points_percent' => ['nullable', 'integer', 'min:0', 'max:100'],
        ], [
            'patient_profile_id.required' => 'Alege un profil de pacient înainte de confirmare.',
            'patient_profile_id.exists' => 'Profilul de pacient selectat nu există.',
        ]);

        $patientProfile = $this->resolvePatientProfile($request, (int) $validated['patient_profile_id']);
        abort_if(
            ConsultationRequest::where('patient_id', $request->user()->id)
                ->where('status', 'completed')
                ->whereNull('closed_at')
                ->exists(),
            422,
            'Ai consultații finalizate care așteaptă rating. Completează ratingul înainte de o solicitare nouă.'
        );

        $validated['consultation_kind'] ??= $validated['type'] === 'video' ? 'video' : 'with_exam';

        $features = app(FeatureFlags::class);

        if (! empty($validated['doctor_id']) || in_array($validated['type'], ['doctor', 'video'], true)) {
            abort_unless($features->enabled('doctors'), 403, 'Catalogul medicilor este momentan dezactivat.');
        }

        if ($validated['consultation_kind'] === 'with_exam') {
            abort_unless($features->enabled('with_exam_consultations'), 403, 'Consultațiile cu examinare sunt momentan dezactivate.');
            abort_unless($features->enabled('operators'), 403, 'Operatorii sunt momentan dezactivați.');
            $this->ensureWithExamAddress($patientProfile);
            // Operator is assigned automatically — never picked manually.
            $validated['operator_id'] = $this->assignOperatorOrFail($patientProfile, $validated['doctor_id'] ?? null);
        } else {
            abort_unless($features->enabled('video_consultations'), 403, 'Consultațiile video sunt momentan dezactivate.');
            $validated['operator_id'] = null;
        }

        if (! empty($validated['scheduled_at'])) {
            $this->ensureSchedulable($validated);
        }

        $item = DB::transaction(function () use ($request, $validated, $patientProfile) {
            $costBreakdown = null;

            if ($validated['consultation_kind'] === 'with_exam') {
                $costBreakdown = app(ConsultationCostEstimator::class)->estimate(
                    ! empty($validated['doctor_id']) ? User::with('doctorProfile')->find($validated['doctor_id']) : null,
                    $patientProfile,
                    $validated['operator_id'] ?? null,
                    $validated['selected_services'] ?? [],
                );
                $price = $costBreakdown['total'];
            } else {
                $price = $this->priceForRequest($validated);
            }

            $provider = $this->providerForPricing($validated) ?? $request->user();
            $pricing = app(FinancialBreakdown::class)->forProvider($price * 100, $provider);

            $maxPointsPercent = (int) min(100, max(0, app(PlatformConfig::class)->number('wallet.max_points_payment_percent', 30)));
            $requestedPointsPercent = (int) ($validated['points_percent'] ?? 0);
            $doctorAcceptsPoints = (bool) ($provider->doctorProfile?->accepts_points ?? false);
            $pointsPercent = $doctorAcceptsPoints ? min($requestedPointsPercent, $maxPointsPercent) : 0;
            $totalMinor = (int) $pricing['amount_minor'];
            $pointsAmountMinor = (int) floor($totalMinor * $pointsPercent / 100);
            $realAmountMinor = $totalMinor - $pointsAmountMinor;

            if ($costBreakdown !== null) {
                $pricing = [...$pricing, 'cost_breakdown' => $costBreakdown];
            }

            $item = ConsultationRequest::create([
                'patient_id' => $request->user()->id,
                'patient_profile_id' => $patientProfile->id,
                'doctor_id' => $validated['doctor_id'] ?? null,
                'operator_id' => $validated['operator_id'] ?? null,
                'specialty_id' => $validated['specialty_id'] ?? null,
                'type' => $validated['type'],
                'consultation_kind' => $validated['consultation_kind'],
                'status' => 'new',
                'symptoms' => $validated['symptoms'],
                'selected_services' => $validated['selected_services'] ?? [],
                'scheduled_at' => $validated['scheduled_at'] ?? null,
                'amount_minor' => $pricing['amount_minor'],
                'real_amount_minor' => $realAmountMinor,
                'points_amount_minor' => $pointsAmountMinor,
                'points_percent' => $pointsPercent,
                'platform_fee_minor' => $pricing['platform_fee_minor'],
                'provider_amount_minor' => $pricing['provider_amount_minor'],
                'pricing_snapshot' => $pricing,
                'payment_status' => $pricing['amount_minor'] > 0 ? 'held' : 'none',
                'acceptance_expires_at' => now()->addMinutes($this->acceptanceWindowMinutes()),
            ]);

            $this->reservePatientWallet($request->user(), $item);

            $conversation = Conversation::create([
                'consultation_request_id' => $item->id,
                'patient_id' => $item->patient_id,
                'patient_profile_id' => $patientProfile->id,
                'doctor_id' => $item->doctor_id,
                'operator_id' => $item->operator_id,
                'status' => in_array($item->consultation_kind, ['video', 'preliminary'], true) ? 'open' : 'pending',
            ]);

            $message = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id' => $request->user()->id,
                'body' => $validated['symptoms'],
            ]);

            ConversationMessageSent::dispatch($conversation, $message->load('sender'));
            ConversationUpdated::dispatch($conversation->load(['patient', 'doctor', 'operator', 'messages.sender']));
            $this->notifyRequestCreated($item);
            $this->linkPatientToAssignedOperator($item);

            return $item;
        });

        return response()->json([
            'message' => 'Solicitare creată.',
            'request' => $this->serializeRequest($item->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
            'conversation' => Conversation::with(['patient', 'doctor', 'operator', 'messages.sender'])
                ->where('consultation_request_id', $item->id)
                ->first(),
        ], 201);
    }

    public function accept(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');

        abort_unless($user->hasRole('doctor') || $user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless(in_array($consultationRequest->status, ['new', 'rescheduled'], true), 422, 'Solicitarea nu mai poate fi acceptată.');

        if ($consultationRequest->acceptance_expires_at?->isPast()) {
            $this->refundHeldFunds($consultationRequest, 'Solicitare expirată: prestatorul nu a răspuns în timp util.');
            $consultationRequest->forceFill([
                'status' => 'expired',
                'cancelled_at' => now(),
                'cancellation_reason' => 'Prestatorul nu a răspuns în intervalul disponibil.',
            ])->save();

            return response()->json([
                'message' => 'Solicitarea a expirat și banii au fost returnați.',
                'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'specialty'])),
            ], 422);
        }

        $payload = [];

        if ($user->hasRole('doctor')) {
            $payload['doctor_id'] = $user->id;
        }

        if ($user->hasRole('operator')) {
            $payload['operator_id'] = $user->id;
            $payload['operator_accepted_at'] = now();
        }

        $consultationRequest->forceFill([
            ...$payload,
            'status' => 'accepted',
            'accepted_at' => now(),
        ])->save();

        $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
        if ($conversation) {
            // Doar participanții, nu și `operator_accepted_at`: conversația nu are
            // acea coloană, iar scrierea ei făcea ca orice acceptare de operator
            // să eșueze cu eroare de bază de date.
            $conversation->forceFill(Arr::only($payload, ['doctor_id', 'operator_id']))->save();
            ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
        }

        $consultationRequest->patient?->notify(new AppEventNotification(
            'Solicitare acceptată',
            $user->name.' a acceptat solicitarea ta.',
            '/patient/chat',
            'success',
        ));

        return response()->json([
            'message' => 'Solicitare acceptată.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    public function complete(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('doctor') || $user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless(in_array($consultationRequest->status, ['new', 'accepted'], true), 422, 'Solicitarea nu mai poate fi finalizată.');

        // FSM1 (spec §10): o consultație cu examinare ajunge la concluzie doar cu
        // datele obiective ȘI anamneza complete.
        //
        // Poarta protejează concluzia medicului — nu vrem un diagnostic pus pe
        // gol. Când nu există medic asignat (vizită doar cu operator), nu are ce
        // proteja, așa că operatorul își poate încheia deplasarea fără ea.
        abort_unless(
            ! $consultationRequest->doctor_id
                || app(ConsultationStateMachine::class)->readyForDoctor($consultationRequest),
            422,
            'Operatorul nu a finalizat încă examinarea la domiciliu.',
        );

        $validated = $request->validate([
            'diagnosis' => ['required', 'string', 'max:4000'],
            'treatment_plan' => ['nullable', 'string', 'max:4000'],
            'recommendations' => ['nullable', 'string', 'max:4000'],
            'prescription_notes' => ['nullable', 'string', 'max:4000'],
            'current_illness_history' => ['nullable', 'string', 'max:4000'],
        ]);

        $provider = $consultationRequest->doctor_id
            ? User::findOrFail($consultationRequest->doctor_id)
            : ($consultationRequest->operator_id ? User::findOrFail($consultationRequest->operator_id) : $user);

        abort_unless($user->hasRole('admin') || (int) $user->id === (int) $provider->id, 403, 'Nu puteți finaliza această solicitare.');

        $consultation = DB::transaction(function () use ($consultationRequest, $provider, $validated) {
            $doctorId = $provider->id;
            $chat = $this->chatWindows();
            $responseStartedAt = $consultationRequest->objective_data_completed_at
                ?? $consultationRequest->anamnesis_completed_at
                ?? $consultationRequest->accepted_at
                ?? $consultationRequest->created_at;

            $consultationRequest->forceFill([
                'doctor_id' => $doctorId,
                'operator_id' => $provider->hasRole('operator') ? $provider->id : $consultationRequest->operator_id,
                'status' => 'completed',
                'completed_at' => now(),
                'conclusion_sent_at' => now(),
                'doctor_response_minutes' => $responseStartedAt ? $responseStartedAt->diffInMinutes(now()) : null,
                'free_chat_until' => now()->addDays($chat['free_days']),
                'chat_expires_at' => now()->addDays($chat['total_days']),
                'rating_required_after' => now(),
            ])->save();

            $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
            if ($conversation) {
                $conversation->forceFill([
                    'doctor_id' => $doctorId,
                    'operator_id' => $provider->hasRole('operator') ? $provider->id : $consultationRequest->operator_id,
                    'status' => 'open',
                    'starts_at' => now(),
                    'free_until' => $consultationRequest->free_chat_until,
                    'hard_closes_at' => $consultationRequest->chat_expires_at,
                ])->save();
            }

            $objectiveData = $consultationRequest->objectiveData()->latest()->get()->pluck('payload')->all();

            $consultation = Consultation::create([
                'consultation_request_id' => $consultationRequest->id,
                'patient_id' => $consultationRequest->patient_id,
                'patient_profile_id' => $consultationRequest->patient_profile_id,
                'doctor_id' => $doctorId,
                'status' => 'completed',
                'current_illness_history' => $validated['current_illness_history'] ?? $consultationRequest->symptoms,
                'objective_data_snapshot' => $objectiveData,
                'diagnosis' => $validated['diagnosis'],
                'treatment_plan' => $validated['treatment_plan'] ?? null,
                'recommendations' => $validated['recommendations'] ?? null,
                'prescription_notes' => $validated['prescription_notes'] ?? null,
                'price' => $consultationRequest->amount_minor / 100,
                'completed_at' => now(),
            ]);

            $this->captureHeldFunds($consultationRequest, $provider, $consultation->id);

            $fhir = $doctorId ? $this->buildFhirEncounter($consultation->load(['patient', 'doctor'])) : null;
            $consultation->forceFill(['fhir_payload' => $fhir])->save();

            MedicalDocument::create([
                'consultation_id' => $consultation->id,
                'patient_id' => $consultation->patient_id,
                'patient_profile_id' => $consultation->patient_profile_id,
                'consultation_request_id' => $consultationRequest->id,
                'doctor_id' => $doctorId,
                'type' => 'consultation_summary',
                'title' => 'Sumar consultație #'.$consultation->id,
                'status' => 'ready_for_signature',
                'signature_provider' => 'm-sign',
                'fhir_payload' => $fhir,
            ]);

            if (isset($conversation)) {
                ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
            }

            $consultationRequest->patient?->notify(new AppEventNotification(
                'Consultație finalizată',
                'Consultația a fost finalizată. Poți lăsa o recenzie din panoul pacient.',
                '/patient',
                'success',
            ));

            return $consultation;
        });

        return response()->json([
            'message' => 'Consultație finalizată.',
            'consultation' => $consultation,
        ]);
    }

    public function forwardToDoctor(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('operator') || $user->hasRole('admin'), 403);

        $validated = $request->validate([
            'doctor_id' => ['required', 'exists:users,id'],
            'triage_notes' => ['nullable', 'string', 'max:4000'],
        ]);

        if ($consultationRequest->scheduled_at) {
            $this->ensureSchedulable([
                'type' => 'doctor',
                'doctor_id' => $validated['doctor_id'],
                'scheduled_at' => $consultationRequest->scheduled_at,
            ], $consultationRequest->id);
        }

        $consultationRequest->forceFill([
            'doctor_id' => $validated['doctor_id'],
            'operator_id' => $consultationRequest->operator_id ?: $user->id,
            'triage_notes' => $validated['triage_notes'] ?? $consultationRequest->triage_notes,
            'status' => 'accepted',
            'accepted_at' => $consultationRequest->accepted_at ?: now(),
            'chat_expires_at' => $consultationRequest->chat_expires_at ?: now()->addHours(self::CHAT_DURATION_HOURS),
        ])->save();

        $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
        if ($conversation) {
            $conversation->forceFill([
                'doctor_id' => $validated['doctor_id'],
                'operator_id' => $consultationRequest->operator_id,
            ])->save();
        }

        if (! empty($validated['triage_notes'])) {
            if ($conversation) {
                $message = Message::create([
                    'conversation_id' => $conversation->id,
                    'sender_id' => $user->id,
                    'body' => "Date examinare operator:\n".$validated['triage_notes'],
                ]);
                ConversationMessageSent::dispatch($conversation, $message->load('sender'));
            }
        }

        if ($conversation) {
            ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
        }

        return response()->json([
            'message' => 'Datele au fost transmise medicului.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    public function completeAnamnesis(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        abort_unless((int) $request->user()->id === (int) $consultationRequest->patient_id, 403);

        $validated = $request->validate([
            'symptoms' => ['required', 'string', 'max:4000'],
        ]);

        $consultationRequest->forceFill([
            'symptoms' => $validated['symptoms'],
            'anamnesis_completed_at' => now(),
        ])->save();

        $consultationRequest->doctor?->notify(new AppEventNotification(
            'Anamneză finalizată',
            'Pacientul a finalizat istoricul bolii și acuzele.',
            '/doctor/consultations',
        ));
        $this->notifyDoctorReady($consultationRequest);

        return response()->json([
            'message' => 'Anamneza a fost salvată.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    public function storeObjectiveData(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless($consultationRequest->patient_profile_id, 422, 'Solicitarea nu are profil de pacient asociat.');

        // Cheile din vocabularul canonic sunt validate (interval fiziologic);
        // orice altă cheie trece nevalidată, ca payload-urile din aparat să nu
        // fie respinse doar pentru că trimit un câmp pe care nu-l știm încă.
        $validated = $request->validate([
            'source' => ['nullable', 'string', 'max:100'],
            'payload' => ['required', 'array'],
            ...ObjectiveDataSchema::validationRules(),
        ], ObjectiveDataSchema::validationMessages());

        // Atenție: `validated()` întoarce doar cheile care au reguli, deci ar
        // arunca exact câmpurile necunoscute pe care vrem să le păstrăm. Luăm
        // payload-ul brut din input — validarea de mai sus și-a făcut deja treaba
        // pe cheile cunoscute.
        $payload = collect((array) $request->input('payload', []))
            ->reject(fn ($value) => $value === null || $value === '' || is_array($value))
            ->all();

        abort_if($payload === [], 422, 'Completează cel puțin o măsurătoare sau o observație.');

        $data = ConsultationObjectiveData::create([
            'consultation_request_id' => $consultationRequest->id,
            'patient_profile_id' => $consultationRequest->patient_profile_id,
            'operator_id' => $user->id,
            'source' => $validated['source'] ?? 'manual',
            'payload' => $payload,
            'completed_at' => now(),
        ]);

        $consultationRequest->forceFill([
            'objective_data_completed_at' => now(),
        ])->save();

        $consultationRequest->doctor?->notify(new AppEventNotification(
            'Date obiective încărcate',
            'Operatorul a încărcat datele obiective pentru consultație.',
            '/doctor/consultations',
        ));
        $this->notifyDoctorReady($consultationRequest);

        return response()->json([
            'message' => 'Date obiective salvate.',
            'objective_data' => $data,
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ], 201);
    }

    /**
     * Operatorul declară că a terminat examinarea la domiciliu.
     *
     * Măsurătorile se introduc în aparatul HIGO și ajung la noi separat, prin
     * `higo:pull` sau prin notificarea lor — deci formularul din dashboard e
     * opțional, o alternativă pentru ce aparatul nu acoperă. Fără acțiunea asta,
     * operatorul ar fi obligat să retasteze manual date pe care le-a măsurat deja.
     *
     * Poarta care cere date obiective rămâne intactă: ea protejează concluzia
     * medicului, iar aici tocmai o satisfacem în mod explicit.
     */
    public function completeExamination(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless(
            (int) $consultationRequest->operator_id === (int) $user->id || $user->hasRole('admin'),
            403,
            'Această examinare nu îți este atribuită.',
        );

        if (! $consultationRequest->objective_data_completed_at) {
            $consultationRequest->forceFill(['objective_data_completed_at' => now()])->save();

            $consultationRequest->doctor?->notify(new AppEventNotification(
                'Examinare finalizată',
                'Operatorul a finalizat examinarea la domiciliu. Datele din aparat apar pe măsură ce sunt sincronizate.',
                '/doctor/consultations',
            ));

            $this->notifyDoctorReady($consultationRequest);
        }

        return response()->json([
            'message' => 'Examinare finalizată. Datele din aparat se atașează automat când sosesc.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    /**
     * Medicul pornește consultația după ce operatorul a terminat examinarea.
     *
     * E momentul în care se deschide chatul cu pacientul. Acțiunea e explicită,
     * nu automată: medicul decide când se apucă de caz, iar pacientul vede clar
     * că a început.
     */
    public function startConsultation(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('doctor') || $user->hasRole('admin'), 403);
        abort_unless(
            ! $consultationRequest->doctor_id
                || (int) $consultationRequest->doctor_id === (int) $user->id
                || $user->hasRole('admin'),
            403,
            'Această consultație nu îți este atribuită.',
        );
        abort_if($consultationRequest->conclusion_sent_at, 422, 'Consultația a fost deja concluzionată.');
        abort_unless(
            app(ConsultationStateMachine::class)->readyForDoctor($consultationRequest),
            422,
            'Operatorul nu a finalizat încă examinarea la domiciliu.',
        );

        if (! $consultationRequest->doctor_started_at) {
            $consultationRequest->forceFill([
                'doctor_id' => $consultationRequest->doctor_id ?: $user->id,
                'doctor_started_at' => now(),
            ])->save();

            $this->activateDoctorChat($consultationRequest);

            $consultationRequest->patient?->notify(new AppEventNotification(
                'Consultația a început',
                ($consultationRequest->doctor?->name ?? 'Medicul').' a preluat rezultatele examinării. Poți discuta acum în chat.',
                '/patient/chat',
                'success',
            ));
        }

        return response()->json([
            'message' => 'Consultație pornită. Chatul cu pacientul este deschis.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    public function addOnService(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless((int) $consultationRequest->operator_id === (int) $user->id || $user->hasRole('admin'), 403);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
        ]);

        $amountMinor = (int) round(((float) $validated['amount']) * 100);
        DB::transaction(function () use ($consultationRequest, $user, $validated, $amountMinor) {
            $patientWallet = Wallet::where('user_id', $consultationRequest->patient_id)->where('type', 'real')->lockForUpdate()->first()
                ?? Wallet::create(['user_id' => $consultationRequest->patient_id, 'type' => 'real', 'balance_minor' => 0, 'currency' => 'MDL']);
            $operatorWallet = Wallet::firstOrCreate(
                ['user_id' => $user->id, 'type' => 'real'],
                ['balance_minor' => 0, 'currency' => 'MDL'],
            );
            $pricing = app(FinancialBreakdown::class)->forProvider($amountMinor, $user);

            abort_if($patientWallet->balance_minor < $amountMinor, 422, 'Balanță insuficientă pentru serviciul suplimentar.');
            $patientWallet->decrement('balance_minor', $amountMinor);
            $operatorWallet->increment('balance_minor', $pricing['provider_amount_minor']);

            WalletTransaction::create([
                'wallet_id' => $patientWallet->id,
                'user_id' => $consultationRequest->patient_id,
                'amount_minor' => -$amountMinor,
                'currency' => $patientWallet->currency,
                'type' => 'operator_add_on',
                'status' => 'completed',
                'description' => 'Serviciu suplimentar operator: '.$validated['name'],
                'metadata' => ['service' => $validated['name']],
                'rate_snapshot' => $pricing['rate_snapshot'],
                'consultation_request_id' => $consultationRequest->id,
            ]);

            WalletTransaction::create([
                'wallet_id' => $operatorWallet->id,
                'user_id' => $user->id,
                'amount_minor' => $pricing['provider_amount_minor'],
                'currency' => $operatorWallet->currency,
                'type' => 'operator_add_on_income',
                'status' => 'completed',
                'description' => 'Venit serviciu suplimentar: '.$validated['name'],
                'metadata' => ['gross_amount_minor' => $amountMinor, 'platform_fee_minor' => $pricing['platform_fee_minor']],
                'rate_snapshot' => $pricing['rate_snapshot'],
                'consultation_request_id' => $consultationRequest->id,
            ]);
        });

        return response()->json(['message' => 'Serviciul suplimentar a fost plătit.']);
    }

    public function storeMeetLink(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('doctor') || $user->hasRole('admin'), 403);
        abort_unless((int) $consultationRequest->doctor_id === (int) $user->id || $user->hasRole('admin'), 403);

        $validated = $request->validate([
            'meet_link' => ['required', 'url', 'max:500'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $conversation = Conversation::firstOrCreate(
            ['consultation_request_id' => $consultationRequest->id],
            [
                'patient_id' => $consultationRequest->patient_id,
                'patient_profile_id' => $consultationRequest->patient_profile_id,
                'doctor_id' => $consultationRequest->doctor_id,
                'operator_id' => $consultationRequest->operator_id,
                'status' => 'open',
            ],
        );

        $metadata = $consultationRequest->selected_services ?? [];
        $metadata['google_meet'] = [
            'link' => $validated['meet_link'],
            'scheduled_at' => $validated['scheduled_at'] ?? null,
            'added_at' => now()->toISOString(),
        ];

        $consultationRequest->forceFill([
            'selected_services' => $metadata,
            'scheduled_at' => $validated['scheduled_at'] ?? $consultationRequest->scheduled_at,
        ])->save();

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $user->id,
            'type' => 'system',
            'body' => 'Link Google Meet: '.$validated['meet_link'],
            'metadata' => ['meet_link' => $validated['meet_link'], 'scheduled_at' => $validated['scheduled_at'] ?? null],
        ]);

        ConversationMessageSent::dispatch($conversation, $message->load('sender'));
        ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'consultationRequest', 'messages.sender']));

        return response()->json([
            'message' => 'Link video adăugat.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    public function requestAdditionalInvestigation(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('doctor') || $user->hasRole('admin'), 403);
        abort_unless((int) $consultationRequest->doctor_id === (int) $user->id || $user->hasRole('admin'), 403);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $conversation = Conversation::firstOrCreate(
            ['consultation_request_id' => $consultationRequest->id],
            [
                'patient_id' => $consultationRequest->patient_id,
                'patient_profile_id' => $consultationRequest->patient_profile_id,
                'doctor_id' => $consultationRequest->doctor_id,
                'operator_id' => $consultationRequest->operator_id,
                'status' => 'open',
            ],
        );

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $user->id,
            'type' => 'system',
            'body' => "Investigație suplimentară solicitată: {$validated['title']}".(! empty($validated['notes']) ? "\n".$validated['notes'] : ''),
            'metadata' => ['additional_investigation' => $validated],
        ]);

        $consultationRequest->patient?->notify(new AppEventNotification(
            'Investigație suplimentară',
            'Medicul a solicitat: '.$validated['title'],
            '/patient/chat',
            'warning',
        ));

        // NT6 — the operator must return to perform the additional investigation.
        $operator = $consultationRequest->operator ?? ($consultationRequest->operator_id ? User::find($consultationRequest->operator_id) : null);
        $operator?->notify(new AppEventNotification(
            'Investigație suplimentară cerută',
            'Medicul a cerut o investigație suplimentară: '.$validated['title'].'. Revino la pacient pentru a o efectua.',
            '/operator/patients',
            'warning',
        ));

        ConversationMessageSent::dispatch($conversation, $message->load('sender'));
        ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'consultationRequest', 'messages.sender']));

        return response()->json(['message' => 'Investigația suplimentară a fost solicitată.']);
    }

    public function reactivateChat(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        abort_unless((int) $request->user()->id === (int) $consultationRequest->patient_id, 403);
        abort_unless($consultationRequest->chat_expires_at && $consultationRequest->chat_expires_at->isFuture(), 422, 'Fereastra de 14 zile pentru chat s-a închis.');

        $config = app(PlatformConfig::class);
        $priceMinor = (int) round($config->number('chat.reactivation_price', 50) * 100);
        $hours = (int) $config->number('chat.reactivation_hours', 24);
        $until = now()->addHours($hours);

        DB::transaction(function () use ($request, $consultationRequest, $priceMinor, $until, $config) {
            $wallet = Wallet::where('user_id', $request->user()->id)->where('type', 'real')->lockForUpdate()->first()
                ?? Wallet::create(['user_id' => $request->user()->id, 'balance_minor' => 0, 'currency' => 'MDL']);
            abort_if($wallet->balance_minor < $priceMinor, 422, 'Balanță insuficientă pentru reactivarea chat-ului.');

            $wallet->decrement('balance_minor', $priceMinor);

            WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'user_id' => $request->user()->id,
                'amount_minor' => -$priceMinor,
                'currency' => $wallet->currency,
                'type' => 'chat_reactivation',
                'status' => 'completed',
                'description' => 'Reactivare chat consultație',
                'metadata' => ['active_until' => $until],
                'rate_snapshot' => $config->snapshot(['chat.reactivation_price', 'chat.reactivation_hours', 'chat.total_days']),
                'consultation_request_id' => $consultationRequest->id,
            ]);

            $consultationRequest->forceFill(['chat_reactivated_until' => $until])->save();
            Conversation::where('consultation_request_id', $consultationRequest->id)->update([
                'status' => 'open',
                'reactivated_until' => $until,
            ]);
        });

        return response()->json([
            'message' => 'Chat reactivat.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
        ]);
    }

    public function conversations(Request $request): JsonResponse
    {
        $user = $request->user();

        $conversations = Conversation::with(['patient', 'patientProfile', 'doctor', 'operator', 'consultationRequest', 'messages.sender'])
            ->where(function ($query) use ($user) {
                $query->where('patient_id', $user->id)
                    ->orWhere('doctor_id', $user->id)
                    ->orWhere('operator_id', $user->id);
            })
            ->latest()
            ->get()
            ->map(fn (Conversation $conversation) => tap($conversation, function (Conversation $item) use ($user) {
                $item->setAttribute('chat', $this->chatState($item, $user));
            }));

        return response()->json(['data' => $conversations]);
    }

    public function sendMessage(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();

        abort_unless(in_array($user->id, array_filter([$conversation->patient_id, $conversation->doctor_id, $conversation->operator_id]), true), 403);
        abort_unless($conversation->status === 'open' || $conversation->consultation_request_id, 422, 'Această conversație nu este activă încă.');

        $consultationRequest = $conversation->consultation_request_id
            ? ConsultationRequest::find($conversation->consultation_request_id)
            : null;

        if ($consultationRequest && ! $this->canWriteChat($consultationRequest)) {
            // Un chat care încă nu s-a deschis NU trebuie marcat închis: e în
            // așteptarea examinării. Doar unul care a fost activ și i-a expirat
            // fereastra se închide efectiv.
            if ($consultationRequest->conclusion_sent_at) {
                $conversation->forceFill(['status' => 'closed'])->save();
                ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));

                abort(422, 'Chatul s-a închis. Îl poți reactiva din consultație cât timp fereastra este deschisă.');
            }

            abort(422, $consultationRequest->objective_data_completed_at
                ? 'Chatul se deschide după ce medicul pornește consultația.'
                : 'Chatul se deschide după ce operatorul efectuează examinarea la domiciliu.');
        }

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:4000'],
        ]);

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $user->id,
            'body' => $validated['body'],
        ]);

        ConversationMessageSent::dispatch($conversation, $message->load('sender'));
        ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));

        return response()->json([
            'message' => $message->load('sender'),
        ], 201);
    }

    public function sendAttachment(Request $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();

        abort_unless(in_array($user->id, array_filter([$conversation->patient_id, $conversation->doctor_id, $conversation->operator_id]), true), 403);
        abort_unless($conversation->status === 'open' || $conversation->consultation_request_id, 422, 'Această conversație nu este activă încă.');

        $consultationRequest = $conversation->consultation_request_id
            ? ConsultationRequest::find($conversation->consultation_request_id)
            : null;

        if ($consultationRequest && ! $this->canWriteChat($consultationRequest)) {
            // Un chat care încă nu s-a deschis NU trebuie marcat închis: e în
            // așteptarea examinării. Doar unul care a fost activ și i-a expirat
            // fereastra se închide efectiv.
            if ($consultationRequest->conclusion_sent_at) {
                $conversation->forceFill(['status' => 'closed'])->save();
                ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));

                abort(422, 'Chatul s-a închis. Îl poți reactiva din consultație cât timp fereastra este deschisă.');
            }

            abort(422, $consultationRequest->objective_data_completed_at
                ? 'Chatul se deschide după ce medicul pornește consultația.'
                : 'Chatul se deschide după ce operatorul efectuează examinarea la domiciliu.');
        }

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx'],
            'caption' => ['nullable', 'string', 'max:1000'],
        ]);

        $file = $validated['file'];
        $path = $file->store('chat-attachments', 'public');
        $url = Storage::disk('public')->url($path);

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $user->id,
            'body' => $validated['caption'] ?? $file->getClientOriginalName(),
            'type' => str_starts_with((string) $file->getMimeType(), 'image/') ? 'image' : 'file',
            'metadata' => [
                'file_name' => $file->getClientOriginalName(),
                'file_size' => $file->getSize(),
                'mime_type' => $file->getMimeType(),
                'path' => $path,
                'url' => $url,
            ],
        ]);

        ConversationMessageSent::dispatch($conversation, $message->load('sender'));
        ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));

        return response()->json([
            'message' => $message->load('sender'),
        ], 201);
    }

    public function proposeTime(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('doctor') || $user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless(in_array($consultationRequest->status, ['new', 'accepted', 'rescheduled'], true), 422, 'Nu se mai poate propune alt interval.');

        $validated = $request->validate([
            'scheduled_at' => ['required', 'date', 'after:now'],
        ]);

        $this->ensureSchedulable([
            'type' => $consultationRequest->type,
            'doctor_id' => $consultationRequest->doctor_id ?: ($user->hasRole('doctor') ? $user->id : null),
            'operator_id' => $consultationRequest->operator_id ?: ($user->hasRole('operator') ? $user->id : null),
            'scheduled_at' => $validated['scheduled_at'],
        ], $consultationRequest->id);

        $consultationRequest->forceFill([
            'status' => 'rescheduled',
            'proposed_scheduled_at' => $validated['scheduled_at'],
            'proposed_by' => $user->id,
        ])->save();

        $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
        if ($conversation) {
            $message = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id' => $user->id,
                'body' => 'A fost propus un nou interval: '.date('d.m.Y H:i', strtotime($validated['scheduled_at'])),
                'type' => 'system',
            ]);
            ConversationMessageSent::dispatch($conversation, $message->load('sender'));
            ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
        }

        return response()->json([
            'message' => 'Interval alternativ propus.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'specialty'])),
        ]);
    }

    public function acceptProposedTime(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user();
        abort_unless((int) $user->id === (int) $consultationRequest->patient_id, 403);
        abort_unless($consultationRequest->status === 'rescheduled' && $consultationRequest->proposed_scheduled_at, 422, 'Nu există o propunere activă.');

        $this->ensureSchedulable([
            'type' => $consultationRequest->type,
            'doctor_id' => $consultationRequest->doctor_id,
            'operator_id' => $consultationRequest->operator_id,
            'scheduled_at' => $consultationRequest->proposed_scheduled_at,
        ], $consultationRequest->id);

        $consultationRequest->forceFill([
            'scheduled_at' => $consultationRequest->proposed_scheduled_at,
            'proposed_scheduled_at' => null,
            'proposed_by' => null,
            'status' => 'new',
            'acceptance_expires_at' => now()->addMinutes($this->acceptanceWindowMinutes()),
        ])->save();

        $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
        if ($conversation) {
            ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
        }

        return response()->json([
            'message' => 'Intervalul propus a fost acceptat.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'specialty'])),
        ]);
    }

    private function serializeRequest(ConsultationRequest $item): array
    {
        $stateMachine = app(ConsultationStateMachine::class);
        $fsmState = $stateMachine->stateFor($item);

        return [
            'id' => (string) $item->id,
            'type' => $item->type,
            'consultation_kind' => $item->consultation_kind,
            'status' => $item->status,
            'fsm_state' => $fsmState,
            'fsm_transitions' => $stateMachine->allowedNext($fsmState),
            'ready_for_doctor' => $stateMachine->readyForDoctor($item),
            'symptoms' => $item->symptoms,
            'selected_services' => $item->selected_services ?? [],
            'triage_notes' => $item->triage_notes,
            'scheduled_at' => $item->scheduled_at,
            'proposed_scheduled_at' => $item->proposed_scheduled_at,
            'proposed_by' => $item->proposed_by,
            'accepted_at' => $item->accepted_at,
            'anamnesis_completed_at' => $item->anamnesis_completed_at,
            'objective_data_completed_at' => $item->objective_data_completed_at,
            'conclusion_sent_at' => $item->conclusion_sent_at,
            'doctor_response_minutes' => $item->doctor_response_minutes,
            'completed_at' => $item->completed_at,
            'cancelled_at' => $item->cancelled_at,
            'refunded_at' => $item->refunded_at,
            'cancellation_reason' => $item->cancellation_reason,
            'acceptance_expires_at' => $item->acceptance_expires_at,
            'chat_expires_at' => $item->chat_expires_at,
            'free_chat_until' => $item->free_chat_until,
            'chat_reactivated_until' => $item->chat_reactivated_until,
            'chat_can_write' => $this->canWriteChat($item),
            'payment_status' => $item->payment_status,
            'amount' => $item->amount_minor / 100,
            'real_amount' => $item->real_amount_minor / 100,
            'points_amount' => $item->points_amount_minor / 100,
            'points_percent' => $item->points_percent,
            'platform_fee' => $item->platform_fee_minor / 100,
            'provider_amount' => $item->provider_amount_minor / 100,
            'pricing_snapshot' => $item->pricing_snapshot,
            'patient' => $item->patient ? ['id' => (string) $item->patient->id, 'name' => $item->patient->name, 'email' => $item->patient->email] : null,
            'patient_profile' => $item->patientProfile ? [
                'id' => (string) $item->patientProfile->id,
                'name' => $item->patientProfile->display_name,
                'patient_code' => $item->patientProfile->patient_code,
                'birth_date' => $item->patientProfile->birth_date?->toDateString(),
                'age' => $item->patientProfile->birth_date?->age,
                'gender' => $item->patientProfile->gender,
                'country' => $item->patientProfile->country,
                'region' => $item->patientProfile->region,
                'locality' => $item->patientProfile->locality,
                'address' => $item->patientProfile->address,
                'emergency_contact' => $item->patientProfile->emergency_contact,
                'medical_summary' => $item->patientProfile->medical_summary,
                'life_history' => $item->patientProfile->life_history ?? [],
                'active_until' => $item->patientProfile->active_until,
            ] : null,
            'doctor' => $item->doctor ? ['id' => (string) $item->doctor->id, 'name' => $item->doctor->name] : null,
            'operator' => $item->operator ? ['id' => (string) $item->operator->id, 'name' => $item->operator->name] : null,
            'specialty' => $item->specialty?->name,
            'investigations' => collect($item->pricing_snapshot['cost_breakdown']['investigations'] ?? [])->values(),
            'objective_data' => $this->serializeObjectiveData($item),
            'exam_media' => $this->serializeExamMedia($item),
            'created_at' => $item->created_at,
        ];
    }

    /**
     * Imaginile și înregistrările din aparat, grupate pe tipul examinării.
     *
     * Pentru otoscopie, dermatoscop, gât și auscultații ele SUNT rezultatul —
     * examinările astea nu produc nicio valoare numerică. Url-ul e al nostru,
     * nu al lor: fișierele se servesc din `ExamMediaController`, cu verificare
     * de acces la fiecare cerere.
     *
     * @return list<array<string, mixed>>
     */
    private function serializeExamMedia(ConsultationRequest $item): array
    {
        return HigoExamMedia::where('consultation_request_id', $item->id)
            ->whereNotNull('path')
            ->orderBy('exam_type')
            ->orderBy('sequence')
            ->orderBy('id')
            ->get()
            ->map(fn (HigoExamMedia $media) => [
                'id' => (string) $media->id,
                'exam_type' => $media->exam_type,
                'kind' => $media->kind,
                'content_type' => $media->content_type,
                'sequence' => $media->sequence,
                'size_bytes' => $media->size_bytes,
                'url' => URL::temporarySignedRoute(
                    'exam-media.show',
                    now()->addMinutes((int) config('higo.media.link_minutes', 60)),
                    ['media' => $media->id],
                ),
            ])
            ->values()
            ->all();
    }

    /**
     * Datele obiective, cu proveniența lor: medicul trebuie să vadă dacă o
     * măsurătoare vine din aparatul HIGO sau a fost notată de mână de operator,
     * cine a înregistrat-o și când.
     *
     * @return list<array<string, mixed>>
     */
    private function serializeObjectiveData(ConsultationRequest $item): array
    {
        if (! $item->relationLoaded('objectiveData')) {
            return [];
        }

        return $item->objectiveData
            ->sortBy('completed_at')
            ->map(fn (ConsultationObjectiveData $data) => [
                'id' => (string) $data->id,
                'source' => $data->source,
                'from_device' => $data->source !== null && str_starts_with($data->source, 'higo'),
                'operator' => $data->relationLoaded('operator') ? $data->operator?->name : null,
                'completed_at' => $data->completed_at,
                'payload' => $data->payload ?? [],
                // Aceleași măsurători, dar cu eticheta și unitatea din
                // vocabularul canonic: fișa nu trebuie să ghicească dacă „38.1”
                // e grade sau ce înseamnă `auscultation_lungs`.
                'values' => $this->labelMeasurements($data->payload ?? []),
            ])
            ->values()
            ->all();
    }

    /**
     * Etichetează măsurătorile cu vocabularul canonic. Cheile pe care nu le
     * cunoaștem (o măsurătoare nouă a aparatului, încă nemapată) rămân în
     * listă, umanizate — o mapare incompletă nu are voie să ascundă date.
     *
     * @param  array<string, mixed>  $payload
     * @return list<array<string, mixed>>
     */
    private function labelMeasurements(array $payload): array
    {
        return collect($payload)
            ->except(['recorded_at'])
            ->map(fn ($value, string $key) => [
                'key' => $key,
                'label' => ObjectiveDataSchema::label($key),
                'unit' => ObjectiveDataSchema::unit($key),
                'value' => is_array($value) ? json_encode($value, JSON_UNESCAPED_UNICODE) : $value,
                'known' => ObjectiveDataSchema::knows($key),
            ])
            ->values()
            ->all();
    }

    private function priceForRequest(array $validated): int
    {
        if (($validated['consultation_kind'] ?? null) === 'video' || $validated['type'] === 'video') {
            if (! empty($validated['doctor_id'])) {
                $doctor = User::with('doctorProfile')->find($validated['doctor_id']);

                return (int) ($doctor?->doctorProfile?->video_price ?? app(PlatformConfig::class)->number('video.default_price', 300));
            }

            return (int) app(PlatformConfig::class)->number('video.default_price', 300);
        }

        if ($validated['type'] === 'operator') {
            return (int) app(PlatformConfig::class)->number('operator_exam_price', 250);
        }

        if (! empty($validated['doctor_id'])) {
            $doctor = User::with('doctorProfile')->find($validated['doctor_id']);

            return (int) ($doctor?->doctorProfile?->consultation_price ?? app(PlatformConfig::class)->number('minimum_consultation_price', 500));
        }

        return (int) app(PlatformConfig::class)->number('minimum_consultation_price', 500);
    }

    private function providerForPricing(array $validated): ?User
    {
        $providerId = $validated['doctor_id'] ?? $validated['operator_id'] ?? null;

        return $providerId ? User::with(['roles', 'doctorProfile', 'operatorProfile'])->find($providerId) : null;
    }

    private function resolvePatientProfile(Request $request, int $patientProfileId): PatientProfile
    {
        $profile = PatientProfile::with('user')->whereKey($patientProfileId)->first();

        abort_unless($profile, 422, 'Profilul de pacient selectat nu există.');
        abort_unless((int) $profile->user_id === (int) $request->user()->id, 403, 'Profilul de pacient nu aparține contului tău.');

        abort_unless($profile->status === 'active', 422, 'Profilul de pacient nu are cartelă activă. Cumpără sau reactivează o cartelă înainte de consultație.');
        abort_if($profile->active_until && $profile->active_until->isPast(), 422, 'Cartela profilului de pacient a expirat. Reînnoiește cartela înainte de o consultație nouă.');

        abort_unless(
            filled($profile->first_name) && filled($profile->last_name),
            422,
            'Profilul de pacient este incomplet. Completează numele și IDNP-ul înainte de consultație.',
        );

        return $profile;
    }

    private function ensureWithExamAddress(PatientProfile $profile): void
    {
        abort_unless(
            $profile->hasCompleteAddress(),
            422,
            'Completează adresa profilului (raion, localitate și stradă) înainte de o consultație cu examinare la domiciliu.',
        );
    }

    private function assignOperatorOrFail(PatientProfile $patientProfile, ?int $doctorId): int
    {
        $requiredInvestigationIds = $this->doctorRequiredInvestigationIds($doctorId);
        $service = app(OperatorAssignmentService::class);

        $operatorId = $service->pickOperatorId($patientProfile, $requiredInvestigationIds);
        if ($operatorId !== null) {
            return $operatorId;
        }

        // AS2 — no eligible operator: distinguish "no coverage" from "no capability".
        $availability = $service->availability($patientProfile, $requiredInvestigationIds);

        abort(
            422,
            $availability['covered']
                ? 'Operatorii din regiunea ta nu pot efectua toate investigațiile cerute de acest medic. Alege alt medic sau o consultație video.'
                : 'Momentan nu avem operator în regiunea ta. Te anunțăm când apare unul disponibil.',
        );
    }

    /**
     * @return list<int>
     */
    private function doctorRequiredInvestigationIds(?int $doctorId): array
    {
        if ($doctorId === null) {
            return [];
        }

        return DoctorInvestigationRequirement::where('doctor_id', $doctorId)
            ->where('requirement', 'required')
            ->pluck('investigation_type_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    private function chatWindows(): array
    {
        $config = app(PlatformConfig::class);

        return [
            'free_days' => (int) $config->number('chat.free_days', 3),
            'total_days' => (int) $config->number('chat.total_days', 14),
        ];
    }

    /**
     * Starea reală a chatului, cu explicația potrivită pentru fiecare etapă.
     *
     * Ciclul de viață are patru stări distincte, nu două: chatul stă închis până
     * când operatorul încarcă datele examinării, se deschide pentru consultație,
     * apoi se închide după concluzie — reactivabil contra cost o perioadă, iar
     * după expirarea ferestrei, definitiv.
     *
     * @return array<string, mixed>
     */
    private function chatState(Conversation $conversation, User $user): array
    {
        $request = $conversation->consultationRequest;

        if (! $request) {
            return [
                'state' => $conversation->status === 'open' ? 'open' : 'closed',
                'can_write' => $conversation->status === 'open',
                'can_reactivate' => false,
                'message' => null,
            ];
        }

        $isPatient = (int) $user->id === (int) $request->patient_id;

        if ($this->canWriteChat($request)) {
            return ['state' => 'open', 'can_write' => true, 'can_reactivate' => false, 'message' => null];
        }

        // Înainte de concluzie, un chat închis înseamnă că examinarea nu e gata —
        // nu că s-a terminat ceva. Reactivarea n-are niciun sens aici.
        if (! $request->conclusion_sent_at) {
            return [
                'state' => 'pending',
                'can_write' => false,
                'can_reactivate' => false,
                'message' => $request->objective_data_completed_at
                    ? 'Examinarea e gata. Chatul se deschide când medicul pornește consultația.'
                    : 'Chatul se deschide după ce operatorul efectuează examinarea la domiciliu.',
            ];
        }

        $reactivatable = $request->chat_expires_at && $request->chat_expires_at->isFuture();

        return [
            'state' => $reactivatable ? 'reactivatable' : 'closed',
            'can_write' => false,
            // Doar pacientul plătește reactivarea.
            'can_reactivate' => $reactivatable && $isPatient,
            'message' => $reactivatable
                ? 'Perioada gratuită de discuții s-a încheiat. Poți reactiva chatul contra cost.'
                : 'Fereastra de discuții pentru această consultație s-a închis definitiv.',
            'reactivate_until' => $request->chat_expires_at,
        ];
    }

    private function canWriteChat(ConsultationRequest $consultationRequest): bool
    {
        if (! $consultationRequest->conclusion_sent_at && in_array($consultationRequest->consultation_kind, ['video', 'preliminary'], true)) {
            return true;
        }

        // Din momentul în care medicul pornește consultația și până la concluzie,
        // chatul e deschis pentru discuții.
        if (! $consultationRequest->conclusion_sent_at && $consultationRequest->doctor_started_at) {
            return true;
        }

        if (! $consultationRequest->conclusion_sent_at) {
            return false;
        }

        if ($consultationRequest->chat_expires_at && $consultationRequest->chat_expires_at->isPast()) {
            return false;
        }

        return ($consultationRequest->free_chat_until && $consultationRequest->free_chat_until->isFuture())
            || ($consultationRequest->chat_reactivated_until && $consultationRequest->chat_reactivated_until->isFuture());
    }

    private function ensureSchedulable(array $validated, ?int $ignoreRequestId = null): void
    {
        $scheduledAt = CarbonImmutable::parse($validated['scheduled_at']);
        abort_if($scheduledAt->isPast(), 422, 'Alegeți o dată/oră din viitor.');

        $providerId = $validated['doctor_id'] ?? $validated['operator_id'] ?? null;
        if (! $providerId) {
            return;
        }

        $provider = User::with(['doctorProfile', 'doctorAvailabilities', 'doctorVacations', 'operatorProfile'])->findOrFail($providerId);
        // Check the availability of whichever provider was actually resolved above.
        $isDoctor = ! empty($validated['doctor_id']);

        if ($isDoctor) {
            abort_unless($provider->doctorProfile?->is_available, 422, 'Medicul nu este disponibil pentru consultații.');

            $onVacation = $provider->doctorVacations()
                ->whereDate('starts_on', '<=', $scheduledAt->toDateString())
                ->whereDate('ends_on', '>=', $scheduledAt->toDateString())
                ->exists();
            abort_if($onVacation, 422, 'Medicul este în concediu în această perioadă.');

            // Programul săptămânal e o restricție opțională, nu o condiție de
            // existență: un medic care nu și-a configurat niciun interval rămâne
            // programabil oricând. Comutatorul explicit e `is_available`, deja
            // verificat mai sus — altfel am avea două semnale care se contrazic.
            $hasSchedule = $provider->doctorAvailabilities()->where('is_active', true)->exists();

            if ($hasSchedule) {
                $fitsSchedule = $provider->doctorAvailabilities()
                    ->where('weekday', $scheduledAt->dayOfWeek)
                    ->where('is_active', true)
                    ->whereTime('starts_at', '<=', $scheduledAt->format('H:i:s'))
                    ->whereTime('ends_at', '>=', $scheduledAt->addMinutes(30)->format('H:i:s'))
                    ->exists();

                abort_unless($fitsSchedule, 422, 'Medicul nu are program disponibil în acest interval.');
            }
        } else {
            abort_unless($provider->operatorProfile?->is_available, 422, 'Operatorul nu este disponibil în acest moment.');
        }

        $slotEnd = $scheduledAt->addMinutes(30);
        $conflict = ConsultationRequest::query()
            ->when($ignoreRequestId, fn ($query) => $query->where('id', '!=', $ignoreRequestId))
            ->whereIn('status', ['new', 'accepted', 'rescheduled'])
            ->where($isDoctor ? 'doctor_id' : 'operator_id', $providerId)
            ->whereNotNull('scheduled_at')
            ->whereBetween('scheduled_at', [$scheduledAt->subMinutes(29), $slotEnd->subMinute()])
            ->exists();

        abort_if($conflict, 422, 'Acest interval este deja ocupat.');
    }

    public function cancel(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless(
            $user->hasRole('admin') || (int) $user->id === (int) $consultationRequest->patient_id,
            403
        );
        abort_unless(in_array($consultationRequest->status, ['new', 'accepted'], true), 422, 'Solicitarea nu mai poate fi anulată.');

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $retainedTravelFee = DB::transaction(function () use ($consultationRequest, $validated) {
            $retained = $this->refundForCancellation($consultationRequest, $validated['reason'] ?? 'Solicitare anulată.');
            $consultationRequest->forceFill([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'cancellation_reason' => $validated['reason'] ?? 'Solicitare anulată de pacient.',
            ])->save();

            $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
            if ($conversation) {
                $conversation->forceFill(['status' => 'closed'])->save();
                ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
            }

            return $retained;
        });

        return response()->json([
            'message' => $retainedTravelFee > 0
                ? 'Solicitarea a fost anulată. Am reținut taxa de drum a operatorului; restul a fost returnat în wallet.'
                : 'Solicitarea a fost anulată. Banii au fost returnați în wallet.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'specialty'])),
        ]);
    }

    public function reject(Request $request, ConsultationRequest $consultationRequest): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('doctor') || $user->hasRole('operator') || $user->hasRole('admin'), 403);
        abort_unless($consultationRequest->status === 'new', 422, 'Solicitarea nu mai poate fi respinsă.');

        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        // EC1 — for a with_exam the operator's refusal triggers reassignment to the
        // next eligible operator (or no_operator_available + full refund if exhausted),
        // instead of a terminal rejection.
        if ($consultationRequest->consultation_kind === 'with_exam') {
            DB::transaction(fn () => $this->reassignOperator($consultationRequest, $validated['reason'] ?? 'Operatorul a refuzat solicitarea.'));

            return response()->json([
                'message' => 'Solicitarea a fost reatribuită sau, dacă nu mai există operatori, anulată cu refund.',
                'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'patientProfile', 'doctor', 'operator', 'specialty', 'objectiveData.operator'])),
            ]);
        }

        DB::transaction(function () use ($consultationRequest, $validated) {
            $this->refundHeldFunds($consultationRequest, $validated['reason'] ?? 'Solicitare respinsă.');
            $consultationRequest->forceFill([
                'status' => 'rejected',
                'cancelled_at' => now(),
                'cancellation_reason' => $validated['reason'] ?? 'Solicitare respinsă de prestator.',
            ])->save();

            $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
            if ($conversation) {
                $conversation->forceFill(['status' => 'closed'])->save();
                ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
            }
        });

        return response()->json([
            'message' => 'Solicitarea a fost respinsă și banii au fost returnați.',
            'request' => $this->serializeRequest($consultationRequest->refresh()->load(['patient', 'doctor', 'operator', 'specialty'])),
        ]);
    }

    private function reservePatientWallet(User $patient, ConsultationRequest $consultationRequest): void
    {
        if ($consultationRequest->amount_minor <= 0) {
            return;
        }

        $ledger = app(WalletLedger::class);
        $wallet = $ledger->locked($patient, WalletLedger::REAL);
        $pointsWallet = $ledger->locked($patient, WalletLedger::POINTS);
        $realAmount = (int) ($consultationRequest->real_amount_minor ?: $consultationRequest->amount_minor);
        $pointsAmount = (int) $consultationRequest->points_amount_minor;
        abort_if($wallet->balance_minor < $realAmount, 422, 'Balanță insuficientă în portofelul de bani reali.');
        abort_if($pointsWallet->balance_minor < $pointsAmount, 422, 'Nu ai suficiente puncte pentru această plată.');

        if ($realAmount > 0) $ledger->move($wallet, -$realAmount, 'service_hold', 'Rezervare consultație din bani reali', ['consultation_request_id' => $consultationRequest->id], $consultationRequest->id);
        if ($pointsAmount > 0) $ledger->move($pointsWallet, -$pointsAmount, 'points_service_hold', 'Rezervare consultație din puncte', ['consultation_request_id' => $consultationRequest->id], $consultationRequest->id);

    }

    private function captureHeldFunds(ConsultationRequest $consultationRequest, User $provider, int $consultationId): void
    {
        if ($consultationRequest->payment_status !== 'held' || $consultationRequest->amount_minor <= 0) {
            return;
        }

        $providerWallet = Wallet::where('user_id', $provider->id)->where('type', 'real')->lockForUpdate()->first()
            ?? Wallet::create(['user_id' => $provider->id, 'balance_minor' => 0, 'currency' => 'MDL']);

        if ($consultationRequest->provider_amount_minor > 0) {
            $providerWallet->increment('balance_minor', $consultationRequest->provider_amount_minor);

            WalletTransaction::create([
                'wallet_id' => $providerWallet->id,
                'user_id' => $provider->id,
                'amount_minor' => $consultationRequest->provider_amount_minor,
                'currency' => $providerWallet->currency,
                'type' => $provider->hasRole('operator') ? 'operator_exam_income' : 'consultation_income',
                'status' => 'completed',
                'description' => $provider->hasRole('operator') ? 'Venit examinare operator' : 'Venit consultație medic',
                'metadata' => [
                    'consultation_request_id' => $consultationRequest->id,
                    'consultation_id' => $consultationId,
                    'gross_amount_minor' => $consultationRequest->amount_minor,
                    'platform_fee_minor' => $consultationRequest->platform_fee_minor,
                ],
                'rate_snapshot' => $consultationRequest->pricing_snapshot['rate_snapshot'] ?? [],
                'consultation_request_id' => $consultationRequest->id,
            ]);
        }

        if ($consultationRequest->platform_fee_minor > 0) {
            WalletTransaction::create([
                'wallet_id' => $providerWallet->id,
                'user_id' => $provider->id,
                'amount_minor' => 0,
                'currency' => $providerWallet->currency,
                'type' => 'platform_fee',
                'status' => 'completed',
                'description' => 'Comision platformă',
                'metadata' => [
                    'consultation_request_id' => $consultationRequest->id,
                    'consultation_id' => $consultationId,
                    'platform_fee_minor' => $consultationRequest->platform_fee_minor,
                ],
                'rate_snapshot' => $consultationRequest->pricing_snapshot['rate_snapshot'] ?? [],
                'consultation_request_id' => $consultationRequest->id,
            ]);
        }

        $consultationRequest->forceFill(['payment_status' => 'captured'])->save();
    }

    private function refundHeldFunds(ConsultationRequest $consultationRequest, string $reason): void
    {
        if ($consultationRequest->payment_status !== 'held' || $consultationRequest->amount_minor <= 0) {
            return;
        }

        $ledger = app(WalletLedger::class);
        $patientWallet = $ledger->locked($consultationRequest->patient_id, WalletLedger::REAL);
        $pointsWallet = $ledger->locked($consultationRequest->patient_id, WalletLedger::POINTS);
        $realAmount = (int) ($consultationRequest->real_amount_minor ?: $consultationRequest->amount_minor);
        $pointsAmount = (int) $consultationRequest->points_amount_minor;
        if ($realAmount > 0) $ledger->move($patientWallet, $realAmount, 'service_refund', 'Returnare bani reali pentru consultație', ['reason' => $reason], $consultationRequest->id);
        if ($pointsAmount > 0) $ledger->move($pointsWallet, $pointsAmount, 'points_service_refund', 'Returnare puncte pentru consultație', ['reason' => $reason], $consultationRequest->id);

        $consultationRequest->forceFill([
            'payment_status' => 'refunded',
            'refunded_at' => now(),
        ])->save();
    }

    /**
     * EC1/EC2 — move a with_exam to the next eligible operator (excluding those who
     * already refused/timed out). If none remain, mark it no_operator_available and
     * refund the patient in full.
     */
    private function reassignOperator(ConsultationRequest $consultationRequest, string $reason): void
    {
        $declined = collect($consultationRequest->declined_operator_ids ?? []);
        if ($consultationRequest->operator_id) {
            $declined->push((int) $consultationRequest->operator_id);
        }
        $declined = $declined->map(fn ($id) => (int) $id)->unique()->values();

        $patientProfile = $consultationRequest->patientProfile ?? $consultationRequest->patientProfile()->first();
        $requiredIds = $this->doctorRequiredInvestigationIds($consultationRequest->doctor_id);

        $nextOperatorId = $patientProfile
            ? app(OperatorAssignmentService::class)->pickOperatorId($patientProfile, $requiredIds, $declined->all())
            : null;

        if ($nextOperatorId !== null) {
            $consultationRequest->forceFill([
                'operator_id' => $nextOperatorId,
                'declined_operator_ids' => $declined->all(),
                'operator_accepted_at' => null,
                'status' => 'new',
                'acceptance_expires_at' => now()->addMinutes($this->acceptanceWindowMinutes()),
            ])->save();

            $this->notifyOperatorAssignment($consultationRequest->refresh()->load(['patient', 'patientProfile', 'operator']));
            $this->linkPatientToAssignedOperator($consultationRequest);
            $consultationRequest->patient?->notify(new AppEventNotification(
                'Operator reasignat',
                'Am reatribuit consultația ta către alt operator disponibil.',
                '/patient',
            ));

            return;
        }

        $this->refundHeldFunds($consultationRequest, $reason);
        $consultationRequest->forceFill([
            'declined_operator_ids' => $declined->all(),
            'operator_id' => null,
            'status' => 'no_operator_available',
            'cancelled_at' => now(),
            'cancellation_reason' => 'Niciun operator din regiune nu a acceptat solicitarea.',
        ])->save();

        $conversation = Conversation::where('consultation_request_id', $consultationRequest->id)->first();
        if ($conversation) {
            $conversation->forceFill(['status' => 'closed'])->save();
            ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
        }

        $consultationRequest->patient?->notify(new AppEventNotification(
            'Consultație anulată',
            'Momentan nu avem operator disponibil în regiunea ta. Banii au fost returnați în wallet.',
            '/patient',
            'warning',
        ));
    }

    /**
     * EC4 — after the operator accepted a with_exam, retain the travel fee (as
     * operator compensation) and refund the rest; otherwise refund in full.
     * Returns the retained travel fee (minor units).
     */
    private function refundForCancellation(ConsultationRequest $consultationRequest, string $reason): int
    {
        $operatorStarted = $consultationRequest->consultation_kind === 'with_exam'
            && $consultationRequest->operator_accepted_at !== null;

        $travelFeeMinor = (int) round(((float) ($consultationRequest->pricing_snapshot['cost_breakdown']['travel_fee'] ?? 0)) * 100);

        if ($operatorStarted && $travelFeeMinor > 0) {
            $this->refundHeldFundsPartial($consultationRequest, $travelFeeMinor, $reason);

            return $travelFeeMinor;
        }

        $this->refundHeldFunds($consultationRequest, $reason);

        return 0;
    }

    private function refundHeldFundsPartial(ConsultationRequest $consultationRequest, int $retainMinor, string $reason): void
    {
        if ($consultationRequest->payment_status !== 'held' || $consultationRequest->amount_minor <= 0) {
            return;
        }

        $retainMinor = min($retainMinor, $consultationRequest->amount_minor);
        $realHeld = (int) ($consultationRequest->real_amount_minor ?: $consultationRequest->amount_minor);
        $pointsHeld = (int) $consultationRequest->points_amount_minor;
        // Taxa de deplasare se achită către operator în bani reali; consumăm
        // întâi componenta reală a rezervării, apoi componenta de puncte.
        $retainReal = min($retainMinor, $realHeld);
        $retainPoints = min($pointsHeld, $retainMinor - $retainReal);
        $refundReal = $realHeld - $retainReal;
        $refundPoints = $pointsHeld - $retainPoints;

        $ledger = app(WalletLedger::class);
        $patientWallet = $ledger->locked($consultationRequest->patient_id, WalletLedger::REAL);
        $pointsWallet = $ledger->locked($consultationRequest->patient_id, WalletLedger::POINTS);
        if ($refundReal > 0) $ledger->move($patientWallet, $refundReal, 'service_refund', 'Returnare parțială în bani reali', ['reason' => $reason, 'retained_minor' => $retainMinor], $consultationRequest->id);
        if ($refundPoints > 0) $ledger->move($pointsWallet, $refundPoints, 'points_service_refund', 'Returnare parțială în puncte', ['reason' => $reason, 'retained_minor' => $retainMinor], $consultationRequest->id);

        if ($retainMinor > 0 && $consultationRequest->operator_id) {
            $operatorWallet = Wallet::where('user_id', $consultationRequest->operator_id)->where('type', 'real')->lockForUpdate()->first()
                ?? Wallet::create(['user_id' => $consultationRequest->operator_id, 'balance_minor' => 0, 'currency' => 'MDL']);
            $operatorWallet->increment('balance_minor', $retainMinor);

            WalletTransaction::create([
                'wallet_id' => $operatorWallet->id,
                'user_id' => $consultationRequest->operator_id,
                'amount_minor' => $retainMinor,
                'currency' => $operatorWallet->currency,
                'type' => 'operator_travel_income',
                'status' => 'completed',
                'description' => 'Compensație deplasare (anulare pacient)',
                'metadata' => ['consultation_request_id' => $consultationRequest->id, 'reason' => $reason],
                'consultation_request_id' => $consultationRequest->id,
            ]);
        }

        $consultationRequest->forceFill(['payment_status' => 'refunded', 'refunded_at' => now()])->save();
    }

    private function expireStaleRequests(): void
    {
        ConsultationRequest::where('status', 'new')
            ->whereNotNull('acceptance_expires_at')
            ->where('acceptance_expires_at', '<', now())
            ->limit(50)
            ->get()
            ->each(function (ConsultationRequest $item) {
                DB::transaction(function () use ($item) {
                    if ($item->consultation_kind === 'with_exam') {
                        $this->reassignOperator($item, 'Operatorul nu a răspuns în intervalul disponibil.');

                        return;
                    }

                    $this->refundHeldFunds($item, 'Solicitare expirată automat.');
                    $item->forceFill([
                        'status' => 'expired',
                        'cancelled_at' => now(),
                        'cancellation_reason' => 'Prestatorul nu a răspuns în intervalul disponibil.',
                    ])->save();

                    $conversation = Conversation::where('consultation_request_id', $item->id)->first();
                    if ($conversation) {
                        $conversation->forceFill(['status' => 'closed'])->save();
                        ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
                    }
                });
            });
    }

    private function settingNumber(string $key, int $default): int
    {
        return (int) app(PlatformConfig::class)->number($key, $default);
    }

    /**
     * HIGO cere ca pacientul să fie legat de operatorul care îl examinează, ca
     * aparatul acelui operator să poată face examinarea. Pacientul e creat acolo
     * fără legătură — la înregistrare nu se știe cine îl va vizita — deci o
     * adăugăm acum, când operatorul tocmai a fost atribuit.
     */
    private function linkPatientToAssignedOperator(ConsultationRequest $item): void
    {
        $item->loadMissing(['patientProfile', 'operator']);

        if ($item->patientProfile && $item->operator) {
            dispatch(SyncHigoEntity::linkPatientToOperator($item->patientProfile, $item->operator));
        }
    }

    private function notifyRequestCreated(ConsultationRequest $item): void
    {
        $item->loadMissing(['patient', 'patientProfile', 'doctor', 'operator']);

        // with_exam: the operator gets the assignment (NT1) and the patient is asked
        // for the anamnesis (NT3/NT4). The doctor is only pulled in at awaiting_doctor.
        if ($item->consultation_kind === 'with_exam') {
            $this->notifyOperatorAssignment($item);
            $this->notifyPatientOperatorAssigned($item);

            return;
        }

        $title = $item->type === 'operator' ? 'Examinare nouă' : 'Consultație nouă';
        $body = ($item->patient?->name ?? 'Un pacient').' a trimis o solicitare nouă.';

        if ($item->doctor_id && $item->doctor) {
            $item->doctor->notify(new AppEventNotification($title, $body, '/doctor/consultations'));

            return;
        }

        if ($item->operator_id && $item->operator) {
            $item->operator->notify(new AppEventNotification($title, $body, '/operator/patients'));

            return;
        }

        $coordinators = User::whereHas('roles', fn ($query) => $query->where('name', 'coordinator'))->get();

        if ($coordinators->isNotEmpty()) {
            Notification::send($coordinators, new AppEventNotification($title, $body, '/coordinator'));
        }
    }

    /**
     * NT1 — the operator's assignment notification: who/where + the required
     * investigations + travel fee, with Accept/Refuse handled in the dashboard.
     */
    private function notifyOperatorAssignment(ConsultationRequest $item): void
    {
        $operator = $item->operator ?? ($item->operator_id ? User::find($item->operator_id) : null);
        if (! $operator) {
            return;
        }

        $item->loadMissing('patientProfile');
        $profile = $item->patientProfile;
        $breakdown = $item->pricing_snapshot['cost_breakdown'] ?? [];
        $investigations = collect($breakdown['investigations'] ?? [])
            ->where('requirement', 'required')
            ->pluck('name')
            ->filter()
            ->implode(', ');

        $lines = ['Pacient: '.($profile?->display_name ?? $item->patient?->name ?? 'Pacient').($profile?->locality ? ' • '.$profile->locality : '')];
        if ($profile?->address) {
            $lines[] = 'Adresă: '.$profile->address;
        }
        if ($investigations !== '') {
            $lines[] = 'Investigații: '.$investigations;
        }
        $lines[] = 'Taxă drum: '.((int) ($breakdown['travel_fee'] ?? 0)).' MDL';

        $operator->notify(new AppEventNotification(
            'Examinare atribuită — acceptă sau refuză',
            implode("\n", $lines),
            '/operator/patients',
        ));
    }

    /**
     * NT3 (operator assigned) + NT4 (complete the anamnesis) to the patient.
     */
    private function notifyPatientOperatorAssigned(ConsultationRequest $item): void
    {
        if (! $item->patient) {
            return;
        }

        $operatorName = $item->operator?->name ?? ($item->operator_id ? User::find($item->operator_id)?->name : null);

        $item->patient->notify(new AppEventNotification(
            'Operator asignat',
            ($operatorName ? $operatorName.' se va ocupa de examinare. ' : '').'Completează anamneza (istoric și acuze) ca medicul să poată formula concluzia.',
            '/patient',
        ));
    }

    /**
     * NT5 — doctor has work: fires only once both flags are set (awaiting_doctor),
     * in the R9.2 order (money in cabinet, anamnesis done, objective data done).
     */
    /**
     * Deschide conversația în momentul în care consultația ajunge la medic, ca
     * el să poată discuta cu pacientul înainte de concluzie.
     */
    private function activateDoctorChat(ConsultationRequest $item): void
    {
        if (! app(ConsultationStateMachine::class)->readyForDoctor($item) || $item->conclusion_sent_at) {
            return;
        }

        $conversation = Conversation::where('consultation_request_id', $item->id)->first();

        if (! $conversation || $conversation->status === 'open') {
            return;
        }

        $conversation->forceFill([
            'doctor_id' => $conversation->doctor_id ?: $item->doctor_id,
            'operator_id' => $conversation->operator_id ?: $item->operator_id,
            'status' => 'open',
            'starts_at' => $conversation->starts_at ?: now(),
        ])->save();

        ConversationUpdated::dispatch($conversation->refresh()->load(['patient', 'doctor', 'operator', 'messages.sender']));
    }

    private function notifyDoctorReady(ConsultationRequest $item): void
    {
        if (! app(ConsultationStateMachine::class)->readyForDoctor($item)) {
            return;
        }

        $item->doctor?->notify(new AppEventNotification(
            'Consultație gata pentru concluzie',
            "Ai o consultație de finalizat:\n1) Plata este în cabinet\n2) Anamneza și acuzele sunt finalizate\n3) Datele obiective sunt încărcate",
            '/doctor/consultations',
        ));
    }

    private function buildFhirEncounter(Consultation $consultation): array
    {
        return [
            'resourceType' => 'Bundle',
            'type' => 'collection',
            'entry' => [
                [
                    'resource' => [
                        'resourceType' => 'Patient',
                        'id' => (string) $consultation->patient_id,
                        'name' => [['text' => $consultation->patient->name]],
                    ],
                ],
                [
                    'resource' => [
                        'resourceType' => 'Practitioner',
                        'id' => (string) $consultation->doctor_id,
                        'name' => [['text' => $consultation->doctor->name]],
                    ],
                ],
                [
                    'resource' => [
                        'resourceType' => 'Encounter',
                        'id' => (string) $consultation->id,
                        'status' => 'finished',
                        'subject' => ['reference' => 'Patient/'.$consultation->patient_id],
                        'participant' => [[
                            'individual' => ['reference' => 'Practitioner/'.$consultation->doctor_id],
                        ]],
                        'diagnosis' => [[
                            'condition' => ['display' => $consultation->diagnosis],
                        ]],
                    ],
                ],
            ],
        ];
    }
}
