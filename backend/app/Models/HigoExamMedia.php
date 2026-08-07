<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * O imagine sau o înregistrare dintr-o examinare HIGO, descărcată la noi.
 */
#[Fillable([
    'higo_exam_payload_id', 'consultation_request_id', 'higo_media_id', 'exam_type',
    'kind', 'content_type', 'sequence', 'disk', 'path', 'size_bytes', 'width',
    'height', 'error', 'fetched_at',
])]
class HigoExamMedia extends Model
{
    public const KIND_IMAGE = 'image';

    public const KIND_AUDIO = 'audio';

    public const KIND_VIDEO = 'video';

    protected $table = 'higo_exam_media';

    /**
     * Tipul de fișier hotărăște cu ce se redă în fișă: `<img>`, `<audio>` sau
     * `<video>`. Otoscopul lor trimite și secvențe filmate, nu doar cadre —
     * clasificate ca imagini, ar apărea în fișă ca poze rupte.
     */
    public static function kindFor(?string $contentType): string
    {
        $contentType = mb_strtolower(trim((string) $contentType));

        return match (true) {
            str_starts_with($contentType, 'audio/') => self::KIND_AUDIO,
            str_starts_with($contentType, 'video/') => self::KIND_VIDEO,
            default => self::KIND_IMAGE,
        };
    }

    public function payload(): BelongsTo
    {
        return $this->belongsTo(HigoExamPayload::class, 'higo_exam_payload_id');
    }

    public function consultationRequest(): BelongsTo
    {
        return $this->belongsTo(ConsultationRequest::class);
    }

    /**
     * Fișierul a fost descărcat cu succes și există pe disc.
     */
    public function isStored(): bool
    {
        return filled($this->path);
    }

    protected function casts(): array
    {
        return [
            'fetched_at' => 'datetime',
        ];
    }
}
