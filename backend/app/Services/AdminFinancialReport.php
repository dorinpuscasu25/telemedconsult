<?php

namespace App\Services;

use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\PatientCardPurchase;
use App\Models\Payment;
use App\Models\Wallet;
use App\Models\WithdrawalRequest;

class AdminFinancialReport
{
    private ?array $supplementary = null;

    public function __construct(private readonly FinancialReportScope $scope) {}

    public function summary(): array
    {
        $captured = $this->scope->consultations();
        $paidReal = (int) (clone $captured)->sum('real_amount_minor');
        $providerEarnings = (int) (clone $captured)->sum('provider_amount_minor');
        $extra = collect($this->supplementaryServices());

        return [
            'wallets_balance' => (int) Wallet::where('type', WalletLedger::REAL)->sum('balance_minor') / 100,
            'points_balance' => (int) Wallet::where('type', WalletLedger::POINTS)->sum('balance_minor') / 100,
            'top_ups' => $this->scope->institutionId() ? null : (int) $this->scope->period(Payment::where('purpose', 'wallet_top_up')->where('status', 'paid'), 'COALESCE(paid_at, created_at)')->sum('amount_minor') / 100,
            'pending_top_ups' => $this->scope->institutionId() ? null : (int) $this->scope->period(Payment::where('purpose', 'wallet_top_up')->where('status', 'pending'), 'created_at')->sum('amount_minor') / 100,
            'platform_fees' => round((int) (clone $captured)->sum('platform_fee_minor') / 100 + $extra->sum('retained_real'), 2),
            'medical_paid_real' => round($paidReal / 100 + $extra->sum('paid_real'), 2),
            'medical_provider_earnings' => round($providerEarnings / 100 + $extra->sum('provider_earnings'), 2),
            'medical_retained_real' => round(($paidReal - $providerEarnings) / 100 + $extra->sum('retained_real'), 2),
            'has_unclassified_medical' => (clone $captured)->whereRaw('amount_minor != real_amount_minor + points_amount_minor + promo_amount_minor')->exists() || $extra->contains(fn (array $row) => $row['unclassified_total'] != 0),
            'medical_held_real' => (int) $this->scope->consultations('held')->sum('real_amount_minor') / 100,
            'card_revenue' => $this->scope->institutionId() ? null : (int) $this->scope->period(PatientCardPurchase::query(), 'created_at')->sum('amount_minor') / 100,
            'pending_withdrawals' => (int) $this->scope->withdrawals('pending')->sum('amount_minor') / 100,
            'paid_withdrawals' => (int) $this->scope->withdrawals('approved')->selectRaw('COALESCE(SUM(COALESCE(approved_amount_minor, amount_minor)), 0) as total')->value('total') / 100,
        ];
    }

    /** Sumele și denumirile provin din rezervările decontate, inclusiv pentru servicii șterse. */
    public function byService(): array
    {
        $groups = [];
        $this->scope->consultations()
            ->select(['id', 'type', 'consultation_kind', 'amount_minor', 'real_amount_minor', 'points_amount_minor', 'promo_amount_minor', 'provider_amount_minor', 'pricing_snapshot'])
            ->chunkById(500, function ($requests) use (&$groups) {
                foreach ($requests as $item) {
                    $service = $item->pricing_snapshot['service'] ?? [];
                    $type = $service['type'] ?? match ($item->consultation_kind) {
                        'with_exam' => 'home',
                        'preliminary' => 'chat',
                        default => $item->type === 'operator' ? 'operator' : 'video',
                    };
                    $id = $service['id'] ?? null;
                    $key = $id ? 'service:'.$id : 'legacy:'.$type;
                    $name = $service['name'] ?? match ($type) {
                        'home' => 'Consultație cu examinare la domiciliu',
                        'chat' => 'Consultație în chat',
                        'operator' => 'Vizită operator',
                        default => 'Consultație video + chat',
                    };
                    $groups[$key] ??= ['key' => $key, 'service_id' => $id, 'name' => $name, 'historical_names' => [], 'type' => $type, 'count' => 0, 'total' => 0, 'paid_real' => 0, 'paid_points' => 0, 'paid_promo' => 0, 'provider_earnings' => 0, 'retained_real' => 0, 'unclassified_total' => 0];
                    $row = &$groups[$key];
                    $row['name'] = $name;
                    $row['historical_names'][$name] = $name;
                    $row['count']++;
                    $row['total'] += (int) $item->amount_minor;
                    $row['paid_real'] += (int) $item->real_amount_minor;
                    $row['paid_points'] += (int) $item->points_amount_minor;
                    $row['paid_promo'] += (int) $item->promo_amount_minor;
                    $row['provider_earnings'] += (int) $item->provider_amount_minor;
                    $row['retained_real'] += (int) $item->real_amount_minor - (int) $item->provider_amount_minor;
                    $row['unclassified_total'] += (int) $item->amount_minor - (int) $item->real_amount_minor - (int) $item->points_amount_minor - (int) $item->promo_amount_minor;
                    unset($row);
                }
            });

        return collect($groups)->map(function (array $row) {
            $row['historical_names'] = array_values($row['historical_names']);
            foreach (['total', 'paid_real', 'paid_points', 'paid_promo', 'provider_earnings', 'retained_real', 'unclassified_total'] as $column) {
                $row[$column] /= 100;
            }

            return $row;
        })->concat($this->supplementaryServices())->sortByDesc('total')->values()->all();
    }

