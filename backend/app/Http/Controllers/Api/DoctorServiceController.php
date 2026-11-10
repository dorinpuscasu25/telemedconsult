<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DoctorService;
use App\Models\InvestigationType;
use App\Models\User;
use App\Services\DoctorServiceCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * „Servicii și prețuri” din profilul medicului: fiecare serviciu are tip,
 * preț și durată; investigațiile se pun doar pe cele la domiciliu.
 */
class DoctorServiceController extends Controller
{
    public function __construct(private DoctorServiceCatalog $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $doctor = $this->doctor($request);

        return response()->json(['data' => $this->catalog->serialize($doctor->doctorServices()->get())]);
    }

    public function store(Request $request): JsonResponse
    {
        $doctor = $this->doctor($request);
        $validated = $this->validated($request);

        $service = $doctor->doctorServices()->create([
            ...$validated,
            'position' => (int) $doctor->doctorServices()->max('position') + 1,
        ]);
        $this->catalog->syncLegacy($doctor);

        return response()->json([
            'message' => 'Serviciul a fost adăugat.',
            'service' => $this->catalog->serialize(collect([$service->fresh()]))[0],
        ], 201);
    }

    public function update(Request $request, DoctorService $doctorService): JsonResponse
    {
        $doctor = $this->doctor($request);
        abort_unless($doctorService->doctor_id === $doctor->id, 404);

        $doctorService->update($this->validated($request, partial: true));
        $this->catalog->syncLegacy($doctor);

        return response()->json([
            'message' => 'Serviciul a fost salvat.',
            'service' => $this->catalog->serialize(collect([$doctorService->fresh()]))[0],
        ]);
    }

    public function destroy(Request $request, DoctorService $doctorService): JsonResponse
    {
        $doctor = $this->doctor($request);
        abort_unless($doctorService->doctor_id === $doctor->id, 404);

        $doctorService->delete();
        $this->catalog->syncLegacy($doctor);

        return response()->json(['message' => 'Serviciul a fost șters.']);
    }

    public function reorder(Request $request): JsonResponse
    {
        $doctor = $this->doctor($request);
        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer'],
        ]);

        foreach (array_values($validated['ids']) as $position => $id) {
            $doctor->doctorServices()->whereKey($id)->update(['position' => $position]);
        }

        return response()->json(['data' => $this->catalog->serialize($doctor->doctorServices()->get())]);
    }

    private function doctor(Request $request): User
    {
        $doctor = $request->user()->loadMissing(['roles', 'doctorProfile']);
        abort_unless($doctor->hasRole('doctor'), 403, 'Ai nevoie de rol medic.');

        return $doctor;
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $validated = $request->validate([
            'name' => [$required, 'string', 'max:120'],
            'type' => [$required, Rule::in(DoctorService::TYPES)],
            'price' => [$required, 'integer', 'min:0', 'max:100000'],
            'duration' => [$required, 'integer', 'min:1', 'max:720'],
            'is_active' => ['sometimes', 'boolean'],
            'investigations' => ['nullable', 'array'],
            'investigations.*' => [Rule::in(['required', 'optional'])],
        ], [
            'name.required' => 'Scrie denumirea serviciului.',
            'price.required' => 'Scrie prețul serviciului.',
            'duration.min' => 'Durata trebuie să fie de cel puțin 1.',
        ]);

        $type = $validated['type'] ?? $request->route('doctorService')?->type;
        if (array_key_exists('investigations', $validated) || isset($validated['type'])) {
            $validated['investigations'] = $type === 'home'
                ? collect($validated['investigations'] ?? [])
                    ->filter(fn ($requirement, $id) => is_numeric($id) && InvestigationType::whereKey((int) $id)->exists())
                    ->all()
                : null;
        }

        return $validated;
    }
}
