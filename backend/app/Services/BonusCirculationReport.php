<?php

namespace App\Services;

use App\Models\DoctorPromotion;
use App\Models\DoctorPromotionImpression;
use App\Models\Wallet;

class BonusCirculationReport
{
    public function build(FinancialReportScope $scope, array $issuanceTypes): array
    {
        $movements = $scope->transactions()->where('status', 'completed')
            ->whereHas('wallet', fn ($query) => $query->whereIn('type', [WalletLedger::POINTS, WalletLedger::PROMO]))
            ->selectRaw('type, SUM(CASE WHEN amount_minor > 0 THEN amount_minor ELSE 0 END) as credits, SUM(CASE WHEN amount_minor < 0 THEN -amount_minor ELSE 0 END) as debits, COUNT(*) as operations')
            ->groupBy('type')->get()->keyBy('type');
        $refundTypes = ['points_service_refund', 'promo_service_refund', 'promotion_budget_refund'];
        $transferTypes = ['consultation_points_income'];
        $debitTypes = ['points_service_hold', 'promo_service_hold', 'promotion_budget_hold', WalletAdjustment::TYPE_DEBIT];
        $knownCredits = [...$issuanceTypes, ...$refundTypes, ...$transferTypes];
        $unclassified = $movements->map(function ($row) use ($knownCredits, $debitTypes) {
            $credits = in_array($row->type, $knownCredits, true) ? 0 : (int) $row->credits;
            $debits = in_array($row->type, $debitTypes, true) ? 0 : (int) $row->debits;

            return ['type' => $row->type, 'credits' => $credits / 100, 'debits' => $debits / 100, 'operations' => (int) $row->operations];
        })->filter(fn (array $row) => $row['credits'] > 0 || $row['debits'] > 0)->values();
        $held = $scope->institutionRequests()->where('payment_status', 'held');

        return [
            'balances_by_role' => $scope->institutionId() ? [] : $this->balancesByRole(),
            'transferred_to_doctors' => (int) ($movements['consultation_points_income']->credits ?? 0) / 100,
            'used_for_services_points' => (int) $scope->consultations()->sum('points_amount_minor') / 100,
            'used_for_services_promo' => (int) $scope->consultations()->sum('promo_amount_minor') / 100,
            'promotion_spent' => $scope->institutionId() ? null : (int) $scope->period(DoctorPromotionImpression::query(), 'created_at')->sum('cost_minor') / 100,
            'promotion_reserved_current' => $scope->institutionId() ? null : (int) DoctorPromotion::where('status', 'active')->sum('remaining_minor') / 100,
            'held_services_points_current' => (int) (clone $held)->sum('points_amount_minor') / 100,
            'held_services_promo_current' => (int) (clone $held)->sum('promo_amount_minor') / 100,
            'refunds' => collect($refundTypes)->map(fn (string $type) => ['type' => $type, 'amount' => (int) ($movements[$type]->credits ?? 0) / 100])->values(),
            'unclassified_movements' => $unclassified,
        ];
    }

    /** Fiecare cont intră o singură dată în distribuție; rolul activ al interfeței nu schimbă grupa. */
    private function balancesByRole(): array
    {
        $labels = ['patient' => 'Pacienți fără rol medical', 'doctor' => 'Medici fără rol de operator', 'operator' => 'Operatori fără rol de medic', 'doctor_operator' => 'Medici și operatori', 'other' => 'Alte conturi'];
        $groups = collect($labels)->map(fn (string $label, string $key) => ['key' => $key, 'label' => $label, 'accounts' => [], 'points' => 0, 'promo' => 0])->all();
        Wallet::with(['user:id', 'user.roles:id,name'])->whereIn('type', [WalletLedger::POINTS, WalletLedger::PROMO])
            ->select(['id', 'user_id', 'type', 'balance_minor'])->chunkById(500, function ($wallets) use (&$groups) {
                foreach ($wallets as $wallet) {
                    $roles = $wallet->user?->roles->pluck('name')->all() ?? [];
                    $doctor = in_array('doctor', $roles, true);
                    $operator = in_array('operator', $roles, true);
                    $key = $doctor && $operator ? 'doctor_operator' : ($doctor ? 'doctor' : ($operator ? 'operator' : (in_array('patient', $roles, true) ? 'patient' : 'other')));
                    $groups[$key]['accounts'][$wallet->user_id] = true;
                    $groups[$key][$wallet->type] += (int) $wallet->balance_minor;
                }
            });

        return collect($groups)->map(fn (array $group) => [...$group, 'accounts' => count($group['accounts']), 'points' => $group['points'] / 100, 'promo' => $group['promo'] / 100])->values()->all();
    }
}
