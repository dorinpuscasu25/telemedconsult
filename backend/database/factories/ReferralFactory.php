<?php

namespace Database\Factories;

use App\Models\Referral;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Referral>
 */
class ReferralFactory extends Factory
{
    protected $model = Referral::class;

    public function definition(): array
    {
        return [
            'referrer_id' => User::factory(),
            'referred_user_id' => User::factory(),
            'reward_amount_minor' => 0,
            'currency' => 'MDL',
            'status' => Referral::STATUS_PENDING,
            'rewarded_at' => null,
        ];
    }
}
