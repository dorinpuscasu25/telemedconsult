<?php

namespace App\Services;

use App\Models\TrustedDevice;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * „Ține-mă minte 30 de zile”: un pacient care a confirmat codul din email pe un
 * dispozitiv nu mai primește cod la login de pe același dispozitiv timp de 30 de zile.
 *
 * Doar conturile care au exclusiv rolul de pacient; medicii, operatorii, coordonatorii,
 * instituțiile și adminii primesc codul la fiecare login.
 */
class TrustedDevices
{
    public const DAYS = 30;

    public function eligible(User $user): bool
    {
        $roles = $user->roles()->pluck('name');

        return $roles->isNotEmpty() && $roles->every(fn (string $role) => $role === 'patient');
    }

    /**
     * Creează un dispozitiv de încredere și întoarce tokenul în clar (o singură dată).
     */
    public function issue(User $user, ?string $userAgent): string
    {
        $token = Str::random(64);

        TrustedDevice::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'user_agent' => $userAgent ? Str::limit($userAgent, 250, '') : null,
            'last_used_at' => now(),
            'expires_at' => now()->addDays(self::DAYS),
        ]);

        return $token;
    }

    /**
     * Tokenul e valid pentru acest utilizator și neexpirat? Dacă da, îl marchează folosit.
     */
    public function recognizes(User $user, ?string $token): bool
    {
        if (! $token || ! $this->eligible($user)) {
            return false;
        }

        $device = TrustedDevice::where('token_hash', hash('sha256', $token))
            ->where('user_id', $user->id)
            ->where('expires_at', '>', now())
            ->first();

        if (! $device) {
            return false;
        }

        $device->forceFill(['last_used_at' => now()])->save();

        return true;
    }

    public function revokeAll(User $user): void
    {
        TrustedDevice::where('user_id', $user->id)->delete();
    }
}
