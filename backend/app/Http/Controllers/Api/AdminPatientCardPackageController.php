<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PatientCardPackage;
use App\Models\PatientProfile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPatientCardPackageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => PatientCardPackage::withCount('purchases')
                ->withSum('purchases as profiles_purchased', 'profile_slots')
                ->withSum('purchases as profiles_activated', 'used_slots')
                ->withSum('purchases as revenue_minor', 'amount_minor')
                ->orderBy('profile_slots')->orderBy('id')->get()->map(fn (PatientCardPackage $package) => $this->serialize($package)),
            'free_profile' => [
                'name' => 'Profil gratuit', 'price' => 0, 'profile_slots' => 1, 'permanent' => true,
                'claims_count' => User::whereNotNull('free_patient_profile_claimed_at')->count(),
                'profiles_count' => PatientProfile::where('is_free', true)->count(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $package = PatientCardPackage::create($this->payload($request));

        return response()->json([
            'message' => 'Pachet creat.',
            'package' => $this->serialize($package),
        ], 201);
    }

    public function update(Request $request, PatientCardPackage $patientCardPackage): JsonResponse
    {
        $this->authorizeAdmin($request);

        $patientCardPackage->update($this->payload($request));

        return response()->json([
            'message' => 'Pachet actualizat.',
            'package' => $this->serialize($patientCardPackage->refresh()),
        ]);
    }

    public function destroy(Request $request, PatientCardPackage $patientCardPackage): JsonResponse
    {
        $this->authorizeAdmin($request);

        $patientCardPackage->forceFill(['is_active' => false])->save();

        return response()->json([
            'message' => 'Pachet dezactivat.',
            'package' => $this->serialize($patientCardPackage->refresh()),
        ]);
    }

    private function payload(Request $request): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'profile_slots' => ['required', 'integer', 'min:1', 'max:100'],
            'price' => ['required', 'numeric', 'min:0'],
            'bonus_points' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'validity_days' => ['nullable', 'integer', 'min:1', 'max:3660'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return [
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'profile_slots' => $validated['profile_slots'],
            'price_minor' => (int) round(((float) $validated['price']) * 100),
            'bonus_points_minor' => (int) round(((float) $validated['price']) * 100),
            'validity_days' => $validated['validity_days'] ?? 365,
            'is_active' => $validated['is_active'] ?? true,
        ];
    }

    private function serialize(PatientCardPackage $package): array
    {
        return [
            'id' => $package->id,
            'name' => $package->name,
            'description' => $package->description,
            'profile_slots' => $package->profile_slots,
            'price' => $package->price_minor / 100,
            'bonus_points' => $package->price_minor / 100,
            'validity_days' => $package->validity_days,
            'is_active' => $package->is_active,
            'purchases_count' => (int) ($package->purchases_count ?? 0),
            'profiles_purchased' => (int) ($package->profiles_purchased ?? 0),
            'profiles_activated' => (int) ($package->profiles_activated ?? 0),
            'revenue' => (int) ($package->revenue_minor ?? 0) / 100,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
    }
}
