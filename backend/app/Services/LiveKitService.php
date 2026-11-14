<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

class LiveKitService
{
    public function configured(): bool
    {
        $url = parse_url($this->serverUrl());
        $scheme = $url['scheme'] ?? null;
        $host = $url['host'] ?? null;
        $localServer = app()->environment('local') && $scheme === 'ws' && in_array($host, ['localhost', '127.0.0.1', '[::1]'], true);

        return filled($host) && ($scheme === 'wss' || $localServer)
            && ! isset($url['user']) && ! isset($url['pass']) && ! isset($url['query']) && ! isset($url['fragment'])
            && in_array($url['path'] ?? '', ['', '/'], true)
            && filled(trim((string) config('services.livekit.api_key')))
            && strlen((string) config('services.livekit.api_secret')) >= 32;
    }

    public function serverUrl(): string
    {
        return rtrim(trim((string) config('services.livekit.url')), '/');
    }

    public function supportsVideo(ConsultationRequest $consultation): bool
    {
        return $consultation->consultation_kind !== 'preliminary'
            && ($consultation->pricing_snapshot['service']['type'] ?? null) !== 'chat';
    }

    public function checkConnection(): void
    {
        Http::connectTimeout(3)->timeout(10)
            ->withToken($this->token(['video' => ['roomList' => true]]))
            ->withBody('{}', 'application/json')
            ->post($this->apiUrl().'/twirp/livekit.RoomService/ListRooms')->throw();
    }

    private function apiUrl(): string
    {
        return preg_replace('/^ws(s?):\/\//', 'http$1://', $this->serverUrl());
    }

    public function roomName(ConsultationRequest $consultation): string
    {
        $identity = (string) $consultation->id;
        if ($consultation->video_session_id) {
            $identity .= ':'.$consultation->video_session_id;
        }

        return 'consultation-'.hash_hmac('sha256', $identity, (string) config('app.key'));
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

    public function closeRoom(ConsultationRequest $consultation, ?string $roomName = null, ?array $participantIds = null): void
    {
        if (! $this->configured()) {
            return;
        }

        $room = $roomName ?? $this->roomName($consultation);
        $url = $this->apiUrl();
        $failure = null;
        // Revoke even departed participants so cached or refreshed Cloud tokens cannot rejoin.
        foreach (array_unique(array_filter($participantIds ?? [$consultation->patient_id, $consultation->doctor_id, $consultation->operator_id])) as $userId) {
            try {
                $revocation = Http::connectTimeout(3)->timeout(10)->withToken($this->token(['video' => ['room' => $room, 'roomAdmin' => true]]))
                    ->post($url.'/twirp/livekit.RoomService/RemoveParticipant', [
                        'room' => $room,
                        'identity' => $this->participantIdentity($userId),
                        'revoke_token_ts' => now()->timestamp + 1,
                    ]);
                if ($revocation->status() !== 404) {
                    $revocation->throw();
                }
            } catch (ConnectionException|RequestException $exception) {
                $failure ??= $exception;
            }
        }

        try {
            $response = Http::connectTimeout(3)->timeout(10)->withToken($this->token(['video' => ['room' => $room, 'roomCreate' => true]]))
                ->post($url.'/twirp/livekit.RoomService/DeleteRoom', ['room' => $room]);

            if ($response->status() !== 404) {
                $response->throw();
            }
        } catch (ConnectionException|RequestException $exception) {
            $failure ??= $exception;
        }
        if ($failure) {
            throw $failure;
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
