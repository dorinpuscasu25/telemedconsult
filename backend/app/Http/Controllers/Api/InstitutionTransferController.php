<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\DecideInstitutionTransferRequest;
use App\Http\Requests\StoreInstitutionTransferRequest;
use App\Models\InstitutionTransfer;
use App\Models\MedicalInstitution;
use App\Services\InstitutionTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InstitutionTransferController extends Controller
{
    public function doctorIndex(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('doctor'), 403);
        $items = InstitutionTransfer::with(['doctor', 'fromInstitution', 'toInstitution'])->where('doctor_id', $request->user()->id)->latest('id')->limit(30)->get();

        return response()->json(['data' => $items->map(fn ($item) => $this->serialize($item))]);
    }

    public function store(StoreInstitutionTransferRequest $request, InstitutionTransferService $service): JsonResponse
    {
        $input = $request->validated();
        $item = $service->request($request->user(), $input['institution_id'], $input['note'] ?? null);

        return response()->json(['message' => 'Cererea a fost trimisă managerului instituției alese. Afilierea actuală se păstrează până la aprobare.', 'transfer' => $this->serialize($item->load('doctor', 'fromInstitution', 'toInstitution'))], 201);
    }

    public function cancel(Request $request, InstitutionTransfer $transfer, InstitutionTransferService $service): JsonResponse
    {
        abort_unless($request->user()->hasRole('doctor'), 403);
        $service->cancel($transfer, $request->user());

        return response()->json(['message' => 'Cererea a fost anulată.']);
    }

    public function index(Request $request): JsonResponse
    {
        $institution = $this->institutionFor($request);
        $input = $request->validate(['status' => ['nullable', 'in:pending,approved,rejected,cancelled'], 'page' => ['nullable', 'integer', 'min:1']]);
        $items = InstitutionTransfer::with(['doctor', 'fromInstitution', 'toInstitution'])
            ->where(fn ($query) => $query->where('from_institution_id', $institution->id)->orWhere('to_institution_id', $institution->id))
            ->when($input['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->latest('id')->paginate(20);
        $items->through(fn ($item) => [...$this->serialize($item), 'direction' => (int) $item->to_institution_id === (int) $institution->id ? 'incoming' : 'outgoing']);

        return response()->json($items);
    }

    public function decide(DecideInstitutionTransferRequest $request, InstitutionTransfer $transfer, InstitutionTransferService $service): JsonResponse
    {
        $institution = $this->institutionFor($request);
        abort_unless((int) $transfer->to_institution_id === (int) $institution->id, 404);
        $service->decide($transfer, $institution, $request->user(), $request->validated());

        return response()->json(['message' => $request->validated('status') === 'approved' ? 'Afilierea medicului a fost aprobată. Programările anterioare păstrează condițiile inițiale.' : 'Cererea a fost respinsă.']);
    }

    private function institutionFor(Request $request): MedicalInstitution
    {
        abort_unless($request->user()->hasRole('institution'), 403);
        $institution = $request->user()->managedInstitution();
        abort_unless($institution?->isActive(), 403, 'Instituția nu este activă sau nu este asociată contului.');

        return $institution;
    }

    private function serialize(InstitutionTransfer $item): array
    {
        return [
            'id' => $item->id, 'doctor_id' => $item->doctor_id, 'doctor_name' => $item->doctor?->name,
            'from_institution' => $item->fromInstitution ? ['id' => $item->fromInstitution->id, 'name' => $item->fromInstitution->name] : null,
            'to_institution' => ['id' => $item->toInstitution->id, 'name' => $item->toInstitution->name],
            'status' => $item->status, 'note' => $item->note, 'decision_note' => $item->decision_note,
            'doctor_share_percent' => $item->doctor_share_percent, 'created_at' => $item->created_at, 'decided_at' => $item->decided_at,
        ];
    }
}
