<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FeatureFlags;
use App\Services\PlatformConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminFeatureFlagController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => app(FeatureFlags::class)->catalog(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'flags' => ['required', 'array', 'min:1'],
            'flags.*.key' => ['required', 'string', Rule::in(array_keys(FeatureFlags::FLAGS))],
            'flags.*.enabled' => ['required', 'boolean'],
        ]);

        $config = app(PlatformConfig::class);

        foreach ($validated['flags'] as $flag) {
            $config->upsert(
                FeatureFlags::PREFIX.$flag['key'],
                (bool) $flag['enabled'],
                FeatureFlags::GROUP,
                'boolean',
                $request->user()->id,
            );
        }

        return response()->json([
            'message' => 'Funcționalități actualizate.',
            'data' => app(FeatureFlags::class)->catalog(),
        ]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }
}
