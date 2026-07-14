<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['direction', 'operation', 'resource_type', 'resource_id', 'local_model_type', 'local_model_id', 'higo_id', 'status', 'method', 'endpoint', 'http_status', 'request_payload', 'response_payload', 'error_message', 'attempts', 'started_at', 'finished_at'])]
class HigoSyncLog extends Model
{
    public static function redactPayload(mixed $payload): mixed
    {
        if ($payload === null) {
            return null;
        }

        if (is_array($payload)) {
            return collect($payload)
                ->mapWithKeys(fn (mixed $value, string|int $key): array => [
                    $key => static::isSensitiveKey((string) $key)
                        ? config('higo.logging.redacted_value', '[REDACTED]')
                        : static::redactPayload($value),
                ])
                ->all();
        }

        return $payload;
    }

    protected static function isSensitiveKey(string $key): bool
    {
        return collect(config('higo.logging.sensitive_keys', []))
            ->contains(fn (string $sensitiveKey): bool => strcasecmp($key, $sensitiveKey) === 0);
    }

    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'response_payload' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }
}
