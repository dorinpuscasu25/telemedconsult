<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Models\ReferralCommission;
use App\Models\User;
use App\Services\ReferralProgram;
use App\Services\ReferralReport;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReferralController extends Controller
{
    /** Rolurile care pot invita pacienți prin link personal. */
    public const REFERRER_ROLES = ['patient', 'operator', 'doctor', 'admin'];

    /**
     * Statistica de afiliere per invitator, pentru admin: câți pacienți a adus
     * fiecare, câți au alimentat, cât au alimentat și cheltuit și cât a încasat
     * platforma de pe ei. Cu `from`/`to` (Y-m-d) sumele sunt doar din perioadă,
     * iar „aduși în perioadă” numără înregistrările din ea.
     */
    public function adminStats(Request $request, ReferralReport $report): JsonResponse
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
        [$from, $to] = $this->period($request);
        $role = $request->query('role');

        $referrers = User::query()
            ->whereIn('id', Referral::select('referrer_id'))
            ->when($role, fn ($query, string $role) => $query->whereHas('roles', fn ($roles) => $roles->where('name', $role)))
            ->with('roles:id,name')
            ->get(['id', 'name', 'email', 'referral_code']);
        $referrals = Referral::whereIn('referrer_id', $referrers->pluck('id'))->get(['referrer_id', 'referred_user_id', 'created_at']);
        $money = $report->forUsers($referrals->pluck('referred_user_id'), $from, $to);

        $rows = $referrers->map(function (User $user) use ($referrals, $money, $report, $from, $to) {
            $own = $referrals->where('referrer_id', $user->id);
            $totals = $report->totals(array_intersect_key($money, array_flip($own->pluck('referred_user_id')->all())));

            return [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'roles' => $user->roles->pluck('name')->values(),
                'code' => $user->referral_code,
                'invited_count' => $own->count(),
                'invited_in_period' => $own->filter(fn (Referral $referral) => (! $from || $referral->created_at >= $from) && (! $to || $referral->created_at <= $to))->count(),
                'active_count' => $totals['topped_up_count'],
                'spending_count' => $totals['spending_count'],
                'topups_total' => $totals['topups_minor'] / 100,
                'spent_total' => $totals['spent_minor'] / 100,
                'revenue_total' => $totals['revenue_minor'] / 100,
                'earned_total' => $totals['commission_minor'] / 100,
            ];
        })->sortByDesc('invited_count')->values();

        return response()->json(['data' => $rows, 'period' => $this->periodPayload($from, $to)]);
    }

    /**
     * Un invitator în detaliu, pentru admin: fiecare pacient adus, cu numele
     * real, data înregistrării, alimentările, cheltuielile și venitul platformei.
     */
    public function adminReferrer(Request $request, User $user, ReferralReport $report): JsonResponse
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
        [$from, $to] = $this->period($request);

        $referrals = Referral::where('referrer_id', $user->id)
            ->with(['referredUser:id,name,email,phone,created_at', 'referredUser.patientProfiles:id,user_id'])
            ->latest()
            ->get();
        $money = $report->forUsers($referrals->pluck('referred_user_id'), $from, $to);

        $patients = $referrals->map(function (Referral $referral) use ($money) {
            $row = $money[(int) $referral->referred_user_id] ?? [];

            return [
                'id' => $referral->referred_user_id,
                'name' => $referral->referredUser?->name ?? 'Cont șters',
                'email' => $referral->referredUser?->email,
                'phone' => $referral->referredUser?->phone,
                'registered_at' => $referral->created_at,
                'profiles_count' => $referral->referredUser?->patientProfiles->count() ?? 0,
                'topup_count' => $row['topup_count'] ?? 0,
                'first_topup_at' => $row['first_topup_at'] ?? null,
                'topups_total' => ($row['topups_minor'] ?? 0) / 100,
                'spent_total' => ($row['spent_minor'] ?? 0) / 100,
                'reserved_total' => ($row['reserved_minor'] ?? 0) / 100,
                'revenue_total' => ($row['revenue_minor'] ?? 0) / 100,
                'consultations_count' => $row['consultations_count'] ?? 0,
                'commission_total' => ($row['commission_minor'] ?? 0) / 100,
                'last_activity_at' => $row['last_activity_at'] ?? null,
            ];
        })->values();
        $totals = $report->totals($money);

        return response()->json([
            'referrer' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'roles' => $user->loadMissing('roles')->roles->pluck('name')->values(),
                'code' => $user->referral_code,
            ],
            'period' => $this->periodPayload($from, $to),
            'totals' => [
                'invited_count' => $referrals->count(),
                'invited_in_period' => $referrals->filter(fn (Referral $referral) => (! $from || $referral->created_at >= $from) && (! $to || $referral->created_at <= $to))->count(),
                'topped_up_count' => $totals['topped_up_count'],
                'spending_count' => $totals['spending_count'],
                'consultations_count' => $totals['consultations_count'],
                'topups_total' => $totals['topups_minor'] / 100,
                'spent_total' => $totals['spent_minor'] / 100,
                'reserved_total' => $totals['reserved_minor'] / 100,
                'revenue_total' => $totals['revenue_minor'] / 100,
                'commission_total' => $totals['commission_minor'] / 100,
            ],
            'patients' => $patients,
        ]);
    }

    /** @return array{0: ?Carbon, 1: ?Carbon} */
    private function period(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        return [
            isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : null,
            isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : null,
        ];
    }

    private function periodPayload(?Carbon $from, ?Carbon $to): array
    {
        return ['from' => $from?->toDateString(), 'to' => $to?->toDateString()];
    }

    public function show(Request $request, ReferralProgram $program, ReferralReport $report): JsonResponse
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

        // Un invitat e "activ" după prima alimentare confirmată, chiar dacă
        // procentul de comision e 0 și nu a generat bonus.
        $money = $report->forUsers($referrals->pluck('referred_user_id'));
        $totals = $report->totals($money);
        $activeIds = collect($money)->filter(fn (array $row) => $row['topup_count'] > 0)->keys();

        return response()->json([
            'enabled' => $program->acceptsReferrer($user),
            'bonus_enabled' => $program->enabled(),
            'code' => $code,
            'referral_link' => $frontendUrl.'/register?ref='.$code,
            'commission_rate' => $program->ratePercent(),
            'minimum_topup' => $program->minimumAmount(),
            'first_deposit_only' => $program->firstDepositOnly(),
            'currency' => 'MDL',
            'rules' => $program->rules(),
            'stats' => [
                'invited_count' => $referrals->count(),
                'active_count' => $activeIds->count(),
                'pending_count' => $referrals->count() - $activeIds->count(),
                'spending_count' => $totals['spending_count'],
                'topups_total' => $totals['topups_minor'] / 100,
                'spent_total' => $totals['spent_minor'] / 100,
                'earned_total' => $commissions->sum('commission_amount_minor') / 100,
                'commission_count' => $commissions->count(),
                'invited_this_month' => $referrals->where('created_at', '>=', now()->startOfMonth())->count(),
            ],
            'latest_referrals' => $referrals->take(50)->map(function (Referral $referral) use ($commissions, $money) {
                $own = $commissions->where('referral_id', $referral->id);
                $row = $money[(int) $referral->referred_user_id] ?? ['topup_count' => 0, 'topups_minor' => 0, 'spent_minor' => 0];

                return [
                    'id' => $referral->id,
                    'name' => $this->maskedName($referral->referredUser?->name),
                    'email' => $this->maskedEmail($referral->referredUser?->email),
                    'status' => $row['topup_count'] > 0 ? 'earning' : 'waiting_topup',
                    'topups_total' => $row['topups_minor'] / 100,
                    'spent_total' => $row['spent_minor'] / 100,
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
