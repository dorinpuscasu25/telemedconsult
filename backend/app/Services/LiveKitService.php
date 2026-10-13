<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Http;

class LiveKitService
{
    public function configured(): bool
    {
        return str_starts_with((string) config('services.livekit.url'), 'wss://')
            && filled(config('services.livekit.api_key')) && filled(config('services.livekit.api_secret'));
    }

    public function roomName(ConsultationRequest $consultation): string
    {
        return 'consultation-'.hash_hmac('sha256', (string) $consultation->id, (string) config('app.key'));
    }

    public function joinToken(ConsultationRequest $consultation, User $user): string
    {
        $participant = $this->participantDetails($consultation, $user);

        return $this->token([
            'sub' => $this->participantIdentity($user->id),
            'name' => $participant['name'],
            'attributes' => ['role' => $participant['role']],
            'video' => [
                'room' => $this->roomName($consultation), 'roomJoin' => true,
                'canPublish' => true, 'canSubscribe' => true, 'canPublishData' => true,
                'canUpdateOwnMetadata' => false,
                'canPublishSources' => ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
            ],
        ]);
    }

    public function participantDetails(ConsultationRequest $consultation, User $user): array
    {
        $role = (int) $consultation->doctor_id === (int) $user->id ? 'doctor'
            : ((int) $consultation->patient_id === (int) $user->id ? 'patient' : 'operator');
        $name = trim($user->name);
        if ($role === 'patient') {
            $consultation->loadMissing('patientProfile');
            $name = $consultation->patientProfile?->display_name ?: $name;
        }

        return ['name' => $name, 'role' => $role, 'role_label' => ['doctor' => 'Medic', 'patient' => 'Pacient', 'operator' => 'Operator'][$role]];
    }

    public function closeRoom(ConsultationRequest $consultation): void
    {
        if (! $this->configured()) {
            return;
        }

        $room = $this->roomName($consultation);
        $url = 'https://'.substr(rtrim(config('services.livekit.url'), '/'), 6);
        // Revoke even departed participants so cached or refreshed Cloud tokens cannot rejoin.
        foreach (array_unique(array_filter([$consultation->patient_id, $consultation->doctor_id, $consultation->operator_id])) as $userId) {
            $revocation = Http::timeout(10)->withToken($this->token(['video' => ['room' => $room, 'roomAdmin' => true]]))
                ->post($url.'/twirp/livekit.RoomService/RemoveParticipant', [
                    'room' => $room,
                    'identity' => $this->participantIdentity($userId),
                    'revoke_token_ts' => now()->timestamp + 1,
                ]);
            if ($revocation->status() !== 404) {
                $revocation->throw();
            }
        }

        $response = Http::timeout(10)->withToken($this->token(['video' => ['room' => $room, 'roomCreate' => true]]))
            ->post($url.'/twirp/livekit.RoomService/DeleteRoom', ['room' => $room]);

        if ($response->status() !== 404) {
            $response->throw();
        }
    }

    private function participantIdentity(int $userId): string
    {
        return hash_hmac('sha256', 'participant:'.$userId, (string) config('app.key'));
    }

    private function token(array $claims): string
    {
        return JWT::encode([
            'iss' => config('services.livekit.api_key'),
            'nbf' => now()->timestamp - 5, 'iat' => now()->timestamp,
            'exp' => now()->addMinutes(5)->timestamp,
            ...$claims,
        ], config('services.livekit.api_secret'), 'HS256');
    }
}
