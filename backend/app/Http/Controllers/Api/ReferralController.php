<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Models\ReferralCommission;
use App\Models\User;
use App\Services\ReferralProgram;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReferralController extends Controller
{
    /** Rolurile care pot invita pacienți prin link personal. */
    public const REFERRER_ROLES = ['patient', 'operator', 'doctor', 'admin'];

    /**
     * Statistica de afiliere per invitator, pentru admin: câți a adus fiecare,
     * câți au alimentat, cât au alimentat și câte bonusuri a primit invitatorul.
     */
    public function adminStats(Request $request): JsonResponse
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
        $role = $request->query('role');

        $referrers = User::query()
            ->whereIn('id', Referral::select('referrer_id'))
            ->when($role, fn ($query, string $role) => $query->whereHas('roles', fn ($roles) => $roles->where('name', $role)))
            ->with('roles:id,name')
            ->get(['id', 'name', 'email', 'referral_code']);
        $ids = $referrers->pluck('id');
        $invited = Referral::whereIn('referrer_id', $ids)->selectRaw('referrer_id, count(*) as total')->groupBy('referrer_id')->pluck('total', 'referrer_id');
        $commissions = ReferralCommission::whereIn('referrer_id', $ids)
            ->selectRaw('referrer_id, count(distinct referred_user_id) as active, sum(deposit_amount_minor) as deposits, sum(commission_amount_minor) as earned')
            ->groupBy('referrer_id')->get()->keyBy('referrer_id');

        $rows = $referrers->map(fn (User $user) => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'roles' => $user->roles->pluck('name')->values(),
            'code' => $user->referral_code,
            'invited_count' => (int) ($invited[$user->id] ?? 0),
            'active_count' => (int) ($commissions[$user->id]->active ?? 0),
            'topups_total' => (int) ($commissions[$user->id]->deposits ?? 0) / 100,
            'earned_total' => (int) ($commissions[$user->id]->earned ?? 0) / 100,
        ])->sortByDesc('invited_count')->values();

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, ReferralProgram $program): JsonResponse
    {
        $user = $request->user()->loadMissing('roles');
        abort_unless(collect(self::REFERRER_ROLES)->contains(fn (string $role) => $user->hasRole($role)), 403, 'Programul de afiliere nu este disponibil pentru rolul tău.');

        $code = $program->ensureCode($user);
        $referrals = Referral::where('referrer_id', $user->id)
            ->with('referredUser:id,name,email')
            ->latest()
            ->get();

        $commissions = ReferralCommission::where('referrer_id', $user->id)->get();
        $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        // Un invitat devine "activ" din momentul în care a generat cel puțin un
        // comision, adică a făcut cel puțin o alimentare confirmată.
        $earningReferralIds = $commissions->pluck('referral_id')->unique();

        return response()->json([
            'enabled' => $program->enabled(),
            'code' => $code,
            'referral_link' => $frontendUrl.'/register?ref='.$code,
            'commission_rate' => $program->ratePercent(),
            'minimum_topup' => $program->minimumAmount(),
            'first_deposit_only' => $program->firstDepositOnly(),
            'currency' => 'MDL',
            'rules' => $program->rules(),
            'stats' => [
                'invited_count' => $referrals->count(),
                'active_count' => $earningReferralIds->count(),
                'pending_count' => $referrals->whereNotIn('id', $earningReferralIds->all())->count(),
                'earned_total' => $commissions->sum('commission_amount_minor') / 100,
                'commission_count' => $commissions->count(),
            ],
            'latest_referrals' => $referrals->take(10)->map(function (Referral $referral) use ($commissions) {
                $own = $commissions->where('referral_id', $referral->id);

                return [
                    'id' => $referral->id,
                    'name' => $this->maskedName($referral->referredUser?->name),
                    'email' => $this->maskedEmail($referral->referredUser?->email),
                    'status' => $own->isNotEmpty() ? 'earning' : 'waiting_topup',
                    'earned_total' => $own->sum('commission_amount_minor') / 100,
                    'commission_count' => $own->count(),
                    'created_at' => $referral->created_at,
                ];
            })->values(),
            'latest_commissions' => $commissions->sortByDesc('created_at')->take(10)->map(fn (ReferralCommission $commission) => [
                'id' => $commission->id,
                'deposit_amount' => $commission->deposit_amount_minor / 100,
                'commission_amount' => $commission->commission_amount_minor / 100,
                'rate_percent' => $commission->rate_percent,
                'currency' => $commission->currency,
                'created_at' => $commission->created_at,
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
