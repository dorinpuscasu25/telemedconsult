<?php

namespace App\Services;

use App\Models\DoctorInvestigationRequirement;
use App\Models\DoctorService;
use App\Models\InvestigationType;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Serviciile medicului așa cum le văd medicul și pacientul, plus sincronizarea
 * câmpurilor vechi (`video_price`, `consultation_price`, investigațiile cerute)
 * pe care le mai citesc fluxurile existente.
 */
class DoctorServiceCatalog
{
    /**
     * @param  Collection<int, DoctorService>  $services
     * @return list<array<string, mixed>>
     */
    public function serialize(Collection $services): array
    {
        $ids = $services->flatMap(fn (DoctorService $service) => array_keys($service->investigationMap()))->unique()->values();
        $types = $ids->isEmpty() ? collect() : InvestigationType::whereIn('id', $ids)->get()->keyBy('id');

        return $services->map(fn (DoctorService $service) => [
            'id' => (string) $service->id,
            'name' => $service->name,
            'type' => $service->type,
            'price' => (int) $service->price,
            'duration' => (int) $service->duration,
            'is_active' => (bool) $service->is_active,
            'position' => (int) $service->position,
            'investigations' => collect($service->investigationMap())
                ->map(fn (string $requirement, int $id) => [
                    'id' => $id,
                    'name' => $types->get($id)?->name,
                    'code' => $types->get($id)?->code,
                    'price' => (int) ($types->get($id)?->default_price ?? 0),
                    'requirement' => $requirement,
                ])
                ->filter(fn (array $item) => $item['name'] !== null)
                ->values()
                ->all(),
        ])->values()->all();
    }

    /** @return list<array<string, mixed>> */
    public function activeFor(User $doctor): array
    {
        return $this->serialize($doctor->doctorServices()->where('is_active', true)->get());
    }

    /**
     * Prețurile vechi urmează serviciile active: cel mai mic preț video și cel
     * mai mic preț la domiciliu. Investigațiile cerute vin de la primul serviciu
     * la domiciliu activ.
     */
    public function syncLegacy(User $doctor): void
    {
        $profile = $doctor->doctorProfile;
        if (! $profile) {
            return;
        }

        $active = $doctor->doctorServices()->where('is_active', true)->get();
        $video = $active->whereIn('type', ['video', 'chat'])->sortBy('price')->first();
        $home = $active->where('type', 'home')->sortBy('price')->first();

        $profile->forceFill([
            'video_price' => $video?->price ?? $profile->video_price,
            'video_duration_minutes' => $video && $video->type === 'video' ? max(5, min(180, $video->duration)) : $profile->video_duration_minutes,
            'consultation_price' => $home?->price ?? 0,
        ])->save();

        DoctorInvestigationRequirement::where('doctor_id', $doctor->id)->delete();
        $map = $home?->investigationMap() ?? [];
        foreach ($map as $typeId => $requirement) {
            DoctorInvestigationRequirement::create(['doctor_id' => $doctor->id, 'investigation_type_id' => $typeId, 'requirement' => $requirement]);
        }

        $requiredNames = InvestigationType::whereIn('id', array_keys(array_filter($map, fn ($requirement) => $requirement === 'required')))
            ->orderBy('name')
            ->pluck('name')
            ->map(fn (string $name) => ['name' => $name])
            ->values()
            ->all();
        $profile->forceFill(['required_investigations' => $requiredNames])->save();
    }
}
