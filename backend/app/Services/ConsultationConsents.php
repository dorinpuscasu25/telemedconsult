<?php

namespace App\Services;

use App\Models\ConsultationConsent;
use App\Models\ConsultationRequest;
use App\Models\ContractTemplate;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class ConsultationConsents
{
    public const TYPES = ['medical_consultation_consent', 'data_processing_consent'];

    public function templates(bool $lock = false): Collection
    {
        $templates = ContractTemplate::whereIn('type', self::TYPES)->where('status', 'active')->when($lock, fn ($q) => $q->lockForUpdate())->latest('id')->get()->unique('type')->values();
        if ($templates->count() !== 2) {
            return collect();
        }

        return $templates->map(fn ($template) => ['template_id' => $template->id, 'type' => $template->type, 'title' => $template->title, 'content' => $template->content, 'version' => hash('sha256', $template->id.'|'.$template->type.'|'.$template->title.'|'.$template->content)]);
    }

    public function record(ConsultationRequest $item, Request $request): void
    {
        $templates = $this->templates(true);
        if ($templates->isEmpty()) {
            return;
        }
        $input = $request->validate(['consents' => ['required', 'array', 'size:2'], 'consents.*.template_id' => ['required', 'integer', 'distinct'], 'consents.*.version' => ['required', 'string', 'size:64'], 'consents.*.accepted' => ['required', 'accepted'], 'consent_capacity' => ['required', 'in:self,representative'], 'representative_name' => ['required_if:consent_capacity,representative', 'nullable', 'string', 'max:255'], 'representative_relationship' => ['required_if:consent_capacity,representative', 'nullable', 'string', 'max:255']]);
        foreach ($templates as $template) {
            $accepted = collect($input['consents'])->firstWhere('template_id', $template['template_id']);
            if (! $accepted || ! hash_equals($template['version'], $accepted['version'])) {
                throw ValidationException::withMessages(['consents' => 'Documentele s-au actualizat. Recitește și acceptă versiunile curente.']);
            }
            ConsultationConsent::create(['consultation_request_id' => $item->id, 'patient_profile_id' => $item->patient_profile_id, 'accepted_by' => $request->user()->id, 'type' => $template['type'], 'version' => $template['version'], 'snapshot' => [...$template, 'acceptor_name' => $request->user()->name, 'capacity' => $input['consent_capacity'], 'representative_name' => $input['representative_name'] ?? null, 'representative_relationship' => $input['representative_relationship'] ?? null], 'accepted_at' => now()]);
        }
    }

    public function evidence(?int $requestId): array
    {
        if (! $requestId) {
            return [];
        }

        return ConsultationConsent::where('consultation_request_id', $requestId)->orderBy('id')->get()->map(fn ($consent) => ['id' => $consent->id, 'type' => $consent->type, 'version' => $consent->version, 'accepted_at' => $consent->accepted_at?->toISOString(), 'accepted_by' => $consent->accepted_by, 'patient_profile_id' => $consent->patient_profile_id, ...$consent->snapshot])->all();
    }
}
