<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DoctorProfile;
use App\Models\EmailVerificationOtp;
use App\Models\OperatorProfile;
use App\Models\Role;
use App\Models\Specialty;
use App\Models\User;
use App\Notifications\AppEventNotification;
use App\Services\PlatformConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'telegram_chat_id' => ['nullable', 'string', 'max:100'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'account_type' => ['nullable', Rule::in(['patient', 'doctor', 'operator'])],
            'specialty_id' => ['nullable', 'required_if:account_type,doctor', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'region' => [
                'nullable',
                'required_if:account_type,operator',
                'string',
                'max:255',
                Rule::exists('regions', 'name')->where('is_active', true),
            ],
        ], [
            'name.required' => 'Introduceți numele complet.',
            'email.required' => 'Introduceți emailul.',
            'email.email' => 'Introduceți un email valid.',
            'email.unique' => 'Există deja un cont cu acest email.',
            'password.required' => 'Introduceți parola.',
            'password.min' => 'Parola trebuie să aibă minim 8 caractere.',
            'password.confirmed' => 'Parolele introduse nu coincid.',
            'specialty_id.required_if' => 'Alegeți specialitatea.',
            'region.required_if' => 'Alegeți regiunea din catalog.',
            'region.exists' => 'Regiunea selectată nu există în catalog.',
        ]);

        $accountType = $validated['account_type'] ?? 'patient';
        $isProvider = in_array($accountType, ['doctor', 'operator'], true);

        $role = Role::where('name', $accountType)->firstOrFail();

        $user = DB::transaction(function () use ($validated, $role, $accountType, $isProvider) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'telegram_chat_id' => $validated['telegram_chat_id'] ?? null,
                'password' => $validated['password'],
                'active_role_id' => $role->id,
                'status' => $isProvider ? 'pending' : 'active',
            ]);

            // Self-serve accounts hold exactly one role, so a patient can never
            // drift into a doctor/operator (or vice-versa) through registration.
            $user->roles()->sync([$role->id]);

            $this->createProviderProfile($user, $accountType, $validated);

            return $user;
        });

        if ($isProvider) {
            $this->notifyAdminsOfApplication($user, $accountType);
        }

        $devOtp = $this->sendEmailOtp($user);

        return response()->json([
            'message' => $isProvider
                ? 'Cerere trimisă. Confirmă emailul; contul va fi activat după aprobarea administratorului.'
                : 'Cont creat. Am trimis codul de verificare pe email.',
            'email' => $user->email,
            'account_type' => $accountType,
            'requires_approval' => $isProvider,
            'verification_required' => true,
            'dev_otp' => $this->devOtp($devOtp),
        ], 201);
    }

    /**
     * Create the doctor/operator profile for a self-registered applicant.
     * Both are created unapproved so they stay invisible until an admin
     * activates the account from the registrations panel.
     *
     * @param  array<string, mixed>  $payload
     */
    private function createProviderProfile(User $user, string $accountType, array $payload): void
    {
        if ($accountType === 'doctor') {
            DoctorProfile::create([
                'user_id' => $user->id,
                'specialty_id' => $payload['specialty_id'] ?? Specialty::first()?->id,
                'license_number' => $payload['license_number'] ?? null,
                'experience_years' => 0,
                'consultation_price' => 400,
                'platforms' => ['Video', 'Chat'],
                'service_catalog' => [],
                'required_investigations' => [],
                'affiliate_code' => Str::lower(Str::random(10)),
                'is_approved' => false,
                'is_available' => true,
            ]);
        }

        if ($accountType === 'operator') {
            OperatorProfile::create([
                'user_id' => $user->id,
                'country' => 'Republica Moldova',
                'region' => $payload['region'] ?? 'Chișinău',
                'equipment' => ['Tensiometru', 'Pulsoximetru', 'Termometru'],
                'base_fee_minor' => 0,
                'served_areas' => $payload['region'] ? [$payload['region']] : [],
                'travel_fees' => [],
                'service_catalog' => [],
                'accepting_requests' => true,
                'affiliate_code' => Str::lower(Str::random(10)),
                'is_approved' => false,
                'is_available' => true,
            ]);
        }
    }

    private function notifyAdminsOfApplication(User $user, string $accountType): void
    {
        $label = $accountType === 'doctor' ? 'medic' : 'operator';
        $admins = User::whereHas('roles', fn ($query) => $query->where('name', 'admin'))->get();

        Notification::send($admins, new AppEventNotification(
            'Cerere nouă de înregistrare ('.$label.')',
            $user->name.' a solicitat un cont de '.$label.'. Verifică și aprobă din panoul de administrare.',
            '/admin/registrations',
            'info',
        ));
    }

    public function verifyEmailOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['Nu există un cont pentru acest email.'],
            ]);
        }

        if ($user->email_verified_at) {
            return $this->tokenResponse($user, 'Emailul este deja verificat.');
        }

        $otp = EmailVerificationOtp::where('user_id', $user->id)
            ->whereNull('verified_at')
            ->latest()
            ->first();

        if (! $otp || $otp->expires_at->isPast() || ! Hash::check($validated['code'], $otp->code_hash)) {
            throw ValidationException::withMessages([
                'code' => ['Codul este invalid sau a expirat.'],
            ]);
        }

        DB::transaction(function () use ($user, $otp) {
            $otp->forceFill(['verified_at' => now()])->save();
            $user->forceFill(['email_verified_at' => now()])->save();
        });

        $this->forgetDemoOtp($user);

        return $this->tokenResponse($user->refresh(), 'Email verificat cu succes.');
    }

    public function resendEmailOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['Nu există un cont pentru acest email.'],
            ]);
        }

        if ($user->email_verified_at) {
            return response()->json([
                'message' => 'Emailul este deja verificat.',
                'verification_required' => false,
            ]);
        }

        $recentOtp = EmailVerificationOtp::where('user_id', $user->id)
            ->whereNull('verified_at')
            ->where('created_at', '>=', now()->subMinute())
            ->latest()
            ->first();

        if ($recentOtp) {
            $devOtp = $this->demoOtpFor($user);

            if ($this->devOtp($devOtp)) {
                return response()->json([
                    'message' => 'Codul curent este încă valid.',
                    'email' => $user->email,
                    'verification_required' => true,
                    'dev_otp' => $this->devOtp($devOtp),
                ]);
            }

            throw ValidationException::withMessages([
                'email' => ['Așteptați un minut înainte să solicitați un cod nou.'],
            ]);
        }

        $devOtp = $this->sendEmailOtp($user);

        return response()->json([
            'message' => 'Am trimis un cod nou pe email.',
            'email' => $user->email,
            'verification_required' => true,
            'dev_otp' => $this->devOtp($devOtp),
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Datele de autentificare nu sunt corecte.'],
            ]);
        }

        if ($this->loginBlocked($user)) {
            throw ValidationException::withMessages([
                'email' => ['Acest cont nu este activ.'],
            ]);
        }

        if (! $user->email_verified_at) {
            $devOtp = $this->sendEmailOtp($user);

            return response()->json([
                'message' => 'Emailul nu este verificat. Am trimis un cod nou de confirmare.',
                'email' => $user->email,
                'email_verification_required' => true,
                'dev_otp' => $this->devOtp($devOtp),
            ], 202);
        }

        if (app(PlatformConfig::class)->bool('auth.email_2fa_enabled', true)) {
            $devOtp = $this->sendEmailOtp($user);

            return response()->json([
                'message' => 'Am trimis codul de autentificare pe email.',
                'email' => $user->email,
                'login_otp_required' => true,
                'dev_otp' => $this->devOtp($devOtp),
            ], 202);
        }

        $user->forceFill(['last_seen_at' => now()])->save();

        return $this->tokenResponse($user, 'Autentificat cu succes.');
    }

    public function verifyLoginOtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || $this->loginBlocked($user) || ! $user->email_verified_at) {
            throw ValidationException::withMessages([
                'email' => ['Nu există un cont activ pentru acest email.'],
            ]);
        }

        $otp = EmailVerificationOtp::where('user_id', $user->id)
            ->whereNull('verified_at')
            ->latest()
            ->first();

        if (! $otp || $otp->expires_at->isPast() || ! Hash::check($validated['code'], $otp->code_hash)) {
            throw ValidationException::withMessages([
                'code' => ['Codul este invalid sau a expirat.'],
            ]);
        }

        DB::transaction(function () use ($user, $otp) {
            $otp->forceFill(['verified_at' => now()])->save();
            $user->forceFill(['last_seen_at' => now()])->save();
        });

        $this->forgetDemoOtp($user);

        return $this->tokenResponse($user->refresh(), 'Autentificat cu succes.');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->serializeUser($request->user()),
        ]);
    }

    public function switchRole(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['required', Rule::exists('roles', 'name')],
        ]);

        $user = $request->user()->load('roles');
        $role = $user->roles->firstWhere('name', $validated['role']);

        abort_unless($role, 403, 'Rolul nu este disponibil pentru acest utilizator.');

        $user->forceFill(['active_role_id' => $role->id])->save();

        return response()->json([
            'user' => $this->serializeUser($user->refresh()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Delogat cu succes.']);
    }

    /**
     * Pending doctor/operator accounts may still authenticate (they land on a
     * "cont în verificare" screen); only suspended/rejected accounts are barred.
     */
    private function loginBlocked(User $user): bool
    {
        return in_array($user->status, ['suspended', 'rejected'], true);
    }

    private function tokenResponse(User $user, string $message): JsonResponse
    {
        $token = $user->createToken('doctor-md-web')->plainTextToken;

        return response()->json([
            'message' => $message,
            'token' => $token,
            'user' => $this->serializeUser($user),
        ]);
    }

    private function sendEmailOtp(User $user): ?string
    {
        $recentOtp = EmailVerificationOtp::where('user_id', $user->id)
            ->whereNull('verified_at')
            ->where('created_at', '>=', now()->subMinute())
            ->latest()
            ->first();

        if ($recentOtp) {
            return $this->demoOtpFor($user);
        }

        EmailVerificationOtp::where('user_id', $user->id)
            ->whereNull('verified_at')
            ->update(['verified_at' => now()]);

        $code = (string) random_int(100000, 999999);

        EmailVerificationOtp::create([
            'user_id' => $user->id,
            'email' => $user->email,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes((int) config('otp.expires_minutes', 10)),
        ]);

        $this->storeDemoOtp($user, $code);

        try {
            Mail::raw(
                "Codul tău de verificare telemedconsult.md este: {$code}\n\nCodul expiră în 10 minute. Dacă nu ai creat acest cont, ignoră acest email.",
                function ($message) use ($user) {
                    $message->to($user->email, $user->name)
                        ->subject('Cod verificare telemedconsult.md');
                }
            );
        } catch (Throwable $e) {
            report($e);

            if (! app()->environment(['local', 'testing'])) {
                throw $e;
            }
        }

        return $code;
    }

    private function devOtp(?string $code): ?string
    {
        return (bool) config('otp.demo_code_enabled') ? $code : null;
    }

    private function demoOtpFor(User $user): ?string
    {
        return Cache::get($this->demoOtpCacheKey($user));
    }

    private function storeDemoOtp(User $user, string $code): void
    {
        if (! (bool) config('otp.demo_code_enabled')) {
            return;
        }

        Cache::put(
            $this->demoOtpCacheKey($user),
            $code,
            now()->addMinutes((int) config('otp.expires_minutes', 10)),
        );
    }

    private function forgetDemoOtp(User $user): void
    {
        Cache::forget($this->demoOtpCacheKey($user));
    }

    private function demoOtpCacheKey(User $user): string
    {
        return config('otp.demo_cache_key_prefix', 'otp:demo-code:').$user->id;
    }

    private function serializeUser(User $user): array
    {
        $user->loadMissing([
            'roles',
            'activeRole',
            'patientProfile',
            'doctorProfile.specialty',
            'operatorProfile',
            'coordinatorProfile',
        ]);

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at,
            'phone' => $user->phone,
            'telegram_chat_id' => $user->telegram_chat_id,
            'status' => $user->status,
            'roles' => $user->roles->pluck('name')->values(),
            'active_role' => $user->activeRole?->name ?? $user->roles->first()?->name,
            'profiles' => [
                'patient' => $user->patientProfile,
                'doctor' => $user->doctorProfile,
                'operator' => $user->operatorProfile,
                'coordinator' => $user->coordinatorProfile,
            ],
        ];
    }
}
