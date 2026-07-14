<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Services\PlatformConfig;
use App\Services\ReferralProgram;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReferralController extends Controller
{
    public function show(Request $request, ReferralProgram $program): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless($user->hasRole('patient') || $user->hasRole('admin'), 403, 'Ai nevoie de rol pacient.');

        $code = $program->ensureCode($user);
        $referrals = Referral::where('referrer_id', $user->id)
            ->with('referredUser:id,name,email')
            ->latest()
            ->get();

        $rewarded = $referrals->where('status', Referral::STATUS_REWARDED);
        $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return response()->json([
            'enabled' => $program->enabled(),
            'code' => $code,
            'referral_link' => $frontendUrl.'/register?ref='.$code,
            'reward_amount' => max(0, app(PlatformConfig::class)->number(ReferralProgram::REWARD_SETTING, 0)),
            'currency' => 'MDL',
            'rules' => app(PlatformConfig::class)->get(ReferralProgram::RULES_SETTING),
            'stats' => [
                'invited_count' => $referrals->count(),
                'rewarded_count' => $rewarded->count(),
                'pending_count' => $referrals->where('status', Referral::STATUS_PENDING)->count(),
                'earned_total' => $rewarded->sum('reward_amount_minor') / 100,
            ],
            'latest_referrals' => $referrals->take(10)->map(fn (Referral $referral) => [
                'id' => $referral->id,
                'name' => $this->maskedName($referral->referredUser?->name),
                'email' => $this->maskedEmail($referral->referredUser?->email),
                'status' => $referral->status,
                'reward_amount' => $referral->status === Referral::STATUS_REWARDED ? $referral->reward_amount_minor / 100 : 0,
                'created_at' => $referral->created_at,
            ])->values(),
        ]);
    }

    private function maskedName(?string $name): string
    {
        if (! $name) {
            return 'Utilizator';
        }

        return collect(preg_split('/\s+/', trim($name)) ?: [])
            ->filter()
            ->map(fn (string $part) => Str::substr($part, 0, 1).str_repeat('*', max(2, Str::length($part) - 1)))
            ->join(' ');
    }

    private function maskedEmail(?string $email): string
    {
        if (! $email || ! str_contains($email, '@')) {
            return 'email ascuns';
        }

        [$local, $domain] = explode('@', $email, 2);

        return Str::substr($local, 0, 1).str_repeat('*', max(3, Str::length($local) - 1)).'@'.$domain;
    }
}
