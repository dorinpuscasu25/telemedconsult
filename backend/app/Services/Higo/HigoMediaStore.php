<?php

namespace App\Services\Higo;

use App\Models\HigoExamMedia;
use App\Models\HigoExamPayload;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * Descarcă la noi imaginile și înregistrările unei examinări.
 *
 * Url-ul lor e un blob Azure semnat SAS, valabil o oră: dacă am stoca doar
 * linkul, fișa medicului ar fi goală a doua zi. De aceea aducem octeții imediat
 * ce ajunge examinarea și îi ținem pe un disc privat.
 *
 * Nu aruncă niciodată: o imagine care nu se descarcă nu are voie să facă să
 * pice toată ingestia. Eroarea rămâne pe rândul ei și se reia din `higo:remap`.
 */
class HigoMediaStore
{
    /**
     * @var array<string, string>
     */
    private const EXTENSIONS = [
        'image/gif' => 'gif',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/png' => 'png',
        'audio/mpeg' => 'mp3',
        'audio/mp3' => 'mp3',
        'audio/wav' => 'wav',
        'audio/x-wav' => 'wav',
        'audio/webm' => 'webm',
        'audio/ogg' => 'ogg',
        'audio/aac' => 'aac',
        'audio/mp4' => 'm4a',
        'image/webp' => 'webp',
        'image/bmp' => 'bmp',
        'image/tiff' => 'tif',
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
        'video/quicktime' => 'mov',
        'video/x-msvideo' => 'avi',
        'video/mpeg' => 'mpeg',
    ];

    /**
     * Descarcă tot ce lipsește din payload și întoarce câte fișiere sunt
     * disponibile în total pentru examinarea asta.
     */
    public function store(HigoExamPayload $payload): int
    {
        $entries = Arr::get($payload->raw ?? [], 'media', []);

        if (! is_array($entries)) {
            return 0;
        }

        foreach ($entries as $entry) {
            if (! is_array($entry) || blank(Arr::get($entry, 'id'))) {
                continue;
            }

            $this->storeOne($payload, $entry);
        }

        return HigoExamMedia::where('higo_exam_payload_id', $payload->id)
            ->whereNotNull('path')
            ->count();
    }

    /**
     * @param  array<string, mixed>  $entry
     */
    private function storeOne(HigoExamPayload $payload, array $entry): void
    {
        $media = HigoExamMedia::firstOrNew([
            'higo_exam_payload_id' => $payload->id,
            'higo_media_id' => (string) $entry['id'],
        ]);

        // Deja descărcat: url-ul lor a expirat oricum, nu-l mai atingem.
        if ($media->exists && $media->isStored()) {
            return;
        }

        $contentType = (string) ($entry['content_type'] ?? '');

        $media->fill([
            'exam_type' => $entry['exam_type'] ?? null,
            'kind' => $this->kindOf($entry, $contentType),
            'content_type' => $contentType ?: null,
            'sequence' => $entry['sequence'] ?? null,
            'width' => $entry['width'] ?? null,
            'height' => $entry['height'] ?? null,
        ]);

        $url = $entry['url'] ?? null;

        if (! is_string($url) || $url === '') {
            $media->fill(['error' => 'Media fără url în răspunsul HIGO.'])->save();

            return;
        }

        try {
            $response = Http::timeout((int) config('higo.media.timeout', 30))->get($url);
        } catch (Throwable $exception) {
            $media->fill(['error' => Str::limit($exception->getMessage(), 500, '')])->save();

            return;
        }

        if (! $response->successful()) {
            // Un 403 aici înseamnă aproape sigur semnătură expirată: fișierul se
            // poate lua din nou doar re-aducând examinarea (`higo:pull`).
            $media->fill(['error' => 'HTTP '.$response->status().' la descărcarea fișierului.'])->save();

            return;
        }

        // Ce spune blobul la descărcare bate ce a declarat resursa lor: dacă
        // `Media.content.contentType` lipsea, aici aflăm dacă e sunet, film sau
        // imagine — și cu ce se redă în fișă.
        $servedType = trim(explode(';', (string) $response->header('Content-Type'))[0]);

        if ($contentType === '' && $servedType !== '') {
            $contentType = $servedType;
            $media->fill([
                'content_type' => $servedType,
                'kind' => HigoExamMedia::kindFor($servedType),
            ]);
        }

        $disk = (string) config('higo.media.disk', 'local');
        $path = 'higo/exams/'.$payload->id.'/'.$media->higo_media_id.'.'.$this->extensionFor($contentType, $servedType);

        try {
            Storage::disk($disk)->put($path, $response->body());
        } catch (Throwable $exception) {
            Log::warning('HIGO: fișierul examinării nu s-a putut scrie pe disc', [
                'payload_id' => $payload->id,
                'media_id' => $media->higo_media_id,
                'error' => $exception->getMessage(),
            ]);

            $media->fill(['error' => Str::limit($exception->getMessage(), 500, '')])->save();

            return;
        }

        $media->fill([
            'disk' => $disk,
            'path' => $path,
            'size_bytes' => strlen($response->body()),
            'error' => null,
            'fetched_at' => now(),
        ])->save();
    }

    /**
     * Tipul îl dă întâi resursa lor; dacă `kind` a venit deja calculat de
     * fetcher, îl respectăm, dar numai dacă e o valoare pe care o cunoaștem.
     *
     * @param  array<string, mixed>  $entry
     */
    private function kindOf(array $entry, string $contentType): string
    {
        $declared = (string) ($entry['kind'] ?? '');

        if (in_array($declared, [HigoExamMedia::KIND_AUDIO, HigoExamMedia::KIND_VIDEO, HigoExamMedia::KIND_IMAGE], true)) {
            return $declared;
        }

        return HigoExamMedia::kindFor($contentType);
    }

    private function extensionFor(string $declared, ?string $actual): string
    {
        foreach ([$declared, (string) $actual] as $type) {
            $type = trim(explode(';', $type)[0]);

            if (isset(self::EXTENSIONS[$type])) {
                return self::EXTENSIONS[$type];
            }
        }

        return 'bin';
    }
}
