<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicalInstitution;
use App\Models\Role;
use App\Models\User;
use App\Rules\ValidPhoneNumber;
use App\Services\InstitutionLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Instituțiile medicale le adaugă doar adminul, împreună cu contul managerului.
 * De acolo încolo instituția își administrează singură medicii.
 */
class AdminInstitutionController extends Controller
{
    public function __construct(private readonly InstitutionLedger $ledger) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => MedicalInstitution::with('managers')
                ->withCount('doctorProfiles')
                ->orderBy('name')
                ->get()
                ->map(fn (MedicalInstitution $institution) => $this->serialize($institution))
                ->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            ...$this->institutionRules(),
            'manager_name' => ['required', 'string', 'max:255'],
            'manager_email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'manager_phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'manager_password' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);

        $generatedPassword = empty($validated['manager_password']) ? Str::password(12, symbols: false) : null;

        $institution = DB::transaction(function () use ($validated, $generatedPassword) {
            $institution = MedicalInstitution::create(collect($validated)->only(array_keys($this->institutionRules()))->all());
            $this->createManager($institution, [
                'name' => $validated['manager_name'],
                'email' => $validated['manager_email'],
                'phone' => $validated['manager_phone'] ?? null,
                'password' => $validated['manager_password'] ?? $generatedPassword,
            ]);

            return $institution;
        });

        return response()->json([
            'message' => 'Instituția a fost creată.',
            'institution' => $this->serialize($institution->load('managers')->loadCount('doctorProfiles')),
            'generated_password' => $generatedPassword,
        ], 201);
    }

    public function update(Request $request, MedicalInstitution $institution): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            ...$this->institutionRules(),
            'status' => ['required', Rule::in(['active', 'suspended'])],
        ]);
        $institution->update($validated);

        return response()->json([
            'message' => 'Instituția a fost actualizată.',
            'institution' => $this->serialize($institution->load('managers')->loadCount('doctorProfiles')),
        ]);
    }

    public function storeManager(Request $request, MedicalInstitution $institution): JsonResponse
    {
        $this->authorizeAdmin($request);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'password' => ['nullable', 'string', 'min:8', 'max:255'],
        ]);
        $generatedPassword = empty($validated['password']) ? Str::password(12, symbols: false) : null;
        $this->createManager($institution, [...$validated, 'password' => $validated['password'] ?? $generatedPassword]);

        return response()->json([
            'message' => 'Managerul a fost adăugat.',
            'institution' => $this->serialize($institution->load('managers')->loadCount('doctorProfiles')),
            'generated_password' => $generatedPassword,
        ], 201);
    }

    /**
     * @return array<string, list<mixed>>
     */
    private function institutionRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'legal_name' => ['nullable', 'string', 'max:255'],
            'fiscal_code' => ['nullable', 'string', 'max:32'],
            'iban' => ['nullable', 'string', 'max:64'],
            'bank_name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'address' => ['nullable', 'string', 'max:255'],
            'doctor_share_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * @param  array{name: string, email: string, phone?: string|null, password: string}  $data
     */
    private function createManager(MedicalInstitution $institution, array $data): User
    {
        $role = Role::firstOrCreate(['name' => 'institution'], ['label' => 'Instituție medicală']);
        $user = User::create([
            'name' => $data['name'],
            'email' => Str::lower($data['email']),
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
            'status' => 'active',
            'active_role_id' => $role->id,
        ]);
        $user->forceFill(['email_verified_at' => now()])->save();
        $user->roles()->sync([$role->id]);
        $institution->managers()->attach($user->id);

        return $user;
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(MedicalInstitution $institution): array
    {
        return [
            'id' => $institution->id,
            'name' => $institution->name,
            'legal_name' => $institution->legal_name,
            'fiscal_code' => $institution->fiscal_code,
            'iban' => $institution->iban,
            'bank_name' => $institution->bank_name,
            'email' => $institution->email,
            'phone' => $institution->phone,
            'address' => $institution->address,
            'doctor_share_percent' => $institution->doctor_share_percent,
            'status' => $institution->status,
            'notes' => $institution->notes,
            'doctors_count' => (int) ($institution->doctor_profiles_count ?? 0),
            'managers' => $institution->managers->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email])->values(),
            ...$this->ledger->summary($institution),
            'created_at' => $institution->created_at,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->loadMissing('roles')->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }
}
