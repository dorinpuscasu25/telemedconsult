<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class PublicImageStorage
{
    /**
     * @template TResult
     *
     * @param  callable(?string): TResult  $persist
     * @return TResult
     */
    public function persistReplacement(
        ?UploadedFile $image,
        string $directory,
        callable $persist,
        ?string $currentUrl = null,
        bool $removeCurrent = false,
    ): mixed {
        if (! $image && ! $removeCurrent) {
            return $persist($currentUrl);
        }

        $newUrl = null;

        if ($image) {
            $path = $image->store($directory, 'public');

            if (! $path) {
                throw new RuntimeException('Imaginea nu a putut fi salvată.');
            }

            $newUrl = Storage::disk('public')->url($path);
        }

        try {
            $result = $persist($newUrl);
        } catch (Throwable $exception) {
            $this->delete($newUrl);

            throw $exception;
        }

        $this->delete($currentUrl);

        return $result;
    }

    public function delete(?string $url): void
    {
        if (! $url) {
            return;
        }

        $urlPath = parse_url($url, PHP_URL_PATH);
        $urlHost = parse_url($url, PHP_URL_HOST);
        $publicDiskHost = parse_url((string) config('filesystems.disks.public.url'), PHP_URL_HOST);

        if (is_string($urlHost) && $urlHost !== '' && $urlHost !== $publicDiskHost) {
            return;
        }

        if (! is_string($urlPath) || ! Str::startsWith($urlPath, '/storage/')) {
            return;
        }

        $relativePath = rawurldecode(Str::after($urlPath, '/storage/'));

        if ($relativePath === '' || Str::contains($relativePath, ['..', '\\'])) {
            return;
        }

        Storage::disk('public')->delete($relativePath);
    }
}