    /** Aceste plăți au tranzacții proprii și nu sunt incluse în suma cererii de bază. */
    private function supplementaryServices(): array
    {
        if ($this->supplementary !== null) {
            return $this->supplementary;
        }
        $rows = [];
        foreach (['operator_add_on_income' => 'Servicii suplimentare operator', 'chat_reactivation' => 'Reactivare chat'] as $type => $name) {
            $row = ['key' => 'extra:'.$type, 'service_id' => null, 'name' => $name, 'historical_names' => [$name], 'type' => $type, 'count' => 0, 'total' => 0, 'paid_real' => 0, 'paid_points' => 0, 'paid_promo' => 0, 'provider_earnings' => 0, 'retained_real' => 0, 'unclassified_total' => 0];
            $this->scope->transactions()->where('type', $type)->where('status', 'completed')
                ->whereHas('wallet', fn ($query) => $query->where('type', WalletLedger::REAL))
                ->where('amount_minor', $type === 'chat_reactivation' ? '<' : '>=', 0)
                ->select(['id', 'amount_minor', 'metadata'])
                ->chunkById(500, function ($transactions) use (&$row, $type) {
                    foreach ($transactions as $transaction) {
                        $row['count']++;
                        $gross = $type === 'chat_reactivation' ? -(int) $transaction->amount_minor : (int) ($transaction->metadata['gross_amount_minor'] ?? 0);
                        $provider = $type === 'chat_reactivation' ? 0 : (int) $transaction->amount_minor;
                        $fee = $type === 'chat_reactivation' ? $gross : (int) ($transaction->metadata['platform_fee_minor'] ?? 0);
                        $row['total'] += $gross;
                        $row['paid_real'] += $gross;
                        $row['provider_earnings'] += $provider;
                        $row['retained_real'] += $fee;
                        $row['unclassified_total'] += $gross - $provider - $fee;
                    }
                });
            if ($row['count'] > 0) {
                foreach (['total', 'paid_real', 'paid_points', 'paid_promo', 'provider_earnings', 'retained_real', 'unclassified_total'] as $column) {
                    $row[$column] /= 100;
                }
                $rows[] = $row;
            }
        }

        return $this->supplementary = $rows;
    }

