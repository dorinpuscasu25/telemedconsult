<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\ReferralCommission;
use App\Models\WalletTransaction;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Cât valorează pacienții aduși de un invitator: cât au alimentat, cât au
 * cheltuit din banii reali și cât a încasat platforma de pe ei.
 *
 * Pe baza acestor cifre se decide plata operatorilor care aduc pacienți,
 * deci toate sumele sunt bani reali (fără bonusuri sau promoții) și doar
 * operațiuni încheiate: o consultație cu banii încă rezervați nu e cheltuită.
 *
 * Perioada (`from`, `to`) se aplică pe data fiecărei operațiuni, nu pe data
 * înregistrării pacientului.
 */
final class ReferralReport
{
    /** Plăți directe din portofelul real, fără rezervare. */
    private const DIRECT_TYPES = ['patient_card_purchase', 'chat_reactivation', 'operator_add_on'];

    /** Din acestea, cele încasate integral de platformă. */
    private const PLATFORM_TYPES = ['patient_card_purchase', 'chat_reactivation'];

    /**
     * @param  Collection<int, int>  $userIds  pacienții aduși
     * @return array<int, array{topups_minor:int, topup_count:int, first_topup_at:?string, spent_minor:int, reserved_minor:int, revenue_minor:int, consultations_count:int, commission_minor:int, last_activity_at:?string}>
     */
    public function forUsers(Collection $userIds, ?CarbonInterface $from = null, ?CarbonInterface $to = null): array
    {
        $ids = $userIds->map(fn ($id) => (int) $id)->unique()->values();
        $rows = $ids->mapWithKeys(fn (int $id) => [$id => [
            'topups_minor' => 0,
            'topup_count' => 0,
            'first_topup_at' => null,
            'spent_minor' => 0,
            'reserved_minor' => 0,
            'revenue_minor' => 0,
            'consultations_count' => 0,
            'commission_minor' => 0,
            'last_activity_at' => null,
        ]])->all();

        if ($ids->isEmpty()) {
            return $rows;
        }

        $inPeriod = function ($query, string $column = 'created_at') use ($from, $to) {
            return $query
                ->when($from, fn ($q) => $q->where($column, '>=', $from))
                ->when($to, fn ($q) => $q->where($column, '<=', $to));
        };

        // Alimentări și plăți directe (pachete, reactivări, servicii pe loc), în perioadă.
        $transactions = $inPeriod(WalletTransaction::query()
            ->whereIn('user_id', $ids)
            ->whereIn('type', ['top_up', ...self::DIRECT_TYPES])
            ->where('status', 'completed'))
            ->get(['id', 'user_id', 'type', 'amount_minor', 'consultation_request_id', 'created_at']);

        foreach ($transactions as $transaction) {
            $row = &$rows[(int) $transaction->user_id];
            $amount = (int) $transaction->amount_minor;
            $at = $transaction->created_at?->toIso8601String();

            if ($transaction->type === 'top_up') {
                $row['topups_minor'] += $amount;
                $row['topup_count']++;
                $row['first_topup_at'] = $row['first_topup_at'] && $row['first_topup_at'] < $at ? $row['first_topup_at'] : $at;
            } else {
                $row['spent_minor'] -= $amount;
                if (in_array($transaction->type, self::PLATFORM_TYPES, true)) {
                    $row['revenue_minor'] -= $amount;
                }
            }

            $row['last_activity_at'] = max($row['last_activity_at'] ?? '', $at) ?: null;
            unset($row);
        }

        // Consultațiile: banii reali rezervați minus cei returnați, socotiți pe
        // consultație (rezervarea și rambursarea pot cădea în luni diferite).
        // Încheiate = cheltuite în luna încheierii; deschise = doar rezervate.
        $requests = ConsultationRequest::query()
            ->whereIn('patient_id', $ids)
            ->whereIn('payment_status', ['held', 'captured', 'refunded'])
            ->get(['id', 'patient_id', 'payment_status', 'platform_fee_minor', 'updated_at']);
        $netByRequest = WalletTransaction::query()
            ->whereIn('consultation_request_id', $requests->pluck('id'))
            ->whereIn('type', ['service_hold', 'service_refund'])
            ->where('status', 'completed')
            ->selectRaw('consultation_request_id, sum(amount_minor) as net')
            ->groupBy('consultation_request_id')
            ->pluck('net', 'consultation_request_id');

        foreach ($requests as $request) {
            $row = &$rows[(int) $request->patient_id];
            $paid = max(0, -(int) ($netByRequest[$request->id] ?? 0));

            if ($request->payment_status === 'held') {
                $row['reserved_minor'] += $paid;
            } elseif ((! $from || $request->updated_at >= $from) && (! $to || $request->updated_at <= $to)) {
                $row['spent_minor'] += $paid;
                if ($request->payment_status === 'captured') {
                    $row['revenue_minor'] += (int) $request->platform_fee_minor;
                    $row['consultations_count']++;
                }
                $at = $request->updated_at?->toIso8601String();
                $row['last_activity_at'] = max($row['last_activity_at'] ?? '', (string) $at) ?: null;
            }
            unset($row);
        }

        // Partea platformei din serviciile suplimentare ale operatorului.
        $addOnRequests = $transactions->where('type', 'operator_add_on')->pluck('user_id', 'consultation_request_id');
        if ($addOnRequests->isNotEmpty()) {
            WalletTransaction::whereIn('consultation_request_id', $addOnRequests->keys())
                ->where('type', 'operator_add_on_income')
                ->get(['consultation_request_id', 'metadata'])
                ->each(function (WalletTransaction $income) use (&$rows, $addOnRequests) {
                    $patientId = (int) $addOnRequests[$income->consultation_request_id];
                    $rows[$patientId]['revenue_minor'] += (int) ($income->metadata['platform_fee_minor'] ?? 0);
                });
        }

        // Bonusurile de afiliere deja plătite invitatorului pentru acești pacienți.
        $inPeriod(ReferralCommission::query()->whereIn('referred_user_id', $ids))
            ->selectRaw('referred_user_id, sum(commission_amount_minor) as total')
            ->groupBy('referred_user_id')
            ->pluck('total', 'referred_user_id')
            ->each(function ($total, $userId) use (&$rows) {
                $rows[(int) $userId]['commission_minor'] = (int) $total;
            });

        return $rows;
    }

    /**
     * Totalurile unui grup de pacienți.
     *
     * @param  array<int, array<string, mixed>>  $rows  rezultatul `forUsers`
     */
    public function totals(array $rows): array
    {
        $rows = collect($rows);

        return [
            'topped_up_count' => $rows->where('topup_count', '>', 0)->count(),
            'spending_count' => $rows->where('spent_minor', '>', 0)->count(),
            'topups_minor' => (int) $rows->sum('topups_minor'),
            'spent_minor' => (int) $rows->sum('spent_minor'),
            'reserved_minor' => (int) $rows->sum('reserved_minor'),
            'revenue_minor' => (int) $rows->sum('revenue_minor'),
            'commission_minor' => (int) $rows->sum('commission_minor'),
            'consultations_count' => (int) $rows->sum('consultations_count'),
        ];
    }
}
