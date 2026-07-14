<?php

namespace App\Services\Higo;

use App\Models\HigoSyncLog;
use Illuminate\Cache\Repository;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Throwable;

class HigoClient
{
    public function get(string $path, array $query = [], array $logContext = []): Response
    {
        return $this->send('GET', $path, ['query' => $query], $logContext);
    }

    public function post(string $path, array $payload = [], array $logContext = []): Response
    {
        return $this->send('POST', $path, ['json' => $payload], $logContext);
    }

    public function put(string $path, array $payload = [], array $logContext = []): Response
    {
        return $this->send('PUT', $path, ['json' => $payload], $logContext);
    }

    public function delete(string $path, array $payload = [], array $logContext = []): Response
    {
        return $this->send('DELETE', $path, ['json' => $payload], $logContext);
    }

    public function accessToken(bool $forceRefresh = false): string
    {
        $this->ensureConfigured();
        $this->ensureTokenCacheLockIsShared();

        $cache = $this->cacheRepository();
        $cacheKey = (string) config('higo.cache.token_key');

        $cachedToken = $cache->get($cacheKey);
        if (! $forceRefresh && $this->tokenIsFresh($cachedToken)) {
            return $cachedToken['access_token'];
        }

        return $cache
            ->lock(
                (string) config('higo.cache.lock_key'),
                (int) config('higo.cache.lock_seconds', 30),
            )
            ->block((int) config('higo.cache.block_seconds', 10), function () use ($cache, $cacheKey, $forceRefresh): string {
                $cachedToken = $cache->get($cacheKey);
                if (! $forceRefresh && $this->tokenIsFresh($cachedToken)) {
                    return $cachedToken['access_token'];
                }

                $cache->forget($cacheKey);

                $token = $cache->remember($cacheKey, $this->maximumTokenCacheSeconds(), function (): array {
                    return $this->requestAccessToken();
                });

                $cache->put($cacheKey, $token, $token['cache_ttl_seconds']);

                return $token['access_token'];
            });
    }

    public function clearTokenCache(): void
    {
        $this->cacheRepository()->forget((string) config('higo.cache.token_key'));
    }

    public function ensureTokenCacheLockIsShared(): void
    {
        $storeName = $this->cacheStoreName();
        $repository = $this->cacheRepository();

        if (! $repository->getStore() instanceof LockProvider) {
            throw new RuntimeException("The HIGO cache store [{$storeName}] does not support atomic locks.");
        }

        if ((bool) config('higo.cache.require_shared_lock_store', true)
            && ! in_array($storeName, config('higo.cache.shared_lock_stores', []), true)) {
            throw new RuntimeException("The HIGO cache store [{$storeName}] is not configured as a shared atomic lock store for web and queue workers. Use Redis, database, memcached, or dynamodb.");
        }

        if ($storeName === 'database' && ! Schema::hasTable(config('cache.stores.database.lock_table') ?? 'cache_locks')) {
            throw new RuntimeException('The HIGO database cache lock store requires the cache_locks table.');
        }
    }

    protected function send(string $method, string $path, array $options = [], array $logContext = []): Response
    {
        $requestPayload = $options['json'] ?? $options['query'] ?? null;
        $log = $this->startLog([
            ...$logContext,
            'operation' => $logContext['operation'] ?? 'higo.'.strtolower($method),
            'method' => $method,
            'endpoint' => $path,
            'request_payload' => $requestPayload,
        ]);

        try {
            $response = $this->authenticatedRequest()->send($method, $path, $options)->throw();

            $this->finishLog($log, 'succeeded', $response);

            return $response;
        } catch (Throwable $exception) {
            $this->failLog($log, $exception);

            throw $exception;
        }
    }

