<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPartnerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => Partner::orderBy('sort_order')->orderBy('id')->get()->map(fn (Partner $partner) => $this->serialize($partner)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $partner = Partner::create($this->payload($request));

        return response()->json([
            'message' => 'Partener creat.',
            'partner' => $this->serialize($partner),
        ], 201);
    }

    public function update(Request $request, Partner $partner): JsonResponse
    {
        $this->authorizeAdmin($request);

        $partner->update($this->payload($request));

        return response()->json([
            'message' => 'Partener actualizat.',
            'partner' => $this->serialize($partner->refresh()),
        ]);
    }

    public function destroy(Request $request, Partner $partner): JsonResponse
    {
        $this->authorizeAdmin($request);

        $partner->delete();

        return response()->json([
            'message' => 'Partener șters.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Request $request): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'logo_url' => ['nullable', 'url', 'max:2000'],
            'website_url' => ['nullable', 'url', 'max:2000'],
            'description' => ['nullable', 'string', 'max:1000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return [
            'name' => $validated['name'],
            'logo_url' => $validated['logo_url'] ?? null,
            'website_url' => $validated['website_url'] ?? null,
            'description' => $validated['description'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
            'is_active' => $validated['is_active'] ?? true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(Partner $partner): array
    {
        return [
            'id' => $partner->id,
            'name' => $partner->name,
            'logo_url' => $partner->logo_url,
            'website_url' => $partner->website_url,
            'description' => $partner->description,
            'sort_order' => $partner->sort_order,
            'is_active' => $partner->is_active,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
    }
}
