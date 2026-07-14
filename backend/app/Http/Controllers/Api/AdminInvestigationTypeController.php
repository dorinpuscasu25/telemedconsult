<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InvestigationType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminInvestigationTypeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => InvestigationType::orderBy('name')->get()->map(fn (InvestigationType $type) => $this->serialize($type)),
            'higo_exam_types' => InvestigationType::HIGO_EXAM_TYPES,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $this->validatePayload($request);
        $code = $validated['code'] ?? Str::slug($validated['name'], '_');

        abort_if(InvestigationType::where('code', $code)->exists(), 422, 'Acest cod este deja folosit.');

        $type = InvestigationType::create([...$validated, 'code' => $code]);

        return response()->json([
            'message' => 'Investigație creată.',
            'investigation_type' => $this->serialize($type),
        ], 201);
    }

    public function update(Request $request, InvestigationType $investigationType): JsonResponse
    {
        $this->authorizeAdmin($request);

        $validated = $this->validatePayload($request, $investigationType);
        $code = $validated['code'] ?? $investigationType->code;

        abort_if(
            InvestigationType::where('code', $code)->whereKeyNot($investigationType->id)->exists(),
            422,
            'Acest cod este deja folosit.'
        );

        $investigationType->update([...$validated, 'code' => $code]);

        return response()->json([
            'message' => 'Investigație actualizată.',
            'investigation_type' => $this->serialize($investigationType->refresh()),
        ]);
    }

    public function destroy(Request $request, InvestigationType $investigationType): JsonResponse
    {
        $this->authorizeAdmin($request);

        $investigationType->forceFill(['is_active' => false])->save();

        return response()->json([
            'message' => 'Investigație dezactivată.',
            'investigation_type' => $this->serialize($investigationType->refresh()),
        ]);
    }

    /**
     * @return array{code: ?string, name: string, description: ?string, default_price: int, requires_device: bool, higo_exam_type: ?string, is_active: bool}
     */
    private function validatePayload(Request $request, ?InvestigationType $ignore = null): array
    {
        $validated = $request->validate([
            'code' => ['nullable', 'string', 'max:100', 'regex:/^[a-z0-9_]+$/'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'default_price' => ['nullable', 'integer', 'min:0'],
            'requires_device' => ['nullable', 'boolean'],
            'higo_exam_type' => ['nullable', Rule::in(InvestigationType::HIGO_EXAM_TYPES)],
            'is_active' => ['nullable', 'boolean'],
        ]);

        return [
            'code' => $validated['code'] ?? null,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'default_price' => $validated['default_price'] ?? 0,
            'requires_device' => $validated['requires_device'] ?? false,
            'higo_exam_type' => $validated['higo_exam_type'] ?? null,
            'is_active' => $validated['is_active'] ?? ($ignore->is_active ?? true),
        ];
    }

    private function serialize(InvestigationType $type): array
    {
        return [
            'id' => $type->id,
            'code' => $type->code,
            'name' => $type->name,
            'description' => $type->description,
            'default_price' => $type->default_price,
            'requires_device' => $type->requires_device,
            'higo_exam_type' => $type->higo_exam_type,
            'is_active' => $type->is_active,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403, 'Ai nevoie de rol admin.');
    }
}
