<?php

namespace App\Services;

use App\Models\OperatorCapability;
use App\Models\OperatorCoverage;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Automatic operator assignment for `with_exam` consultations (spec §6).
 * Nobody picks the operator manually — this service filters eligible operators
 * (AS1) and selects deterministically (AS3): proximity → load → rating → id.
 */
class OperatorAssignmentService
{
    /**
     * @param  list<int>  $requiredInvestigationIds
     * @param  list<int>  $excludeIds  operators already tried (refused/timed out)
     */
    public function pickOperatorId(PatientProfile $patient, array $requiredInvestigationIds, array $excludeIds = []): ?int
    {
        $ranked = $this->rankedEligible($patient, $requiredInvestigationIds, $excludeIds);

        return $ranked->first()['operator_id'] ?? null;
    }

    /**
     * Diagnostics for the AS2 "no operator" messaging: is the region covered at
     * all, and if so can any covering operator perform the required set?
     *
     * @param  list<int>  $requiredInvestigationIds
     * @return array{covered: bool, capable: bool}
     */
    public function availability(PatientProfile $patient, array $requiredInvestigationIds): array
    {
        $covering = $this->activeOperators()->filter(fn (OperatorProfile $operator) => $this->covers($operator, $patient));

        return [
            'covered' => $covering->isNotEmpty(),
            'capable' => $covering->contains(fn (OperatorProfile $operator) => $this->capable($operator, $requiredInvestigationIds)),
        ];
    }

    /**
     * @param  list<int>  $requiredInvestigationIds
     * @param  list<int>  $excludeIds
     * @return Collection<int, array{operator_id: int, proximity: int, load: int, rating: float}>
     */
    public function rankedEligible(PatientProfile $patient, array $requiredInvestigationIds, array $excludeIds = []): Collection
    {
        if ($patient->region_id === null) {
            return collect();
        }

        $excludeIds = array_map('intval', $excludeIds);

        $eligible = $this->activeOperators()
            ->reject(fn (OperatorProfile $operator) => in_array((int) $operator->user_id, $excludeIds, true))
            ->filter(fn (OperatorProfile $operator) => $this->covers($operator, $patient) && $this->capable($operator, $requiredInvestigationIds))
            ->values();

        if ($eligible->isEmpty()) {
            return collect();
        }

        $operatorIds = $eligible->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        $loads = $this->activeLoads($operatorIds);
        $ratings = $this->ratings($operatorIds);

        return $eligible
            ->map(fn (OperatorProfile $operator) => [
                'operator_id' => (int) $operator->user_id,
                'proximity' => $this->proximityScore($operator, $patient),
                'load' => (int) ($loads[$operator->user_id] ?? 0),
                'rating' => (float) ($ratings[$operator->user_id] ?? 0),
            ])
            ->sort(fn (array $a, array $b) => [$a['proximity'], $a['load'], -$a['rating'], $a['operator_id']]
                <=> [$b['proximity'], $b['load'], -$b['rating'], $b['operator_id']])
            ->values();
    }

    /**
     * @return Collection<int, OperatorProfile>
     */
    private function activeOperators(): Collection
    {
        return OperatorProfile::with(['coverage', 'capabilities'])
            ->where('is_available', true)
            ->where('is_approved', true)
            ->where('accepting_requests', true)
            ->get();
    }

    private function covers(OperatorProfile $operator, PatientProfile $patient): bool
    {
        return $operator->coverage->contains(fn (OperatorCoverage $coverage) => $coverage->is_active
            && (int) $coverage->region_id === (int) $patient->region_id
            && ($coverage->locality_id === null || (int) $coverage->locality_id === (int) $patient->locality_id));
    }

    /**
     * @param  list<int>  $requiredInvestigationIds
     */
    private function capable(OperatorProfile $operator, array $requiredInvestigationIds): bool
    {
        if (empty($requiredInvestigationIds)) {
            return true;
        }

        $capabilities = $operator->capabilities->map(fn (OperatorCapability $capability) => (int) $capability->investigation_type_id)->all();

        return empty(array_diff($requiredInvestigationIds, $capabilities));
    }

    private function proximityScore(OperatorProfile $operator, PatientProfile $patient): int
    {
        $localityMatch = $operator->coverage->contains(fn (OperatorCoverage $coverage) => (int) $coverage->region_id === (int) $patient->region_id
            && $coverage->locality_id !== null
            && (int) $coverage->locality_id === (int) $patient->locality_id);

        if ($localityMatch) {
            return 0;
        }

        if ($operator->region && $patient->region && $operator->region === $patient->region) {
            return 1;
        }

        return 2;
    }

    /**
     * @param  list<int>  $operatorIds
     * @return array<int, int>
     */
    private function activeLoads(array $operatorIds): array
    {
        return DB::table('consultation_requests')
            ->select('operator_id', DB::raw('count(*) as total'))
            ->whereIn('operator_id', $operatorIds)
            ->whereNotIn('status', ['completed', 'cancelled', 'closed', 'no_operator_available', 'rejected'])
            ->groupBy('operator_id')
            ->pluck('total', 'operator_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    /**
     * @param  list<int>  $operatorIds
     * @return array<int, float>
     */
    private function ratings(array $operatorIds): array
    {
        return DB::table('operator_reviews')
            ->select('operator_id', DB::raw('avg(rating) as avg_rating'))
            ->whereIn('operator_id', $operatorIds)
            ->groupBy('operator_id')
            ->pluck('avg_rating', 'operator_id')
            ->map(fn ($rating) => (float) $rating)
            ->all();
    }
}