    protected function requestAccessToken(): array
    {
        $payload = $this->oauthPayload();
        $log = $this->startLog([
            'operation' => 'higo.oauth.token',
            'method' => 'POST',
            'endpoint' => (string) config('higo.oauth.token_path', '/oauth/token'),
            'request_payload' => $payload,
        ]);

        try {
            $response = $this->baseRequest(authenticated: false)
                ->asForm()
                ->withBasicAuth((string) config('higo.client_id'), (string) config('higo.client_secret'))
                ->post((string) config('higo.oauth.token_path', '/oauth/token'), $payload)
                ->throw();

            $this->finishLog($log, 'succeeded', $response);

            $body = $response->json();
            $expiresIn = (int) Arr::get($body, 'expires_in', Arr::get($body, 'expiresIn', 0));
            $cacheTtl = max(1, $expiresIn - (int) config('higo.cache.refresh_margin_seconds', 300));

            return [
                'access_token' => (string) Arr::get($body, 'access_token'),
                'refresh_token' => Arr::get($body, 'refresh_token'),
                'token_type' => (string) Arr::get($body, 'token_type', Arr::get($body, 'tokenType', 'bearer')),
                'expires_in' => $expiresIn,
                'expires_at' => now()->addSeconds($cacheTtl)->timestamp,
                'cache_ttl_seconds' => $cacheTtl,
            ];
        } catch (Throwable $exception) {
            $this->failLog($log, $exception);

            throw $exception;
        }
    }

    protected function authenticatedRequest(): PendingRequest
    {
        return $this->baseRequest()->withToken($this->accessToken());
    }

    protected function baseRequest(bool $authenticated = true): PendingRequest
    {
        $request = Http::baseUrl(rtrim((string) config('higo.base_url'), '/'))
            ->acceptJson()
            ->timeout((int) config('higo.http.timeout', 20))
            ->connectTimeout((int) config('higo.http.connect_timeout', 10))
            ->retry(
                (int) config('higo.http.retry_times', 3),
                (int) config('higo.http.retry_sleep_milliseconds', 500),
                throw: true,
            );

        return $authenticated ? $request->asJson() : $request;
    }

    protected function oauthPayload(): array
    {
        return [
            'grant_type' => (string) config('higo.oauth.grant_type', 'password'),
            (string) config('higo.oauth.username_field', 'username') => (string) config('higo.username'),
            (string) config('higo.oauth.password_field', 'password') => (string) config('higo.password'),
        ];
    }

    protected function startLog(array $attributes): ?HigoSyncLog
    {
        if (! (bool) config('higo.logging.enabled', true)) {
            return null;
        }

        return HigoSyncLog::create([
            'direction' => $attributes['direction'] ?? 'outbound',
            'operation' => $attributes['operation'],
            'resource_type' => $attributes['resource_type'] ?? null,
            'resource_id' => $attributes['resource_id'] ?? null,
            'local_model_type' => $attributes['local_model_type'] ?? null,
            'local_model_id' => $attributes['local_model_id'] ?? null,
            'higo_id' => $attributes['higo_id'] ?? null,
            'status' => 'started',
            'method' => $attributes['method'] ?? null,
            'endpoint' => $attributes['endpoint'] ?? null,
            'request_payload' => HigoSyncLog::redactPayload($attributes['request_payload'] ?? null),
            'started_at' => now(),
        ]);
    }

    protected function finishLog(?HigoSyncLog $log, string $status, Response $response): void
    {
        if (! $log) {
            return;
        }

        $log->update([
            'status' => $status,
            'http_status' => $response->status(),
            'response_payload' => HigoSyncLog::redactPayload($response->json()),
            'finished_at' => now(),
        ]);
    }

    protected function failLog(?HigoSyncLog $log, Throwable $exception): void
    {
        if (! $log) {
            return;
        }

        $log->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'finished_at' => now(),
        ]);
    }

    protected function tokenIsFresh(mixed $token): bool
    {
        return is_array($token)
            && ! empty($token['access_token'])
            && isset($token['expires_at'])
            && (int) $token['expires_at'] > now()->timestamp;
    }

    protected function maximumTokenCacheSeconds(): int
    {
        return max(1, (int) config('higo.cache.max_token_cache_seconds', 3300));
    }

    protected function cacheRepository(): Repository
    {
        return Cache::store($this->cacheStoreName());
    }

    protected function cacheStoreName(): string
    {
        return (string) (config('higo.cache.store') ?: config('cache.default'));
    }

    protected function ensureConfigured(): void
    {
        foreach (['higo.base_url', 'higo.client_id', 'higo.client_secret', 'higo.username', 'higo.password'] as $key) {
            if (blank(config($key))) {
                throw new RuntimeException("Missing required HIGO configuration value [{$key}].");
            }
        }
    }
}
