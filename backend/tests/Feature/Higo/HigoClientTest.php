<?php

namespace Tests\Feature\Higo;

use App\Models\HigoSyncLog;
use App\Services\Higo\HigoClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class HigoClientTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'higo.base_url' => 'https://higo.test',
            'higo.client_id' => 'client-id',
            'higo.client_secret' => 'client-secret',
            'higo.username' => 'integration-user',
            'higo.password' => 'integration-password',
            'higo.cache.store' => 'database',
            'higo.cache.require_shared_lock_store' => true,
            'higo.http.retry_times' => 1,
            'higo.logging.enabled' => true,
        ]);
    }

    public function test_it_requests_and_caches_oauth_token_with_basic_auth(): void
    {
        Http::fake([
            'https://higo.test/oauth/token' => Http::response([
                'access_token' => 'jwt-token',
                'token_type' => 'bearer',
                'refresh_token' => 'refresh-token',
                'expires_in' => 3599,
            ]),
        ]);

        $client = app(HigoClient::class);

        $this->assertSame('jwt-token', $client->accessToken());
        $this->assertSame('jwt-token', $client->accessToken());

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => $request->hasHeader(
            'Authorization',
            'Basic '.base64_encode('client-id:client-secret'),
        ));

        $logPayload = json_encode(HigoSyncLog::firstOrFail()->only(['request_payload', 'response_payload']));

        $this->assertStringContainsString('[REDACTED]', $logPayload);
        $this->assertStringNotContainsString('client-secret', $logPayload);
        $this->assertStringNotContainsString('integration-password', $logPayload);
        $this->assertStringNotContainsString('jwt-token', $logPayload);
        $this->assertStringNotContainsString('refresh-token', $logPayload);
    }

    public function test_oauth_username_and_password_field_names_are_configurable(): void
    {
        config([
            'higo.oauth.username_field' => 'password',
            'higo.oauth.password_field' => 'username',
        ]);

        Http::fake([
            'https://higo.test/oauth/token' => Http::response([
                'access_token' => 'jwt-token',
                'refresh_token' => 'refresh-token',
                'expires_in' => 3599,
            ]),
        ]);

        app(HigoClient::class)->accessToken();

        Http::assertSent(fn (Request $request): bool => $request['password'] === 'integration-user'
            && $request['username'] === 'integration-password');
    }

    public function test_it_rejects_cache_stores_that_are_not_shared_between_processes(): void
    {
        config(['higo.cache.store' => 'array']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('shared atomic lock store');

        app(HigoClient::class)->accessToken();
    }

    public function test_authenticated_requests_log_redacted_payloads_without_tokens_or_pii(): void
    {
        Http::fake([
            'https://higo.test/oauth/token' => Http::response([
                'access_token' => 'jwt-token',
                'refresh_token' => 'refresh-token',
                'expires_in' => 3599,
            ]),
            'https://higo.test/api/fhir/Patient' => Http::response([
                'resourceType' => 'Patient',
                'id' => '705',
                'name' => [
                    ['given' => ['Ion'], 'family' => 'Popescu'],
                ],
                'identifier' => [
                    ['value' => '2000000000000'],
                ],
            ], 201),
        ]);

        $response = app(HigoClient::class)->post('/api/fhir/Patient', [
            'resourceType' => 'Patient',
            'birthDate' => '1990-01-01',
            'identifier' => [
                'type' => ['text' => 'PESEL'],
                'value' => '2000000000000',
            ],
            'name' => [
                'given' => ['Ion'],
                'family' => 'Popescu',
            ],
        ], [
            'operation' => 'higo.patient.create',
            'resource_type' => 'Patient',
        ]);

        $this->assertSame(201, $response->status());

        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://higo.test/api/fhir/Patient'
            && $request->hasHeader('Authorization', 'Bearer jwt-token'));

        $logs = json_encode(HigoSyncLog::all()->map->only(['request_payload', 'response_payload']));

        $this->assertStringContainsString('[REDACTED]', $logs);
        $this->assertStringNotContainsString('jwt-token', $logs);
        $this->assertStringNotContainsString('refresh-token', $logs);
        $this->assertStringNotContainsString('Ion', $logs);
        $this->assertStringNotContainsString('Popescu', $logs);
        $this->assertStringNotContainsString('2000000000000', $logs);
        $this->assertStringNotContainsString('1990-01-01', $logs);
    }
}
