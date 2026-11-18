<?php

namespace App\Services;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\DoctorPromotionImpression;
use App\Models\DoctorReview;
use App\Models\PlatformSetting;
use App\Models\WalletTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class DoctorPerformance
{
    public const DEFAULT_WEIGHTS = ['current_consultation' => 4, 'previous_consultation' => 1.5, 'current_rating' => 10, 'previous_rating' => 5, 'response_max' => 100, 'response_decrement' => 5, 'promotion_spend' => 0.1];

    public function forDoctor(DoctorProfile $profile): array
    {
        return $this->forProfiles(collect([$profile]))[$profile->user_id];
    }

    public function forProfiles(Collection $profiles, ?string $period = null): array
    {
        $ids = $profiles->pluck('user_id');
        if ($ids->isEmpty()) {
            return [];
        }
        $month = $period ? CarbonImmutable::parse($period.'-01', 'Europe/Chisinau')->startOfMonth() : CarbonImmutable::now('Europe/Chisinau')->startOfMonth();
        $start = $month->setTimezone(config('app.timezone'))->toDateTimeString();
        $end = $month->addMonth()->setTimezone(config('app.timezone'))->toDateTimeString();
        $consultations = Consultation::whereIn('doctor_id', $ids)->where('status', 'completed')->where('completed_at', '<', $end)
            ->selectRaw('doctor_id, SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END) as current_total, SUM(CASE WHEN completed_at < ? THEN 1 ELSE 0 END) as previous_total', [$start, $start])->groupBy('doctor_id')->get()->keyBy('doctor_id');
        $ratings = DoctorReview::whereIn('doctor_id', $ids)->where('created_at', '<', $end)
            ->selectRaw('doctor_id, SUM(CASE WHEN created_at >= ? THEN rating ELSE 0 END) as current_total, SUM(CASE WHEN created_at < ? THEN rating ELSE 0 END) as previous_total', [$start, $start])->groupBy('doctor_id')->get()->keyBy('doctor_id');
        $responses = ConsultationRequest::whereIn('doctor_id', $ids)->whereNotNull('doctor_responded_at')->where('doctor_responded_at', '<', $end)
            ->selectRaw('doctor_id, AVG(doctor_response_minutes) as average_minutes')->groupBy('doctor_id')->pluck('average_minutes', 'doctor_id');
        $promotionSpend = DoctorPromotionImpression::whereIn('doctor_id', $ids)->where('created_at', '<', $end)
            ->selectRaw('doctor_id, SUM(cost_minor) as total')->groupBy('doctor_id')->pluck('total', 'doctor_id');
        $referralPoints = WalletTransaction::whereIn('user_id', $ids)->where('wallet_type', WalletLedger::POINTS)->where('type', 'referral_topup_commission')->where('status', 'completed')->where('created_at', '<', $end)
            ->selectRaw('user_id, SUM(amount_minor) as total')->groupBy('user_id')->pluck('total', 'user_id');
        $settings = PlatformSetting::whereIn('key', array_map(fn ($key) => 'performance.'.$key, array_keys(self::DEFAULT_WEIGHTS)))->get()->pluck('value', 'key');
        $weights = collect(self::DEFAULT_WEIGHTS)->mapWithKeys(fn ($value, $key) => [$key => max(0, min(1000, (float) $settings->get('performance.'.$key, $value)))])->all();

        return $profiles->mapWithKeys(function (DoctorProfile $profile) use ($consultations, $ratings, $responses, $promotionSpend, $referralPoints, $weights, $month): array {
            $id = $profile->user_id;
            $current = (int) ($consultations->get($id)?->current_total ?? 0);
            $previous = (int) ($consultations->get($id)?->previous_total ?? 0);
            $currentRating = (int) ($ratings->get($id)?->current_total ?? 0);
            $previousRating = (int) ($ratings->get($id)?->previous_total ?? 0);
            $response = $responses->get($id);
            $average = $response !== null ? round((float) $response, 2) : null;
            $components = [
                'current_month' => $current * $weights['current_consultation'], 'previous_consultations' => $previous * $weights['previous_consultation'],
                'rating' => $currentRating * $weights['current_rating'] + $previousRating * $weights['previous_rating'],
                'response' => $average === null ? 0 : max(0, $weights['response_max'] - max(0, ceil($average / 10) - 1) * $weights['response_decrement']),
                'promotion' => (int) $promotionSpend->get($id, 0) / 100 * $weights['promotion_spend'],
            ];

            return [$id => [
                'score' => round(array_sum($components), 2), 'current_month_consultations' => $current, 'previous_total_consultations' => $previous,
                'rating' => (float) $profile->rating, 'current_rating_sum' => $currentRating, 'previous_rating_sum' => $previousRating,
                'promotion_points_spent' => (int) $promotionSpend->get($id, 0) / 100,
                'referral_points_earned' => (int) $referralPoints->get($id, 0) / 100,
                'average_response_minutes' => $average, 'components' => $components, 'response_uses_default' => $average === null,
                'weights' => $weights, 'response_step_minutes' => 10, 'period' => $month->format('Y-m'), 'timezone' => 'Europe/Chisinau',
            ]];
        })->all();
    }

    public function leaderboard(?string $period = null): Collection
    {
        $profiles = DoctorProfile::with('user')->where('is_approved', true)->whereHas('user', fn ($query) => $query->where('status', 'active'))->get();
        $scores = $this->forProfiles($profiles, $period);

        return $profiles->map(fn ($profile) => ['doctor_id' => $profile->user_id, 'doctor' => $profile->user->name, ...$scores[$profile->user_id]])
            ->sort(fn ($a, $b) => ($b['score'] <=> $a['score']) ?: ($a['doctor_id'] <=> $b['doctor_id']))->values()
            ->map(fn ($row, $index) => ['position' => $index + 1, ...$row]);
    }
}
