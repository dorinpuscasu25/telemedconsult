<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpsertPartnerRequest;
use App\Models\Partner;
use App\Services\PublicImageStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminPartnerController extends Controller
{
    public function __construct(private readonly PublicImageStorage $images) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => Partner::orderBy('sort_order')->orderBy('id')->get()->map(fn (Partner $partner) => $this->serialize($partner)),
        ]);
    }

    public function store(UpsertPartnerRequest $request): JsonResponse
    {
        $partner = $this->images->persistReplacement(
            image: $request->file('logo'),
            directory: 'partner-logos',
            persist: fn (?string $logoUrl) => Partner::create($this->payload($request, $logoUrl)),
        );

        return response()->json([
            'message' => 'Partener creat.',
            'partner' => $this->serialize($partner),
        ], 201);
    }

    public function update(UpsertPartnerRequest $request, Partner $partner): JsonResponse
    {
        $this->images->persistReplacement(
            image: $request->file('logo'),
            directory: 'partner-logos',
            persist: function (?string $logoUrl) use ($request, $partner): void {
                $partner->update($this->payload($request, $logoUrl));
            },
            currentUrl: $partner->logo_url,
            removeCurrent: (bool) ($request->validated('remove_logo') ?? false),
        );

        return response()->json([
            'message' => 'Partener actualizat.',
            'partner' => $this->serialize($partner->refresh()),
        ]);
    }

    public function destroy(Request $request, Partner $partner): JsonResponse
    {
        $this->authorizeAdmin($request);

        $logoUrl = $partner->logo_url;
        $partner->delete();
        $this->images->delete($logoUrl);

        return response()->json([
            'message' => 'Partener șters.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(UpsertPartnerRequest $request, ?string $logoUrl): array
    {
        $validated = $request->validated();

        return [
            'name' => $validated['name'],
            'logo_url' => $logoUrl,
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