    /** Ledgerul instituției fixează atât instituția istorică, cât și împărțirea medic/instituție. */
    public function byInstitution(): array
    {
        $contributions = [];
        $this->scope->consultations()->leftJoin('institution_earnings as recognition', 'recognition.consultation_request_id', '=', 'consultation_requests.id')
            ->select(['consultation_requests.id', 'consultation_requests.pricing_snapshot', 'consultation_requests.amount_minor', 'consultation_requests.real_amount_minor', 'consultation_requests.points_amount_minor', 'consultation_requests.promo_amount_minor', 'consultation_requests.provider_amount_minor', 'recognition.medical_institution_id as recorded_institution_id', 'recognition.provider_amount_minor as recorded_provider_minor'])
            ->chunkById(500, function ($requests) use (&$contributions) {
                foreach ($requests as $request) {
                    $id = $request->recorded_institution_id ?? $request->pricing_snapshot['institution_id'] ?? null;
                    if (! $id) {
                        continue;
                    }
                    $contributions[$id] ??= ['paid_real' => 0, 'retained_real' => 0, 'request_count' => 0, 'unreconciled_count' => 0];
                    $provider = (int) ($request->recorded_provider_minor ?? $request->provider_amount_minor);
                    $contributions[$id]['paid_real'] += (int) $request->real_amount_minor;
                    $contributions[$id]['retained_real'] += (int) $request->real_amount_minor - $provider;
                    $contributions[$id]['request_count']++;
                    $contributions[$id]['unreconciled_count'] += (int) ($request->amount_minor != $request->real_amount_minor + $request->points_amount_minor + $request->promo_amount_minor
                        || $provider !== (int) $request->provider_amount_minor || (! $request->recorded_institution_id && $provider > 0));
                }
            }, 'consultation_requests.id', 'id');
        $rows = $this->scope->earnings()->with('institution:id,name')
            ->selectRaw('institution_earnings.medical_institution_id, COUNT(*) as consultations, SUM(institution_earnings.gross_amount_minor) as gross, SUM(institution_earnings.provider_amount_minor) as provider, SUM(doctor_amount_minor) as doctor_total, SUM(institution_amount_minor) as institution_total')
            ->groupBy('institution_earnings.medical_institution_id')->get();
        $missingIds = collect(array_keys($contributions))->merge([$this->scope->institutionId()])->filter()->unique()->diff($rows->pluck('medical_institution_id'));
        foreach (MedicalInstitution::whereIn('id', $missingIds)->get(['id', 'name']) as $institution) {
            $empty = new InstitutionEarning(['medical_institution_id' => $institution->id]);
            $rows->push($empty->setRelation('institution', $institution));
        }
        $ids = $rows->pluck('medical_institution_id');
        $allEarnings = InstitutionEarning::whereIn('medical_institution_id', $ids)->selectRaw('medical_institution_id, SUM(provider_amount_minor) as total')->groupBy('medical_institution_id')->pluck('total', 'medical_institution_id');
        $payments = WithdrawalRequest::where('payer', InstitutionLedger::PAYER_PLATFORM)->whereIn('medical_institution_id', $ids)->where('status', 'approved')
            ->selectRaw('medical_institution_id, SUM(COALESCE(approved_amount_minor, amount_minor)) as total')->groupBy('medical_institution_id')->pluck('total', 'medical_institution_id');
        $pending = WithdrawalRequest::where('payer', InstitutionLedger::PAYER_PLATFORM)->whereIn('medical_institution_id', $ids)->where('status', 'pending')
            ->selectRaw('medical_institution_id, SUM(amount_minor) as total')->groupBy('medical_institution_id')->pluck('total', 'medical_institution_id');

        return $rows->map(fn ($row) => [
            'id' => $row->medical_institution_id, 'name' => $row->institution?->name ?? 'Instituție indisponibilă',
            'consultations' => (int) $row->consultations, 'gross' => (int) $row->gross / 100,
            'provider' => (int) $row->provider / 100, 'doctor_total' => (int) $row->doctor_total / 100, 'institution_total' => (int) $row->institution_total / 100,
            'paid_real' => (int) ($contributions[$row->medical_institution_id]['paid_real'] ?? 0) / 100,
            'request_count' => (int) ($contributions[$row->medical_institution_id]['request_count'] ?? 0),
            'reconciliation_required' => ($contributions[$row->medical_institution_id]['unreconciled_count'] ?? 0) > 0 || (int) ($contributions[$row->medical_institution_id]['request_count'] ?? 0) < (int) $row->consultations,
            'retained_real' => ($contributions[$row->medical_institution_id]['unreconciled_count'] ?? 0) > 0 || (int) ($contributions[$row->medical_institution_id]['request_count'] ?? 0) < (int) $row->consultations ? null : (int) ($contributions[$row->medical_institution_id]['retained_real'] ?? 0) / 100,
            'balance_current' => max(0, (int) ($allEarnings[$row->medical_institution_id] ?? 0) - (int) ($payments[$row->medical_institution_id] ?? 0)) / 100,
            'pending_current' => (int) ($pending[$row->medical_institution_id] ?? 0) / 100,
        ])->values()->all();
    }
}
