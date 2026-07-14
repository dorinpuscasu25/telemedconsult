<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'higo_operator_id', 'country', 'region', 'locality', 'equipment', 'base_fee_minor', 'served_areas', 'travel_fees', 'service_catalog', 'has_device_subscription', 'contract_number', 'affiliate_code', 'is_available', 'accepting_requests', 'is_approved'])]
class OperatorProfile extends Model
{
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function coverage(): HasMany
    {
        return $this->hasMany(OperatorCoverage::class, 'operator_id', 'user_id');
    }

    public function capabilities(): HasMany
    {
        return $this->hasMany(OperatorCapability::class, 'operator_id', 'user_id');
    }

    public function travelFees(): HasMany
    {
        return $this->hasMany(OperatorTravelFee::class, 'operator_id', 'user_id');
    }

    /**
     * Resolve the travel fee for a destination: a locality-specific fee wins;
     * otherwise fall back to the raion-level fee. Returns null when neither is set.
     */
    public function resolveTravelFee(int $regionId, ?int $localityId = null): ?int
    {
        $fees = $this->relationLoaded('travelFees') ? $this->travelFees : $this->travelFees()->get();

        if ($localityId !== null) {
            $localityFee = $fees->first(fn (OperatorTravelFee $fee) => (int) $fee->region_id === $regionId && (int) $fee->locality_id === $localityId);
            if ($localityFee !== null) {
                return $localityFee->fee;
            }
        }

        $regionFee = $fees->first(fn (OperatorTravelFee $fee) => (int) $fee->region_id === $regionId && $fee->locality_id === null);

        return $regionFee?->fee;
    }

    protected function casts(): array
    {
        return [
            'equipment' => 'array',
            'served_areas' => 'array',
            'travel_fees' => 'array',
            'service_catalog' => 'array',
            'has_device_subscription' => 'boolean',
            'is_available' => 'boolean',
            'accepting_requests' => 'boolean',
            'is_approved' => 'boolean',
        ];
    }
}
