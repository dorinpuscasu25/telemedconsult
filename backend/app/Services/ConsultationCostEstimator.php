<?php

namespace App\Services;

use App\Models\DoctorInvestigationRequirement;
use App\Models\InvestigationType;
use App\Models\OperatorProfile;
use App\Models\PatientProfile;
use App\Models\User;

/**
 * Composes the patient-facing cost for a `with_exam` consultation (spec §7 CO1):
 * doctor base + Σ required investigations + Σ chosen optional investigations +
 * operator travel fee. Investigation price = operator override ?? catalog default.
 * All amounts are MDL major integers (matching consultation_price / default_price).
 */
class ConsultationCostEstimator
{
    /**
     * @param  list<int>  $selectedOptionalIds
     * @return array{
     *     doctor_base: int,
     *     investigations: list<array{id: int, name: ?string, requirement: string, price: int}>,
     *     investigations_total: int,
     *     travel_fee: int,
     *     total: int
     * }
     */
    public function estimate(?User $doctor, PatientProfile $patient, ?int $operatorId, array $selectedOptionalIds = []): array
    {
        $doctorBase = (int) ($doctor?->doctorProfile?->consultation_price ?? 0);

        $requirements = $doctor
            ? DoctorInvestigationRequirement::where('doctor_id', $doctor->id)->get()
            : collect();

        $requiredIds = $requirements->where('requirement', 'required')->pluck('investigation_type_id')->map(fn ($id) => (int) $id);
        $optionalIds = $requirements->where('requirement', 'optional')->pluck('investigation_type_id')->map(fn ($id) => (int) $id);

        // Only optional investigations the doctor actually offers can be chosen.
        $chosenOptionalIds = $optionalIds->intersect(array_map('intval', $selectedOptionalIds))->values();

        $lineIds = $requiredIds->merge($chosenOptionalIds)->unique()->values();
        $catalog = InvestigationType::whereIn('id', $lineIds)->get()->keyBy('id');
        $overrides = $this->operatorPriceOverrides($operatorId);

        $investigations = $lineIds
            ->map(function (int $id) use ($catalog, $overrides, $requiredIds) {
                $type = $catalog->get($id);

                return [
                    'id' => $id,
                    'name' => $type?->name,
                    'requirement' => $requiredIds->contains($id) ? 'required' : 'optional',
                    'price' => (int) ($overrides[$id] ?? $type?->default_price ?? 0),
                ];
            })
            ->values()
            ->all();

        $investigationsTotal = array_sum(array_column($investigations, 'price'));
        $travelFee = $this->travelFee($operatorId, $patient);

        return [
            'doctor_base' => $doctorBase,
            'investigations' => $investigations,
            'investigations_total' => $investigationsTotal,
            'travel_fee' => $travelFee,
            'total' => $doctorBase + $investigationsTotal + $travelFee,
        ];
    }

    /**
     * @return array<int, int> keyed by investigation_type_id
     */
    private function operatorPriceOverrides(?int $operatorId): array
    {
        if ($operatorId === null) {
            return [];
        }

        return OperatorProfile::where('user_id', $operatorId)->first()?->capabilities()
            ->whereNotNull('price_override')
            ->pluck('price_override', 'investigation_type_id')
            ->map(fn ($price) => (int) $price)
            ->all() ?? [];
    }

    private function travelFee(?int $operatorId, PatientProfile $patient): int
    {
        if ($operatorId === null || $patient->region_id === null) {
            return 0;
        }

        $profile = OperatorProfile::with('travelFees')->where('user_id', $operatorId)->first();

        return (int) ($profile?->resolveTravelFee($patient->region_id, $patient->locality_id) ?? 0);
    }
}
