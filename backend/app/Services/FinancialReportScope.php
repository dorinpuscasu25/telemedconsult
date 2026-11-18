<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\InstitutionEarning;
use App\Models\WalletTransaction;
use App\Models\WithdrawalRequest;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class FinancialReportScope
{
    public const RECOGNIZED_AT = "COALESCE((SELECT MIN(institution_earnings.created_at) FROM institution_earnings WHERE institution_earnings.consultation_request_id = consultation_requests.id), (SELECT MIN(wallet_transactions.created_at) FROM wallet_transactions WHERE wallet_transactions.consultation_request_id = consultation_requests.id AND wallet_transactions.type IN ('consultation_income', 'operator_exam_income', 'institution_consultation_income', 'platform_fee') AND wallet_transactions.status = 'completed'), consultation_requests.completed_at, consultation_requests.created_at)";

    public function __construct(public readonly array $filters = []) {}

    public function institutionId(): ?int
    {
        return ! empty($this->filters['institution_id']) ? (int) $this->filters['institution_id'] : null;
    }

    public function period(Builder $query, string $dateExpression): Builder
    {
        if (! empty($this->filters['from'])) {
            $from = CarbonImmutable::parse($this->filters['from'], 'Europe/Chisinau')->startOfDay()->setTimezone(config('app.timezone', 'UTC'));
            $query->whereRaw($dateExpression.' >= ?', [$from->toDateTimeString()]);
        }
        if (! empty($this->filters['to'])) {
            $until = CarbonImmutable::parse($this->filters['to'], 'Europe/Chisinau')->startOfDay()->addDay()->setTimezone(config('app.timezone', 'UTC'));
            $query->whereRaw($dateExpression.' < ?', [$until->toDateTimeString()]);
        }

        return $query;
    }

    public function earnings(): Builder
    {
        return $this->period(InstitutionEarning::query()->when($this->institutionId(), fn ($query, $id) => $query->where('medical_institution_id', $id)), 'institution_earnings.created_at');
    }

    /** Afilierea consemnată în ledger are prioritate față de snapshot; afilierea actuală nu atribuie trecutul. */
    public function institutionRequests(): Builder
    {
        return ConsultationRequest::query()->when($this->institutionId(), function ($query, $id) {
            $query->where(function ($requests) use ($id) {
                $requests->whereIn('consultation_requests.id', InstitutionEarning::where('medical_institution_id', $id)->select('consultation_request_id'))
                    ->orWhere(function ($withoutEarning) use ($id) {
                        $withoutEarning->whereNotIn('consultation_requests.id', InstitutionEarning::select('consultation_request_id'))
                            ->where('pricing_snapshot->institution_id', $id);
                    });
            });
        });
    }

    public function consultations(string $paymentStatus = 'captured'): Builder
    {
        return $this->period($this->institutionRequests()->where('payment_status', $paymentStatus), $paymentStatus === 'captured' ? self::RECOGNIZED_AT : 'consultation_requests.created_at');
    }

    public function transactions(): Builder
    {
        return $this->period(WalletTransaction::query()
            ->when($this->institutionId(), fn ($query) => $query->whereIn('consultation_request_id', $this->institutionRequests()->select('id'))), 'wallet_transactions.created_at');
    }

    public function withdrawals(?string $status = null): Builder
    {
        $query = WithdrawalRequest::where('payer', InstitutionLedger::PAYER_PLATFORM)
            ->when($this->institutionId(), fn ($query, $id) => $query->where('medical_institution_id', $id));
        if ($status !== null) {
            $query->where('status', $status);
        }

        return $query->where(function ($states) {
            $states->where(fn ($paid) => $this->period($paid->where('status', 'approved'), 'COALESCE(payout_sent_at, processed_at, created_at)'))
                ->orWhere(fn ($unpaid) => $this->period($unpaid->where('status', '!=', 'approved'), 'created_at'));
        });
    }
}
