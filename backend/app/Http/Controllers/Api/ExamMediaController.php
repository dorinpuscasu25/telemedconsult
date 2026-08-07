<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HigoExamMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Servește imaginile, înregistrările și filmările unei examinări HIGO.
 *
 * Fișierele stau pe un disc privat, nu în `public/`: sunt date medicale.
 * Accesul se face prin url semnat, cu viață scurtă, generat doar în fișa
 * consultației — deci îl primesc exact cei care au voie să vadă consultația
 * (`WorkflowController::serializeExamMedia()`). E aceeași metodă pe care o
 * folosesc și ei pentru bloburile lor, și singura care lasă `<img>`, `<audio>`
 * și `<video>` să încarce direct, fără antet de autentificare.
 */
class ExamMediaController extends Controller
{
    public function show(Request $request, HigoExamMedia $media): Response
    {
        abort_unless($media->isStored(), 404, 'Fișierul examinării nu a fost descărcat.');

        $disk = Storage::disk($media->disk ?: (string) config('higo.media.disk', 'local'));

        abort_unless($disk->exists($media->path), 404, 'Fișierul examinării lipsește de pe disc.');

        $headers = [
            'Content-Type' => $media->content_type ?: 'application/octet-stream',
        ];

        // Auscultațiile și filmările se ascultă/urmăresc cu derulare, iar
        // derularea are nevoie de cereri parțiale. Un `StreamedResponse` nu știe
        // `Range`, deci pe discul local servim fișierul ca atare: Symfony
        // răspunde atunci cu 206 și browserul poate sări în înregistrare.
        $path = $this->localPath($disk, $media->path);

        $response = $path !== null
            ? tap(new BinaryFileResponse($path, 200, $headers))->setAutoLastModified()
            : $this->streamed($disk, $media, $headers);

        // Fișa se deschide de mai multe ori și fișierul nu se schimbă niciodată,
        // dar sunt date medicale: `private` ține fișierul în browserul celui
        // care are dreptul, nu într-un proxy sau CDN de pe traseu. Se setează
        // prin API, nu ca antet brut — antetul brut e recalculat de Symfony
        // când se adaugă `Last-Modified`, și ajungea „public”.
        $response->setPrivate();
        $response->setMaxAge(3600);

        return $response;
    }

    /**
     * Calea absolută pe disc, dacă discul e local. Pentru S3 și restul nu
     * există fișier de servit direct.
     */
    private function localPath(mixed $disk, string $relativePath): ?string
    {
        if (! method_exists($disk, 'path')) {
            return null;
        }

        $path = $disk->path($relativePath);

        return is_string($path) && is_file($path) ? $path : null;
    }

    /**
     * @param  array<string, string>  $headers
     */
    private function streamed(mixed $disk, HigoExamMedia $media, array $headers): StreamedResponse
    {
        return $disk->response($media->path, basename($media->path), $headers);
    }
}
