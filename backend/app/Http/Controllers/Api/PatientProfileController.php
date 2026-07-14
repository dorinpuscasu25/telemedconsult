<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Locality;
use App\Models\MedicalDocument;
use App\Models\PatientCardPackage;
use App\Models\Region;
use App\Models\PatientCardPurchase;
use App\Models\PatientFamilyMember;
use App\Models\PatientInvestigation;
use App\Models\PatientProfile;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Services\FeatureFlags;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class PatientProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing(['roles', 'patientProfile', 'patientProfiles.investigations', 'patientFamilyMembers']);
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        return response()->json([
            'user' => [
                'id' => (string) $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'telegram_chat_id' => $user->telegram_chat_id,
            ],
            'profile' => $user->patientProfile,
            'patient_profiles' => $user->patientProfiles()
                ->with('investigations')
                ->latest()
                ->get()
                ->map(fn (PatientProfile $profile) => $this->serializePatientProfile($profile)),
            'family_members' => $user->patientFamilyMembers()->latest()->get(),
            'card_packages' => PatientCardPackage::where('is_active', true)->orderBy('profile_slots')->get()->map(fn (PatientCardPackage $package) => [
                'id' => $package->id,
                'name' => $package->name,
                'description' => $package->description,
                'profile_slots' => $package->profile_slots,
                'price' => $package->price_minor / 100,
                'validity_days' => $package->validity_days,
            ]),
            'card_purchases' => PatientCardPurchase::where('user_id', $user->id)->latest()->get()->map(fn (PatientCardPurchase $purchase) => [
                'id' => $purchase->id,
                'profile_slots' => $purchase->profile_slots,
                'used_slots' => $purchase->used_slots,
                'available_slots' => $purchase->availableSlots(),
                'expires_at' => $purchase->expires_at,
                'amount' => $purchase->amount_minor / 100,
            ]),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'telegram_chat_id' => ['nullable', 'string', 'max:100'],
            'identity_number' => ['nullable', 'string', 'max:32'],
            'birth_date' => ['nullable', 'date'],
            'gender' => ['nullable', Rule::in(['M', 'F', 'Altul'])],
            'address' => ['nullable', 'string', 'max:255'],
            'emergency_contact' => ['nullable', 'string', 'max:255'],
            'medical_summary' => ['nullable', 'string', 'max:4000'],
        ]);

        $user->forceFill([
            'name' => $validated['name'],
            'phone' => $validated['phone'] ?? null,
            'telegram_chat_id' => $validated['telegram_chat_id'] ?? null,
        ])->save();

        $profile = $user->patientProfile;
        if ($profile) {
            $profile->update([
                'identity_number' => $validated['identity_number'] ?? null,
                'birth_date' => $validated['birth_date'] ?? null,
                'gender' => $validated['gender'] ?? null,
                'address' => $validated['address'] ?? null,
                'emergency_contact' => $validated['emergency_contact'] ?? null,
                'medical_summary' => $validated['medical_summary'] ?? null,
            ]);
        }

        return response()->json([
            'message' => 'Profil actualizat.',
            'user' => $user->fresh(),
            'profile' => $profile?->fresh(),
        ]);
    }

    public function storePatientProfile(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $validated = $this->validatePatientProfile($request);

        $profile = DB::transaction(function () use ($user, $validated) {
            $purchase = PatientCardPurchase::where('user_id', $user->id)
                ->where('expires_at', '>', now())
                ->whereColumn('used_slots', '<', 'profile_slots')
                ->lockForUpdate()
                ->orderBy('expires_at')
                ->first();

            abort_unless($purchase && $purchase->availableSlots() > 0, 422, 'Nu ai cartele disponibile pentru un profil nou.');

            $purchase->increment('used_slots');

            return PatientProfile::create([
                ...$validated,
                'user_id' => $user->id,
                'status' => 'active',
                'active_until' => $purchase->expires_at,
                'life_history' => [],
            ]);
        });

        return response()->json([
            'message' => 'Profil pacient creat.',
            'patient_profile' => $profile,
        ], 201);
    }

    public function updatePatientProfile(Request $request, PatientProfile $patientProfile): JsonResponse
    {
        abort_unless($patientProfile->user_id === $request->user()->id || $request->user()->hasRole('admin'), 403);

        $patientProfile->update($this->validatePatientProfile($request, false));

        return response()->json([
            'message' => 'Profil pacient actualizat.',
            'patient_profile' => $patientProfile->fresh(),
        ]);
    }

    public function buyCardPackage(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');
        abort_unless(app(FeatureFlags::class)->enabled('patient_cards'), 403, 'Modulul de cartele este momentan dezactivat.');
        abort_unless(app(FeatureFlags::class)->enabled('payments'), 403, 'Plățile sunt momentan dezactivate.');

        $validated = $request->validate([
            'package_id' => ['required', 'exists:patient_card_packages,id'],
        ]);

        $purchase = DB::transaction(function () use ($user, $validated) {
            $package = PatientCardPackage::where('is_active', true)->lockForUpdate()->findOrFail($validated['package_id']);
            $wallet = Wallet::where('user_id', $user->id)->lockForUpdate()->first()
                ?? Wallet::create(['user_id' => $user->id, 'balance_minor' => 0, 'currency' => 'MDL']);

            if ($wallet->balance_minor < $package->price_minor) {
                throw new HttpResponseException(response()->json([
                    'message' => 'Balanță insuficientă pentru cartelă. Alimentează portofelul înainte de cumpărare.',
                    'code' => 'insufficient_wallet_balance',
                    'required_amount' => $package->price_minor / 100,
                    'current_balance' => $wallet->balance_minor / 100,
                    'missing_amount' => max(0, $package->price_minor - $wallet->balance_minor) / 100,
                ], 422));
            }

            $wallet->decrement('balance_minor', $package->price_minor);

            $purchase = PatientCardPurchase::create([
                'user_id' => $user->id,
                'patient_card_package_id' => $package->id,
                'profile_slots' => $package->profile_slots,
                'amount_minor' => $package->price_minor,
                'validity_days' => $package->validity_days,
                'expires_at' => now()->addDays($package->validity_days),
                'settings_snapshot' => $package->toArray(),
            ]);

            WalletTransaction::create([
                'wallet_id' => $wallet->id,
                'user_id' => $user->id,
                'amount_minor' => -$package->price_minor,
                'currency' => $wallet->currency,
                'type' => 'patient_card_purchase',
                'status' => 'completed',
                'description' => 'Cumpărare cartelă pacient: '.$package->name,
                'metadata' => ['patient_card_package_id' => $package->id, 'patient_card_purchase_id' => $purchase->id],
            ]);

            return $purchase;
        });

        return response()->json([
            'message' => 'Cartelă cumpărată.',
            'purchase' => $purchase,
        ], 201);
    }

    public function appendLifeHistory(Request $request, PatientProfile $patientProfile): JsonResponse
    {
        abort_unless($patientProfile->user_id === $request->user()->id || $request->user()->hasRole('admin'), 403);

        $validated = $request->validate([
            'category' => ['required', 'string', 'max:100'],
            'note' => ['required', 'string', 'max:2000'],
        ]);

        $history = $patientProfile->life_history ?? [];
        $history[] = [
            'category' => $validated['category'],
            'note' => $validated['note'],
            'added_at' => now()->toISOString(),
            'added_by' => $request->user()->id,
        ];

        $patientProfile->forceFill(['life_history' => $history])->save();

        return response()->json([
            'message' => 'Istoric adăugat.',
            'patient_profile' => $patientProfile->fresh(),
        ]);
    }

    public function storeInvestigation(Request $request, PatientProfile $patientProfile): JsonResponse
    {
        abort_unless($patientProfile->user_id === $request->user()->id || $request->user()->hasRole('admin'), 403);

        $validated = $request->validate([
            'consultation_request_id' => ['nullable', Rule::exists('consultation_requests', 'id')->where(fn ($query) => $query->where('patient_profile_id', $patientProfile->id))],
            'type' => ['nullable', 'string', 'max:100'],
            'title' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'file' => ['nullable', 'file', 'max:20480', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx'],
        ]);

        $file = $validated['file'] ?? null;
        $path = $file ? $file->store('patient-investigations', 'public') : null;

        $investigation = PatientInvestigation::create([
            'patient_profile_id' => $patientProfile->id,
            'consultation_request_id' => $validated['consultation_request_id'] ?? null,
            'uploaded_by' => $request->user()->id,
            'type' => $validated['type'] ?? 'investigation',
            'title' => $validated['title'],
            'file_path' => $path,
            'mime_type' => $file?->getMimeType(),
            'file_size' => $file?->getSize(),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'message' => 'Investigație salvată.',
            'investigation' => $investigation,
            'url' => $path ? Storage::disk('public')->url($path) : null,
        ], 201);
    }

    public function exportPatientData(Request $request, PatientProfile $patientProfile): JsonResponse
    {
        abort_unless($patientProfile->user_id === $request->user()->id || $request->user()->hasRole('admin'), 403);

        return response()->json([
            'patient_profile' => $patientProfile->load('investigations'),
            'consultation_requests' => ConsultationRequest::with(['doctor', 'operator', 'objectiveData'])
                ->where('patient_profile_id', $patientProfile->id)
                ->latest()
                ->get(),
            'consultations' => Consultation::where('patient_profile_id', $patientProfile->id)->latest()->get(),
            'documents' => MedicalDocument::where('patient_profile_id', $patientProfile->id)->latest()->get(),
        ]);
    }

    public function destroyPatientProfile(Request $request, PatientProfile $patientProfile): JsonResponse
    {
        abort_unless($patientProfile->user_id === $request->user()->id || $request->user()->hasRole('admin'), 403);
        abort_if(
            ConsultationRequest::where('patient_profile_id', $patientProfile->id)->whereIn('status', ['new', 'accepted', 'rescheduled'])->exists(),
            422,
            'Profilul are consultații active și nu poate fi șters încă.'
        );

        $patientProfile->delete();

        return response()->json(['message' => 'Profil pacient șters.']);
    }

    public function storeFamilyMember(Request $request): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $member = PatientFamilyMember::create([
            ...$this->validateFamilyMember($request),
            'owner_user_id' => $user->id,
        ]);

        return response()->json([
            'message' => 'Pacient asociat adăugat.',
            'family_member' => $member,
        ], 201);
    }

    public function updateFamilyMember(Request $request, PatientFamilyMember $patientFamilyMember): JsonResponse
    {
        abort_unless($patientFamilyMember->owner_user_id === $request->user()->id, 403);

        $patientFamilyMember->update($this->validateFamilyMember($request));

        return response()->json([
            'message' => 'Pacient asociat actualizat.',
            'family_member' => $patientFamilyMember->fresh(),
        ]);
    }

    public function destroyFamilyMember(Request $request, PatientFamilyMember $patientFamilyMember): JsonResponse
    {
        abort_unless($patientFamilyMember->owner_user_id === $request->user()->id, 403);

        $patientFamilyMember->delete();

        return response()->json(['message' => 'Pacient asociat șters.']);
    }

    private function validateFamilyMember(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'max:50'],
            'age' => ['nullable', 'integer', 'min:0', 'max:120'],
            'relation' => ['nullable', 'string', 'max:100'],
            'identity_number' => ['nullable', 'string', 'max:32'],
        ]);
    }

    private function validatePatientProfile(Request $request, bool $creating = true): array
    {
        $required = $creating ? 'required' : 'sometimes';

        $validated = $request->validate([
            'first_name' => [$required, 'string', 'max:255'],
            'last_name' => [$required, 'string', 'max:255'],
            'identity_number' => [$required, 'string', 'max:32'],
            'birth_date' => ['nullable', 'date'],
            'gender' => ['nullable', Rule::in(['M', 'F', 'Altul'])],
            'country' => [$required, 'string', 'max:100'],
            'region_id' => [$required, 'integer', Rule::exists('regions', 'id')->where('is_active', true)],
            'locality_id' => [$required, 'integer', Rule::exists('localities', 'id')->where(function ($query) use ($request) {
                $query->where('is_active', true);
                if ($request->filled('region_id')) {
                    $query->where('region_id', $request->integer('region_id'));
                }
            })],
            'address' => [$required, 'string', 'max:255'],
            'emergency_contact' => ['nullable', 'string', 'max:255'],
            'medical_summary' => ['nullable', 'string', 'max:4000'],
        ], [
            'region_id.required' => 'Alege raionul din listă.',
            'region_id.exists' => 'Raionul selectat nu este disponibil.',
            'locality_id.required' => 'Alege localitatea din listă.',
            'locality_id.exists' => 'Localitatea selectată nu aparține raionului ales sau este inactivă.',
            'address.required' => 'Completează adresa (stradă și număr).',
        ]);

        // Keep the denormalized region/locality name columns in sync with the catalog.
        if (array_key_exists('region_id', $validated)) {
            $validated['region'] = Region::find($validated['region_id'])?->name;
        }

        if (array_key_exists('locality_id', $validated)) {
            $validated['locality'] = Locality::find($validated['locality_id'])?->name;
        }

        return $validated;
    }

    private function serializePatientProfile(PatientProfile $profile): array
    {
        return [
            ...$profile->toArray(),
            'display_name' => $profile->display_name,
            'can_request_consultation' => $this->canRequestConsultation($profile),
            'request_unavailable_reason' => $this->requestUnavailableReason($profile),
            'has_complete_address' => $profile->hasCompleteAddress(),
        ];
    }

    private function canRequestConsultation(PatientProfile $profile): bool
    {
        return $profile->status === 'active'
            && ($profile->active_until === null || $profile->active_until->isFuture())
            && filled($profile->first_name)
            && filled($profile->last_name)
            && filled($profile->identity_number);
    }

    private function requestUnavailableReason(PatientProfile $profile): ?string
    {
        if ($profile->status !== 'active') {
            return 'Profilul nu are cartelă activă.';
        }

        if ($profile->active_until && $profile->active_until->isPast()) {
            return 'Cartela profilului a expirat.';
        }

        if (! filled($profile->first_name) || ! filled($profile->last_name) || ! filled($profile->identity_number)) {
            return 'Profilul este incomplet.';
        }

        return null;
    }
}
