<?php

namespace Tests\Feature;

use App\Services\LiveKitService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LiveKitCloudConfigurationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.livekit.url' => 'wss://test.livekit.cloud', 'services.livekit.api_key' => 'cloud-key', 'services.livekit.api_secret' => str_repeat('s', 32)]);
        Http::preventStrayRequests();
    }

    public function test_configuration_check_is_local_unless_connect_is_requested(): void
    {
        $this->artisan('livekit:check')->expectsOutputToContain('Configurația LiveKit este validă.')->assertSuccessful();
        Http::assertNothingSent();
        Http::fake(['https://test.livekit.cloud/*' => Http::response(['rooms' => []])]);
        $this->artisan('livekit:check --connect')->expectsOutputToContain('Conexiunea și autentificarea LiveKit funcționează.')->assertSuccessful();
        Http::assertSent(fn ($request) => $request->url() === 'https://test.livekit.cloud/twirp/livekit.RoomService/ListRooms' && $request->body() === '{}');
    }

    public function test_cloud_configuration_trims_server_url_and_rejects_short_secrets(): void
    {
        config(['services.livekit.url' => ' wss://test.livekit.cloud/ ']);
        $this->assertTrue(app(LiveKitService::class)->configured());
        $this->assertSame('wss://test.livekit.cloud', app(LiveKitService::class)->serverUrl());
        config(['services.livekit.api_secret' => 'short-secret']);
        $this->artisan('livekit:check --connect')->expectsOutputToContain('Configurație LiveKit invalidă')->assertFailed();
        Http::assertNothingSent();
    }

    #[DataProvider('invalidUrls')]
    public function test_configuration_rejects_incorrect_project_addresses(string $url): void
    {
        config(['services.livekit.url' => $url]);
        $this->assertFalse(app(LiveKitService::class)->configured());
    }

    public static function invalidUrls(): array
    {
        return [['https://test.livekit.cloud'], ['wss://test.livekit.cloud/path'], ['wss://user@test.livekit.cloud'], ['wss://test.livekit.cloud?key=secret'], ['wss://test.livekit.cloud#key'], ['ws://test.livekit.cloud']];
    }

    public function test_failed_cloud_authentication_and_network_failure_are_reported_without_secrets(): void
    {
        Http::fake(['https://test.livekit.cloud/*' => Http::response(['message' => 'Sensitive upstream response'], 401)]);
        $this->artisan('livekit:check --connect')->expectsOutputToContain('HTTP 401')->doesntExpectOutputToContain('Sensitive upstream response')->doesntExpectOutputToContain(str_repeat('s', 32))->assertFailed();
        Http::fake(fn () => throw new ConnectionException('Sensitive request details'));
        $this->artisan('livekit:check --connect')->expectsOutputToContain('LiveKit nu poate fi contactat.')->doesntExpectOutputToContain('Sensitive request details')->assertFailed();
    }
}
