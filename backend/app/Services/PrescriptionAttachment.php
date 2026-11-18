<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use setasign\Fpdi\Fpdi;
use setasign\Fpdi\PdfParser\PdfParser;
use setasign\Fpdi\PdfParser\StreamReader;
use setasign\Fpdi\PdfParser\Type\PdfDictionary;
use setasign\Fpdi\PdfParser\Type\PdfNull;
use setasign\Fpdi\PdfParser\Type\PdfType;
use setasign\Fpdi\PdfReader\PdfReader;
use Throwable;

class PrescriptionAttachment
{
    public const MAX_PAGES = 100;

    /** @return array{file: UploadedFile, mime: string, pdf: string, page_count: int} */
    public function prepare(UploadedFile $file): array
    {
        $bytes = $file->getContent();
        $mime = $file->getMimeType();
        try {
            if ($mime === 'application/pdf') {
                $this->assertStaticPdf($bytes);
                $pdf = $this->writer();
                $pages = $this->copyPages($pdf, $bytes);
                $prepared = $pdf->Output('S');
            } elseif (in_array($mime, ['image/jpeg', 'image/png'], true)) {
                $prepared = $this->imagePdf($file);
                $pages = 1;
            } else {
                throw new \RuntimeException('Unsupported prescription type.');
            }
        } catch (Throwable $exception) {
            if ($exception instanceof ValidationException) {
                throw $exception;
            }
            throw ValidationException::withMessages(['prescription' => ['Rețeta nu poate fi inclusă în PDF. Încarcă o fotografie JPG/PNG sau un PDF scanat, fără parolă, formulare ori adnotări, cu cel mult '.self::MAX_PAGES.' de pagini. Pentru un PDF incompatibil, exportă-l din nou ca document static.']]);
        }

        return ['file' => $file, 'mime' => $mime, 'pdf' => $prepared, 'page_count' => $pages];
    }

    public function append(string $document, string $prescription): string
    {
        $pdf = $this->writer();
        $this->copyPages($pdf, $document);
        $this->copyPages($pdf, $prescription);

        return $pdf->Output('S');
    }

    private function writer(): Fpdi
    {
        $pdf = new Fpdi;
        $pdf->SetAutoPageBreak(false);
        $pdf->SetMargins(0, 0, 0);

        return $pdf;
    }

    private function copyPages(Fpdi $pdf, string $bytes): int
    {
        $count = $pdf->setSourceFile(StreamReader::createByString($bytes));
        for ($page = 1; $page <= $count; $page++) {
            $template = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($template);
            $pdf->AddPage($size['orientation'], [$size['width'], $size['height']]);
            $pdf->useTemplate($template);
        }

        return $count;
    }

    private function assertStaticPdf(string $bytes): void
    {
        $parser = new PdfParser(StreamReader::createByString($bytes));
        $reader = new PdfReader($parser);
        if ($reader->getPageCount() < 1 || $reader->getPageCount() > self::MAX_PAGES) {
            throw new \RuntimeException('Unsupported prescription page count.');
        }
        foreach (['AcroForm', 'OCProperties', 'Perms'] as $key) {
            if (! PdfType::resolve(PdfDictionary::get($parser->getCatalog(), $key), $parser) instanceof PdfNull) {
                throw new \RuntimeException('Dynamic or signed prescription PDF.');
            }
        }
        for ($page = 1; $page <= $reader->getPageCount(); $page++) {
            $annotations = PdfType::resolve(PdfDictionary::get($reader->getPage($page)->getPageDictionary(), 'Annots'), $parser);
            if (! $annotations instanceof PdfNull && $annotations->value !== []) {
                throw new \RuntimeException('Prescription PDF contains annotations.');
            }
        }
    }

    private function imagePdf(UploadedFile $file): string
    {
        $size = getimagesize($file->getRealPath());
        if (! $size || $size[0] * $size[1] > 16000000) {
            throw ValidationException::withMessages(['prescription' => ['Imaginea rețetei trebuie să fie JPG/PNG, de cel mult 16 megapixeli. Redimensionează fotografia și reîncearcă.']]);
        }
        $orientation = 1;
        if ($size[2] === IMAGETYPE_JPEG && str_contains($file->getContent(), "Exif\0\0")) {
            if (! function_exists('exif_read_data')) {
                throw ValidationException::withMessages(['prescription' => ['Salvează fotografia ca PNG sau PDF scanat pentru a păstra orientarea corectă.']]);
            }
            $orientation = (int) (@exif_read_data($file->getRealPath(), 'IFD0', true)['IFD0']['Orientation'] ?? 1);
            if (! in_array($orientation, [1, 3, 6, 8], true)) {
                throw ValidationException::withMessages(['prescription' => ['Fotografia conține o orientare cu oglindire. Salveaz-o ca PNG sau PDF scanat pentru a păstra aspectul corect.']]);
            }
        }
        $pdf = $this->writer();
        $landscape = $size[0] > $size[1];
        $pageWidth = $landscape ? 297 : 210;
        $pageHeight = $landscape ? 210 : 297;
        $scale = min(($pageWidth - 20) / $size[0], ($pageHeight - 20) / $size[1]);
        $width = $size[0] * $scale;
        $height = $size[1] * $scale;
        $pdf->AddPage($landscape ? 'L' : 'P', 'A4', match ($orientation) {
            3 => 180, 6 => 90, 8 => 270, default => 0
        });
        $pdf->Image($file->getRealPath(), ($pageWidth - $width) / 2, ($pageHeight - $height) / 2, $width, $height, $size[2] === IMAGETYPE_JPEG ? 'JPG' : 'PNG');

        return $pdf->Output('S');
    }
}
