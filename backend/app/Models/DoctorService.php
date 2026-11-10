<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un serviciu oferit de medic: tip, preț și durată. Pentru chat, `duration`
 * e numărul de ore în care medicul răspunde; pentru video și domiciliu, minute.
 */
#[Fillable(['doctor_id', 'name', 'type', 'price', 'duration', 'investigations', 'is_active', 'position'])]
class DoctorService extends Model
{
    public const TYPES = ['video', 'chat', 'home'];

    /** Tipul serviciului → felul consultației din fluxul existent. */
    public const KIND = ['video' => 'video', 'chat' => 'preliminary', 'home' => 'with_exam'];

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function consultationKind(): string
    {
        return self::KIND[$this->type] ?? 'video';
    }

    /** @return array<int, string> investigation_type_id => required|optional */
    public function investigationMap(): array
    {
        if ($this->type !== 'home') {
            return [];
        }

        return collect($this->investigations ?? [])
            ->filter(fn ($requirement) => in_array($requirement, ['required', 'optional'], true))
            ->mapWithKeys(fn ($requirement, $id) => [(int) $id => $requirement])
            ->all();
    }

    /** Ce se păstrează pe cerere, ca prețul și numele să nu se schimbe după programare. */
    public function snapshot(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'type' => $this->type,
            'price' => (int) $this->price,
            'duration' => (int) $this->duration,
        ];
    }

    protected function casts(): array
    {
        return [
            'investigations' => 'array',
            'is_active' => 'boolean',
            'price' => 'integer',
            'duration' => 'integer',
            'position' => 'integer',
        ];
    }
}
