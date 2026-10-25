<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MedicalInstitutionInvitation;
use App\Models\Role;
use App\Models\User;
use App\Rules\ValidPhoneNumber;
use App\Services\InstitutionMembership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Pagina publică a invitației. Un medic nou își creează contul direct din
 * link (emailul e dovedit de faptul că a primit linkul); un medic existent
 * trebuie să fie autentificat cu contul invitat.
 */
class InstitutionInvitationController extends Controller
{
    public function __construct(private readonly InstitutionMembership $membership) {}

    public function show(string $token): JsonResponse
    {
        $invitation = $this->find($token);
        $existing = User::where('email', $invitation->email)->exists();

        return response()->json([
            'invitation' => [
                'institution' => $invitation->institution->name,
                'email' => $invitation->email,
                'name' => $invitation->name,
                'specialty_id' => $invitation->specialty_id,
                'specialty' => $invitation->specialty?->name,
                'license_number' => $invitation->license_number,
                'status' => $invitation->status === 'pending' && $invitation->expires_at->isPast() ? 'expired' : $invitation->status,
                'expires_at' => $invitation->expires_at,
                'account_exists' => $existing,
            ],
        ]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $invitation = $this->find($token);
        abort_unless($invitation->isUsable(), 410, 'Invitația a expirat sau a fost anulată. Cere instituției una nouă.');
        $existing = User::where('email', $invitation->email)->first();

        if ($existing) {
            $current = auth('sanctum')->user();
            abort_unless($current && (int) $current->id === (int) $existing->id, 401, 'Autentifică-te cu contul '.$invitation->email.' ca să accepți invitația.');
            $validated = $request->validate([
                'specialty_id' => ['nullable', Rule::exists('specialties', 'id')],
                'license_number' => ['nullable', 'string', 'max:255'],
            ]);
            $this->membership->acceptInvitation($invitation, $existing, $validated);

            return response()->json(['message' => 'Te-ai alăturat instituției '.$invitation->institution->name.'.']);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50', new ValidPhoneNumber],
            'password' => ['required', 'confirmed', Password::min(8)],
            'specialty_id' => [Rule::requiredIf(! $invitation->specialty_id), 'nullable', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
        ]);

        $user = DB::transaction(function () use ($invitation, $validated) {
            $role = Role::firstOrCreate(['name' => 'doctor'], ['label' => 'Medic']);
            $user = User::create([
                'name' => $validated['name'],
                'email' => $invitation->email,
                'phone' => $validated['phone'] ?? null,
                'password' => $validated['password'],
                'status' => 'active',
                'active_role_id' => $role->id,
            ]);
            $user->forceFill(['email_verified_at' => now()])->save();
            $user->roles()->sync([$role->id]);
            $this->membership->acceptInvitation($invitation, $user, $validated);

            return $user;
        });

        return response()->json([
            'message' => 'Contul a fost creat. Bine ai venit în echipa '.$invitation->institution->name.'!',
            'token' => $user->createToken('doctor-md-web')->plainTextToken,
        ], 201);
    }

    private function find(string $token): MedicalInstitutionInvitation
    {
        return MedicalInstitutionInvitation::with(['institution', 'specialty'])
            ->where('token_hash', MedicalInstitutionInvitation::hashToken($token))
            ->firstOr(fn () => abort(404, 'Invitația nu există.'));
    }
}
