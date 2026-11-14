<?php

namespace App\Services;

use App\Models\DoctorPromotion;
use App\Models\DoctorPromotionImpression;
use App\Models\User;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class DoctorPromotions
{
    public function start(User $doctor, int $points, int $days): DoctorPromotion
    {
        return DB::transaction(function () use ($doctor, $points, $days) {
            $doctor = User::with('doctorProfile')->whereKey($doctor->id)->lockForUpdate()->firstOrFail();
            abort_unless($doctor->status === 'active' && $doctor->doctorProfile?->is_approved, 403);
            abort_if(DoctorPromotion::where('doctor_id', $doctor->id)->where('status', 'active')->where('ends_at', '>', now())->exists(), 422, 'Ai deja o campanie activă.');
            $this->expire($doctor);
            $ledger = app(WalletLedger::class);
            $wallet = $ledger->locked($doctor, WalletLedger::POINTS);
            abort_if($wallet->balance_minor < $points * 100, 422, 'Nu ai suficiente puncte pentru acest buget.');
            $campaign = DoctorPromotion::create(['doctor_id' => $doctor->id, 'budget_minor' => $points * 100, 'remaining_minor' => $points * 100, 'ends_at' => now()->addDays($days)]);
            $ledger->move($wallet, -$points * 100, 'promotion_budget_hold', 'Buget rezervat pentru promovare', ['campaign_id' => $campaign->id]);

            return $campaign;
        }, attempts: 3);
    }

    public function stop(User $doctor, DoctorPromotion $campaign): void
    {
        DB::transaction(function () use ($doctor, $campaign): void {
            User::whereKey($doctor->id)->lockForUpdate()->firstOrFail();
            $campaign = DoctorPromotion::whereKey($campaign->id)->lockForUpdate()->firstOrFail();
            abort_unless($campaign->doctor_id === $doctor->id, 404);
            if ($campaign->status !== 'active') {
                return;
            }
            $ledger = app(WalletLedger::class);
            if ($campaign->remaining_minor > 0) {
                $ledger->move($ledger->locked($doctor, WalletLedger::POINTS), $campaign->remaining_minor, 'promotion_budget_refund', 'Puncte neutilizate din promovare', ['campaign_id' => $campaign->id]);
            }
            $campaign->update(['status' => 'cancelled', 'remaining_minor' => 0]);
        }, attempts: 3);
    }

    public function expire(User $doctor): void
    {
        DoctorPromotion::where('doctor_id', $doctor->id)->where('status', 'active')->where('ends_at', '<=', now())->get()->each(fn ($campaign) => $this->stop($doctor, $campaign));
    }

    public function arrange(Collection $doctors, User $viewer): Collection
    {
        $campaigns = DoctorPromotion::whereIn('doctor_id', $doctors->pluck('id'))->where('doctor_id', '!=', $viewer->id)->where('status', 'active')->where('remaining_minor', '>=', 100)->where('ends_at', '>', now())->get();
        $campaigns = $campaigns->sortBy(fn ($campaign) => hash_hmac('sha256', $viewer->id.':'.$campaign->id.':'.intdiv(now()->timestamp, 1800), config('app.key')))->take(18);
        $slots = [];
        $organic = $doctors->keyBy('id');
        $groups = max(1, min(3, (int) ceil($doctors->count() / 6)));
        $offset = hexdec(substr(hash_hmac('sha256', $viewer->id.':'.intdiv(now()->timestamp, 1800), config('app.key')), 0, 6)) % $groups;
        $available = collect(range(0, min(17, $doctors->count() - 1)))->sortBy(fn ($i) => ($i % 6) * 3 + ((intdiv($i, 6) + $offset) % $groups))->values();
        foreach ($campaigns->values() as $index => $campaign) {
            $slot = $available[$index] ?? null;
            if ($slot === null) {
                break;
            }
            $doctor = $organic->get((string) $campaign->doctor_id);
            if (! $doctor) {
                continue;
            }
            $token = Crypt::encryptString(json_encode(['viewer' => $viewer->id, 'campaign' => $campaign->id, 'position' => $slot + 1, 'expires' => now()->addMinutes(30)->timestamp], JSON_THROW_ON_ERROR));
            $slots[$slot] = [...$doctor, 'promoted' => true, 'promotion_token' => $token];
            $organic->forget((string) $campaign->doctor_id);
        }
        $organic = $organic->values();
        $result = [];
        $next = 0;
        for ($index = 0; $index < $doctors->count(); $index++) {
            $result[] = $slots[$index] ?? $organic[$next++];
        }

        return collect($result);
    }

    public function impression(User $viewer, string $token): bool
    {
        try {
            $data = json_decode(Crypt::decryptString($token), true, flags: JSON_THROW_ON_ERROR);
        } catch (DecryptException|\JsonException $e) {
            abort(422, 'Afișare invalidă.');
        }
        abort_unless(($data['viewer'] ?? null) === $viewer->id && ($data['expires'] ?? 0) >= now()->timestamp, 422, 'Afișarea a expirat.');
        $campaign = DoctorPromotion::findOrFail($data['campaign']);

        return DB::transaction(function () use ($viewer, $campaign, $data): bool {
            $doctor = User::with('doctorProfile')->whereKey($campaign->doctor_id)->lockForUpdate()->firstOrFail();
            if ($doctor->status !== 'active' || ! $doctor->doctorProfile?->is_approved) {
                return false;
            }
            $campaign = DoctorPromotion::whereKey($campaign->id)->lockForUpdate()->firstOrFail();
            if ($campaign->status !== 'active' || $campaign->ends_at->isPast() || $campaign->remaining_minor < 100 || $campaign->doctor_id === $viewer->id) {
                return false;
            }
            if (DoctorPromotionImpression::where('doctor_id', $campaign->doctor_id)->where('viewer_id', $viewer->id)->where('created_at', '>', now()->subMinutes(30))->exists()) {
                return false;
            }
            DoctorPromotionImpression::create(['doctor_promotion_id' => $campaign->id, 'doctor_id' => $campaign->doctor_id, 'viewer_id' => $viewer->id, 'position' => $data['position'], 'cost_minor' => 100]);
            $campaign->decrement('remaining_minor', 100);
            if ($campaign->remaining_minor === 0) {
                $campaign->update(['status' => 'completed']);
            }

            return true;
        }, attempts: 3);
    }
}
