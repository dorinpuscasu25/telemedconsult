<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClinicalParameter;
use App\Services\ObjectiveDataSchema;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminClinicalParameterController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => ClinicalParameter::orderBy('label')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['data' => ClinicalParameter::create($this->validateParameter($request))], 201);
    }

    public function update(Request $request, ClinicalParameter $clinicalParameter): JsonResponse
    {
        $this->authorizeAdmin($request);
        $clinicalParameter->update($this->validateParameter($request, $clinicalParameter));

        return response()->json(['data' => $clinicalParameter->refresh()]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()->hasRole('admin'), 403);
    }

    private function validateParameter(Request $request, ?ClinicalParameter $parameter = null): array
    {
        $validated = $request->validate([
            'key' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', Rule::notIn(array_keys(ObjectiveDataSchema::FIELDS)), Rule::unique('clinical_parameters', 'key')->ignore($parameter?->id)],
            'label' => ['required', 'string', 'max:255'],
            'unit' => ['nullable', 'string', 'max:40'],
            'type' => ['required', Rule::in(['number', 'text'])],
            'min' => ['nullable', 'numeric'],
            'max' => ['nullable', 'numeric', Rule::when($request->filled('min'), ['gte:min'])],
            'group' => ['required', Rule::in(['vitals', 'anthropometry', 'exam'])],
            'is_active' => ['required', 'boolean'],
        ]);
        abort_if($parameter && $validated['key'] !== $parameter->key, 422, 'Cheia unui parametru existent nu poate fi schimbată.');

        return $validated;
    }
}
