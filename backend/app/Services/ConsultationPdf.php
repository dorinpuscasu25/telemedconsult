<?php

namespace App\Services;

use Dompdf\Dompdf;
use Dompdf\Options;

class ConsultationPdf
{
    public function render(array $snapshot): string
    {
        $options = new Options;
        $options->setIsRemoteEnabled(false);
        $options->setIsPhpEnabled(false);
        $options->setDefaultFont('DejaVu Sans');
        $options->setChroot(storage_path('app'));
        $pdf = new Dompdf($options);
        $pdf->setPaper('A4');
        $pdf->loadHtml(view('medical.consultation', ['record' => $snapshot])->render(), 'UTF-8');
        $pdf->render();
        $footer = mb_strimwidth((string) ($snapshot['clinic'] ?? 'telemedconsult.md'), 0, 45, '…').' · Document #'.$snapshot['document_id'].' · Cod pacient '.$snapshot['patient_code'];
        $pdf->getCanvas()->page_text(48, 814, $footer, $pdf->getFontMetrics()->getFont('DejaVu Sans', 'normal'), 8, [0.4, 0.45, 0.5]);
        $pdf->getCanvas()->page_text(510, 814, '{PAGE_NUM} / {PAGE_COUNT}', $pdf->getFontMetrics()->getFont('DejaVu Sans', 'normal'), 8, [0.4, 0.45, 0.5]);

        return $pdf->output();
    }
}
