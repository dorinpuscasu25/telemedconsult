<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Locality;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminRegionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => Region::with(['localities' => fn ($query) => $query->orderBy('name')])
                ->orderBy('country')
                ->orderBy('name')
                ->get()
                ->map(fn (Region $region) => $this->serialize($region)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(Region::TYPES)],
            'country' => ['nullable', 'string', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $country = $validated['country'] ?? 'Republica Moldova';

        abort_if(
            Region::where('country', $country)->where('name', $validated['name'])->exists(),
            422,
            'Există deja o regiune cu acest nume în țara selectată.'
        );

        $region = Region::create([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'country' => $country,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Regiune creată.',
            'region' => $this->serialize($region->load('localities')),
        ], 201);
    }

    public function update(Request $request, Region $region): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(Region::TYPES)],
            'country' => ['nullable', 'string', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $country = $validated['country'] ?? $region->country;

        abort_if(
            Region::where('country', $country)
                ->where('name', $validated['name'])
                ->whereKeyNot($region->id)
                ->exists(),
            422,
            'Există deja o regiune cu acest nume în țara selectată.'
        );

        $region->update([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'country' => $country,
            'is_active' => $validated['is_active'] ?? $region->is_active,
        ]);

        return response()->json([
            'message' => 'Regiune actualizată.',
            'region' => $this->serialize($region->fresh('localities')),
        ]);
    }

    public function storeLocality(Request $request, Region $region): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(Locality::TYPES)],
            'is_active' => ['nullable', 'boolean'],
        ]);

        abort_if(
            $region->localities()->where('name', $validated['name'])->exists(),
            422,
            'Există deja o localitate cu acest nume în regiune.'
        );

        $locality = $region->localities()->create([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Localitate creată.',
            'locality' => $this->serializeLocality($locality),
        ], 201);
    }

    public function updateLocality(Request $request, Locality $locality): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(Locality::TYPES)],
            'is_active' => ['nullable', 'boolean'],
        ]);

        abort_if(
            Locality::where('region_id', $locality->region_id)
                ->where('name', $validated['name'])
                ->whereKeyNot($locality->id)
                ->exists(),
            422,
            'Există deja o localitate cu acest nume în regiune.'
        );

        $locality->update([
            'name' => $validated['name'],
            'type' => $validated['type'],
            'is_active' => $validated['is_active'] ?? $locality->is_active,
        ]);

        return response()->json([
            'message' => 'Localitate actualizată.',
            'locality' => $this->serializeLocality($locality->refresh()),
        ]);
    }

    private function serialize(Region $region): array
    {
        return [
            'id' => $region->id,
            'name' => $region->name,
            'type' => $region->type,
            'country' => $region->country,
            'is_active' => $region->is_active,
            'localities' => $region->localities->map(fn (Locality $locality) => $this->serializeLocality($locality))->values(),
        ];
    }

    private function serializeLocality(Locality $locality): array
    {
        return [
            'id' => $locality->id,
            'region_id' => $locality->region_id,
            'name' => $locality->name,
            'type' => $locality->type,
            'is_active' => $locality->is_active,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }
}
