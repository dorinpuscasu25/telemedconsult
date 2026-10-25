<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\User;
use App\Models\WithdrawalRequest;
use Illuminate\Support\Facades\DB;

/**
 * Banii care trec prin instituții medicale.
 *
 * Platforma își reține comisionul exact ca la orice medic (`provider_amount_minor`
 * rămâne neschimbat). Ce rămâne se împarte între medic și instituție, iar
 * platforma îi datorează instituției întreaga sumă rămasă; instituția își
 * plătește apoi medicii. De aceea există două „solduri”:
 *
 * - soldul instituției la platformă = tot ce s-a câștigat prin ea minus plățile
 *   aprobate de admin către instituție;
 * - soldul medicului la instituție = partea lui minus plățile aprobate de instituție.
 */
class InstitutionLedger
{
    public const PAYER_PLATFORM = 'platform';

    public const PAYER_INSTITUTION = 'institution';

    /**
     * Fixează împărțirea pentru o consultație finalizată de un medic afiliat.
     * Idempotent: o consultație are cel mult o înregistrare.
     */
    public function recordEarning(ConsultationRequest $consultationRequest, User $doctor): ?InstitutionEarning
    {
        $profile = $doctor->doctorProfile()->with('medicalInstitution')->first();
        if (! $profile?->medical_institution_id || $consultationRequest->provider_amount_minor <= 0) {
            return null;
        }

        $providerMinor = (int) $consultationRequest->provider_amount_minor;
        $sharePercent = min(100, max(0, (float) $profile->effectiveInstitutionSharePercent()));
        $doctorMinor = (int) round($providerMinor * $sharePercent / 100);

        return InstitutionEarning::firstOrCreate(
            ['consultation_request_id' => $consultationRequest->id],
            [
                'medical_institution_id' => $profile->medical_institution_id,
                'doctor_id' => $doctor->id,
                'gross_amount_minor' => (int) $consultationRequest->amount_minor,
                'provider_amount_minor' => $providerMinor,
                'doctor_share_percent' => $sharePercent,
                'doctor_amount_minor' => $doctorMinor,
                'institution_amount_minor' => $providerMinor - $doctorMinor,
                'currency' => 'MDL',
            ],
        );
    }

    /** Cât îi datorează instituția medicului (câștigat minus plătit). */
    public function doctorBalanceMinor(int $institutionId, int $doctorId, ?int $exceptWithdrawalId = null): int
    {
        $earned = (int) InstitutionEarning::where('medical_institution_id', $institutionId)
            ->where('doctor_id', $doctorId)
            ->sum('doctor_amount_minor');

        return max(0, $earned - $this->paidMinor(
            WithdrawalRequest::where('payer', self::PAYER_INSTITUTION)
                ->where('medical_institution_id', $institutionId)
                ->where('user_id', $doctorId),
            $exceptWithdrawalId,
        ));
    }

    /** Suma cerută de medic de la instituție și încă neprocesată. */
    public function doctorPendingMinor(int $institutionId, int $doctorId): int
    {
        return (int) WithdrawalRequest::where('payer', self::PAYER_INSTITUTION)
            ->where('medical_institution_id', $institutionId)
            ->where('user_id', $doctorId)
            ->where('status', 'pending')
            ->sum('amount_minor');
    }

    /** Cât îi datorează platforma instituției. */
    public function institutionBalanceMinor(int $institutionId, ?int $exceptWithdrawalId = null): int
    {
        $earned = (int) InstitutionEarning::where('medical_institution_id', $institutionId)->sum('provider_amount_minor');

        return max(0, $earned - $this->paidMinor(
            WithdrawalRequest::where('payer', self::PAYER_PLATFORM)->where('medical_institution_id', $institutionId),
            $exceptWithdrawalId,
        ));
    }

    public function institutionPendingMinor(int $institutionId): int
    {
        return (int) WithdrawalRequest::where('payer', self::PAYER_PLATFORM)
            ->where('medical_institution_id', $institutionId)
            ->where('status', 'pending')
            ->sum('amount_minor');
    }

    /** Totalul datorat de instituție tuturor medicilor ei. */
    public function owedToDoctorsMinor(int $institutionId): int
    {
        $earned = (int) InstitutionEarning::where('medical_institution_id', $institutionId)->sum('doctor_amount_minor');

        return max(0, $earned - $this->paidMinor(
            WithdrawalRequest::where('payer', self::PAYER_INSTITUTION)->where('medical_institution_id', $institutionId),
        ));
    }

    /**
     * Soldul medicului la platformă: consultațiile care NU au trecut printr-o
     * instituție, minus extragerile plătite de platformă. Păstrează regula
     * existentă (suma consultațiilor finalizate) pentru medicii independenți.
     */
    public function platformDoctorBalanceMinor(int $doctorId, ?int $exceptWithdrawalId = null): int
    {
        $revenueMinor = (int) round((float) DB::table('consultations')
            ->where('doctor_id', $doctorId)
            ->where('status', 'completed')
            ->whereNotIn('consultation_request_id', InstitutionEarning::select('consultation_request_id')->where('doctor_id', $doctorId))
            ->sum('price') * 100);

        return max(0, $revenueMinor - $this->paidMinor(
            WithdrawalRequest::where('payer', self::PAYER_PLATFORM)
                ->whereNull('medical_institution_id')
                ->where('user_id', $doctorId),
            $exceptWithdrawalId,
        ));
    }

    /**
     * @return array{earned_total: float, institution_total: float, doctors_total: float, owed_to_doctors: float, platform_balance: float, platform_pending: float}
     */
    public function summary(MedicalInstitution $institution): array
    {
        $earnings = InstitutionEarning::where('medical_institution_id', $institution->id);

        return [
            'earned_total' => (int) (clone $earnings)->sum('provider_amount_minor') / 100,
            'institution_total' => (int) (clone $earnings)->sum('institution_amount_minor') / 100,
            'doctors_total' => (int) (clone $earnings)->sum('doctor_amount_minor') / 100,
            'owed_to_doctors' => $this->owedToDoctorsMinor($institution->id) / 100,
            'platform_balance' => $this->institutionBalanceMinor($institution->id) / 100,
            'platform_pending' => $this->institutionPendingMinor($institution->id) / 100,
        ];
    }

    private function paidMinor($query, ?int $exceptWithdrawalId = null): int
    {
        return (int) $query
            ->where('status', 'approved')
            ->when($exceptWithdrawalId, fn ($builder) => $builder->whereKeyNot($exceptWithdrawalId))
            ->selectRaw('COALESCE(SUM(COALESCE(approved_amount_minor, amount_minor)), 0) as total')
            ->value('total');
    }
}
