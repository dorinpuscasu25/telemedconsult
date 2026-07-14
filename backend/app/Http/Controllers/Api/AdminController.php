<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoordinatorProfile;
use App\Models\DoctorProfile;
use App\Models\OperatorCapability;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\OperatorTravelFee;
use App\Models\PatientProfile;
use App\Models\PlatformSetting;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Notifications\AppEventNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    private const MANAGED_ROLES = ['admin', 'patient', 'doctor', 'operator'];

    public function summary(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'users' => User::count(),
            'patients' => $this->countRole('patient'),
            'doctors' => $this->countRole('doctor'),
            'operators' => $this->countRole('operator'),
            'coordinators' => $this->countRole('coordinator'),
            'pending_doctors' => DoctorProfile::where('is_approved', false)->count(),
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $users = User::query()
            ->with(['roles', 'activeRole', 'doctorProfile.specialty', 'operatorProfile', 'coordinatorProfile', 'patientProfile'])
            ->when($request->query('role'), function ($query, string $role) {
                $query->whereHas('roles', fn ($roles) => $roles->where('name', $role));
            })
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->paginate(50);

        return response()->json([
            'data' => $users->getCollection()->map(fn (User $user) => $this->serializeUser($user))->values(),
            'meta' => [
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
                'total' => $users->total(),
            ],
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'telegram_chat_id' => ['nullable', 'string', 'max:100'],
            'password' => ['nullable', 'string', 'min:8'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['required', Rule::in(self::MANAGED_ROLES), Rule::exists('roles', 'name')],
            'specialty_id' => ['nullable', 'required_if:roles.*,doctor', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'experience_years' => ['nullable', 'integer', 'min:0', 'max:80'],
            'consultation_price' => ['nullable', 'integer', 'min:0'],
            'video_price' => ['nullable', 'integer', 'min:0'],
            'service_catalog' => ['nullable', 'array'],
            'required_investigations' => ['nullable', 'array'],
            'country' => ['nullable', 'string', 'max:100'],
            'region' => [
                Rule::requiredIf(fn () => in_array('operator', (array) $request->input('roles', []), true)),
                'nullable',
                'string',
                'max:255',
                Rule::exists('regions', 'name')->where('is_active', true),
            ],
            'locality' => ['nullable', 'string', 'max:255'],
            'base_fee' => ['nullable', 'numeric', 'min:0'],
            'accepting_requests' => ['nullable', 'boolean'],
            'served_areas' => ['nullable', 'array'],
            'operator_services' => ['nullable', 'array'],
            ...$this->operatorRelationRules(),
        ], [
            'region.required' => 'Alege regiunea operatorului din catalog.',
            'region.exists' => 'Regiunea selectată nu există în catalog.',
        ]);

        $user = DB::transaction(function () use ($validated) {
            $roles = Role::whereIn('name', $validated['roles'])->get();
            $activeRole = $roles->first();

            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'telegram_chat_id' => $validated['telegram_chat_id'] ?? null,
                'password' => $validated['password'] ?? 'password',
                'active_role_id' => $activeRole?->id,
                'status' => 'active',
                'email_verified_at' => now(),
            ]);

            $user->roles()->sync($roles->pluck('id'));
            $this->ensureProfiles($user, $roles->pluck('name')->all(), $validated);

            return $user;
        });

        if (in_array('doctor', $validated['roles'], true)) {
            $this->notifyAdmins(
                'Medic nou în platformă',
                'A fost creat contul medicului '.$user->name.'. Verifică aprobarea și profilul.',
                '/admin/doctors',
                $this->settingBool('notify_new_doctors', true),
            );
        }

        return response()->json([
            'message' => 'Utilizator creat.',
            'user' => $this->serializeUser($user->refresh()),
        ], 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'phone' => ['nullable', 'string', 'max:50'],
            'telegram_chat_id' => ['nullable', 'string', 'max:100'],
            'password' => ['nullable', 'string', 'min:8'],
            'status' => ['sometimes', Rule::in(['active', 'suspended'])],
            'roles' => ['sometimes', 'array', 'min:1'],
            'roles.*' => ['required', Rule::in(self::MANAGED_ROLES), Rule::exists('roles', 'name')],
            'specialty_id' => ['nullable', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'experience_years' => ['nullable', 'integer', 'min:0', 'max:80'],
            'consultation_price' => ['nullable', 'integer', 'min:0'],
            'video_price' => ['nullable', 'integer', 'min:0'],
            'service_catalog' => ['nullable', 'array'],
            'required_investigations' => ['nullable', 'array'],
            'is_approved' => ['nullable', 'boolean'],
            'country' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:255'],
            'locality' => ['nullable', 'string', 'max:255'],
            'base_fee' => ['nullable', 'numeric', 'min:0'],
            'accepting_requests' => ['nullable', 'boolean'],
            'served_areas' => ['nullable', 'array'],
            'operator_services' => ['nullable', 'array'],
            ...$this->operatorRelationRules(),
        ]);

        abort_if(
            $request->user()->id === $user->id
            && array_key_exists('status', $validated)
            && $validated['status'] !== 'active',
            422,
            'Nu poți bloca propriul cont de admin.'
        );

        DB::transaction(function () use ($user, $validated) {
            $user->fill(collect($validated)->only(['name', 'email', 'phone', 'telegram_chat_id', 'status'])->all());

            if (! empty($validated['password'])) {
                $user->password = $validated['password'];
            }

            if (isset($validated['roles'])) {
                $roles = Role::whereIn('name', $validated['roles'])->get();
                $user->roles()->sync($roles->pluck('id'));
                $user->active_role_id = $roles->contains('id', $user->active_role_id)
                    ? $user->active_role_id
                    : $roles->first()?->id;
                $this->ensureProfiles($user, $roles->pluck('name')->all(), $validated);
            } else {
                $this->ensureProfiles($user, $user->roles()->pluck('name')->all(), $validated);
            }

            $user->save();
        });

        if (array_key_exists('is_approved', $validated) && $user->hasRole('doctor')) {
            $user->notify(new AppEventNotification(
                $validated['is_approved'] ? 'Profil medic aprobat' : 'Profil medic pus în verificare',
                $validated['is_approved']
                    ? 'Profilul tău de medic este aprobat și vizibil pentru pacienți.'
                    : 'Profilul tău de medic necesită verificare suplimentară.',
                '/doctor/profile',
                $validated['is_approved'] ? 'success' : 'warning',
            ));
        }

        return response()->json([
            'message' => 'Utilizator actualizat.',
            'user' => $this->serializeUser($user->refresh()),
        ]);
    }

    public function destroyUser(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        abort_if($request->user()->id === $user->id, 422, 'Nu poți șterge propriul cont de admin.');

        $user->delete();

        return response()->json([
            'message' => 'Utilizator șters.',
        ]);
    }

    public function registrations(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $users = User::query()
            ->where('status', 'pending')
            ->with(['roles', 'activeRole', 'doctorProfile.specialty', 'operatorProfile', 'coordinatorProfile', 'patientProfile'])
            ->latest()
            ->get()
            ->map(fn (User $user) => $this->serializeUser($user))
            ->values();

        return response()->json(['data' => $users]);
    }

    public function approveUser(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        abort_unless($user->status === 'pending', 422, 'Acest cont nu este în așteptare.');

        DB::transaction(function () use ($user) {
            $user->forceFill(['status' => 'active'])->save();
            $user->doctorProfile?->forceFill(['is_approved' => true])->save();
            $user->operatorProfile?->forceFill(['is_approved' => true])->save();
        });

        $user->notify(new AppEventNotification(
            'Cont aprobat',
            'Contul tău a fost aprobat. Te poți autentifica și folosi platforma.',
            '/',
            'success',
        ));

        return response()->json([
            'message' => 'Cont aprobat.',
            'user' => $this->serializeUser($user->refresh()),
        ]);
    }

    public function rejectUser(Request $request, User $user): JsonResponse
    {
        $this->authorizeAdmin($request);

        abort_unless($user->status === 'pending', 422, 'Acest cont nu este în așteptare.');

        DB::transaction(function () use ($user) {
            $user->forceFill(['status' => 'rejected'])->save();
            $user->doctorProfile?->forceFill(['is_approved' => false])->save();
            $user->operatorProfile?->forceFill(['is_approved' => false])->save();
        });

        $user->notify(new AppEventNotification(
            'Cerere respinsă',
            'Cererea ta de înregistrare nu a fost aprobată. Pentru detalii, contactează echipa telemedconsult.md.',
            null,
            'warning',
        ));

        return response()->json([
            'message' => 'Cerere respinsă.',
            'user' => $this->serializeUser($user->refresh()),
        ]);
    }

    public function roles(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => Role::orderBy('id')->get(),
        ]);
    }

    public function specialties(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => Specialty::query()
                ->withCount('doctorProfiles')
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function storeSpecialty(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:specialties,name'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:specialties,slug'],
        ]);
        $slug = $validated['slug'] ?? Str::slug($validated['name']);

        abort_if(Specialty::where('slug', $slug)->exists(), 422, 'Acest slug este deja folosit.');

        $specialty = Specialty::create([
            'name' => $validated['name'],
            'slug' => $slug,
        ]);

        return response()->json([
            'message' => 'Specialitate creată.',
            'specialty' => $specialty->loadCount('doctorProfiles'),
        ], 201);
    }

    public function updateSpecialty(Request $request, Specialty $specialty): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('specialties', 'name')->ignore($specialty)],
            'slug' => ['nullable', 'string', 'max:255', Rule::unique('specialties', 'slug')->ignore($specialty)],
        ]);
        $slug = $validated['slug'] ?? Str::slug($validated['name']);

        abort_if(
            Specialty::where('slug', $slug)->whereKeyNot($specialty->id)->exists(),
            422,
            'Acest slug este deja folosit.'
        );

        $specialty->update([
            'name' => $validated['name'],
            'slug' => $slug,
        ]);

        return response()->json([
            'message' => 'Specialitate actualizată.',
            'specialty' => $specialty->refresh()->loadCount('doctorProfiles'),
        ]);
    }

    public function destroySpecialty(Request $request, Specialty $specialty): JsonResponse
    {
        $this->authorizeAdmin($request);

        $specialty->delete();

        return response()->json([
            'message' => 'Specialitate ștearsă.',
        ]);
    }

    private function ensureProfiles(User $user, array $roles, array $payload): void
    {
        if (in_array('patient', $roles, true)) {
            PatientProfile::firstOrCreate(['user_id' => $user->id]);
        }

        if (in_array('doctor', $roles, true)) {
            $existingDoctor = DoctorProfile::where('user_id', $user->id)->first();
            DoctorProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'specialty_id' => $payload['specialty_id'] ?? $existingDoctor?->specialty_id ?? Specialty::first()?->id,
                    'license_number' => $payload['license_number'] ?? $existingDoctor?->license_number,
                    'experience_years' => $payload['experience_years'] ?? $existingDoctor?->experience_years ?? 0,
                    'consultation_price' => $payload['consultation_price'] ?? $existingDoctor?->consultation_price ?? 400,
                    'video_price' => $payload['video_price'] ?? $existingDoctor?->video_price,
                    'platforms' => $existingDoctor?->platforms ?? ['Video', 'Chat'],
                    'service_catalog' => $payload['service_catalog'] ?? $existingDoctor?->service_catalog ?? [],
                    'required_investigations' => $payload['required_investigations'] ?? $existingDoctor?->required_investigations ?? [],
                    'affiliate_code' => $existingDoctor?->affiliate_code ?? Str::lower(Str::random(10)),
                    'is_approved' => $payload['is_approved'] ?? $existingDoctor?->is_approved ?? true,
                    'is_available' => true,
                ],
            );
        }

        if (in_array('operator', $roles, true)) {
            $existingOperator = OperatorProfile::where('user_id', $user->id)->first();
            OperatorProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'country' => $payload['country'] ?? $existingOperator?->country ?? 'Republica Moldova',
                    'region' => $payload['region'] ?? $existingOperator?->region ?? 'Chișinău',
                    'locality' => $payload['locality'] ?? $existingOperator?->locality,
                    'equipment' => $existingOperator?->equipment ?? ['Tensiometru', 'Pulsoximetru', 'Termometru'],
                    'base_fee_minor' => isset($payload['base_fee']) ? (int) round(((float) $payload['base_fee']) * 100) : ($existingOperator?->base_fee_minor ?? 0),
                    'served_areas' => $existingOperator?->served_areas ?? [],
                    'travel_fees' => $existingOperator?->travel_fees ?? [],
                    'service_catalog' => $payload['operator_services'] ?? $existingOperator?->service_catalog ?? [],
                    'accepting_requests' => $payload['accepting_requests'] ?? $existingOperator?->accepting_requests ?? true,
                    'affiliate_code' => $existingOperator?->affiliate_code ?? Str::lower(Str::random(10)),
                    'is_approved' => $payload['is_approved'] ?? $existingOperator?->is_approved ?? true,
                    'is_available' => true,
                ],
            );

            $this->syncOperatorRelations($user, $payload);
        }

        if (in_array('coordinator', $roles, true)) {
            $existingCoordinator = CoordinatorProfile::where('user_id', $user->id)->first();
            CoordinatorProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'region' => $payload['region'] ?? $existingCoordinator?->region ?? 'Național',
                    'is_available' => true,
                ],
            );
        }
    }

    private function authorizeAdmin(Request $request): void
    {
        $user = $request->user()->loadMissing('roles');

        abort_unless($user->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }

    private function countRole(string $role): int
    {
        return User::whereHas('roles', fn ($roles) => $roles->where('name', $role))->count();
    }

    private function notifyAdmins(string $title, string $body, string $url, bool $sendEmail): void
    {
        $admins = User::whereHas('roles', fn ($query) => $query->where('name', 'admin'))->get();
        Notification::send($admins, new AppEventNotification($title, $body, $url, 'info', $sendEmail));
    }

    private function settingBool(string $key, bool $default): bool
    {
        $setting = PlatformSetting::where('key', $key)->first();

        if ($setting === null) {
            return $default;
        }

        return filter_var($setting->value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }

    /**
     * Validation rules for the normalized operator coverage / capabilities /
     * travel-fee inputs, shared by store and update.
     *
     * @return array<string, mixed>
     */
    private function operatorRelationRules(): array
    {
        return [
            'coverage' => ['nullable', 'array'],
            'coverage.*.region_id' => ['required_with:coverage', 'integer', Rule::exists('regions', 'id')],
            'coverage.*.locality_id' => ['nullable', 'integer', Rule::exists('localities', 'id')],
            'capabilities' => ['nullable', 'array'],
            'capabilities.*.investigation_type_id' => ['required_with:capabilities', 'integer', Rule::exists('investigation_types', 'id')],
            'capabilities.*.price_override' => ['nullable', 'integer', 'min:0'],
            'travel_fees' => ['nullable', 'array'],
            'travel_fees.*.region_id' => ['required_with:travel_fees', 'integer', Rule::exists('regions', 'id')],
            'travel_fees.*.locality_id' => ['nullable', 'integer', Rule::exists('localities', 'id')],
            'travel_fees.*.fee' => ['required_with:travel_fees', 'integer', 'min:0'],
        ];
    }

    /**
     * Full-replace sync of the operator's coverage, capabilities and travel fees
     * from the admin payload. Each block is only touched when present, so partial
     * updates never wipe data the form did not submit.
     */
    private function syncOperatorRelations(User $user, array $payload): void
    {
        if (array_key_exists('coverage', $payload)) {
            OperatorCoverage::where('operator_id', $user->id)->delete();

            collect($payload['coverage'] ?? [])
                ->unique(fn (array $row) => $row['region_id'].':'.($row['locality_id'] ?? ''))
                ->each(fn (array $row) => OperatorCoverage::create([
                    'operator_id' => $user->id,
                    'region_id' => $row['region_id'],
                    'locality_id' => $row['locality_id'] ?? null,
                    'is_active' => $row['is_active'] ?? true,
                ]));

            // Keep the denormalized served_areas snapshot (region names) in sync
            // so the current operator matching keeps working across raioane.
            $regionNames = OperatorCoverage::where('operator_id', $user->id)
                ->with('region')
                ->get()
                ->map(fn (OperatorCoverage $coverage) => $coverage->region?->name)
                ->filter()
                ->unique()
                ->values()
                ->all();

            $user->operatorProfile?->forceFill(['served_areas' => $regionNames])->save();
        }

        if (array_key_exists('capabilities', $payload)) {
            OperatorCapability::where('operator_id', $user->id)->delete();

            collect($payload['capabilities'] ?? [])
                ->unique('investigation_type_id')
                ->each(fn (array $row) => OperatorCapability::create([
                    'operator_id' => $user->id,
                    'investigation_type_id' => $row['investigation_type_id'],
                    'price_override' => $row['price_override'] ?? null,
                ]));
        }

        if (array_key_exists('travel_fees', $payload)) {
            OperatorTravelFee::where('operator_id', $user->id)->delete();

            collect($payload['travel_fees'] ?? [])
                ->unique(fn (array $row) => $row['region_id'].':'.($row['locality_id'] ?? ''))
                ->each(fn (array $row) => OperatorTravelFee::create([
                    'operator_id' => $user->id,
                    'region_id' => $row['region_id'],
                    'locality_id' => $row['locality_id'] ?? null,
                    'fee' => $row['fee'] ?? 0,
                ]));
        }
    }

    private function serializeUser(User $user): array
    {
        $user->loadMissing([
            'roles', 'activeRole', 'doctorProfile.specialty',
            'operatorProfile.coverage.region', 'operatorProfile.coverage.locality',
            'operatorProfile.capabilities.investigationType',
            'operatorProfile.travelFees.region', 'operatorProfile.travelFees.locality',
            'coordinatorProfile', 'patientProfile',
        ]);

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'telegram_chat_id' => $user->telegram_chat_id,
            'status' => $user->status,
            'roles' => $user->roles->pluck('name')->values(),
            'active_role' => $user->activeRole?->name,
            'created_at' => $user->created_at,
            'profiles' => [
                'patient' => $user->patientProfile,
                'doctor' => $user->doctorProfile,
                'operator' => $user->operatorProfile ? $this->serializeOperatorProfile($user->operatorProfile) : null,
                'coordinator' => $user->coordinatorProfile,
            ],
        ];
    }

    private function serializeOperatorProfile(OperatorProfile $profile): array
    {
        return [
            ...$profile->toArray(),
            'base_fee' => ($profile->base_fee_minor ?? 0) / 100,
            'coverage' => $profile->coverage->map(fn (OperatorCoverage $item) => [
                'id' => $item->id,
                'region_id' => $item->region_id,
                'region' => $item->region?->name,
                'locality_id' => $item->locality_id,
                'locality' => $item->locality?->name,
                'is_active' => $item->is_active,
            ])->values(),
            'capabilities' => $profile->capabilities->map(fn (OperatorCapability $item) => [
                'id' => $item->id,
                'investigation_type_id' => $item->investigation_type_id,
                'investigation' => $item->investigationType?->name,
                'code' => $item->investigationType?->code,
                'default_price' => $item->investigationType?->default_price,
                'price_override' => $item->price_override,
            ])->values(),
            'travel_fees' => $profile->travelFees->map(fn (OperatorTravelFee $item) => [
                'id' => $item->id,
                'region_id' => $item->region_id,
                'region' => $item->region?->name,
                'locality_id' => $item->locality_id,
                'locality' => $item->locality?->name,
                'fee' => $item->fee,
            ])->values(),
        ];
    }
}
