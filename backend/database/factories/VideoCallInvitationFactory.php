<?php

namespace Database\Factories;

use App\Models\ConsultationRequest;
use App\Models\User;
use App\Models\VideoCallInvitation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VideoCallInvitation>
 */
class VideoCallInvitationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'caller_id' => User::factory(),
            'recipient_id' => User::factory(),
            'consultation_request_id' => fn (array $attributes) => ConsultationRequest::create(['patient_id' => $attributes['caller_id'], 'doctor_id' => $attributes['recipient_id'], 'type' => 'video', 'consultation_kind' => 'video', 'status' => 'accepted', 'doctor_started_at' => now()])->id,
            'status' => 'ringing',
            'expires_at' => now()->addSeconds(75),
        ];
    }
}
