<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class AdminWalletConfirmationMail extends Mailable
{
    public function __construct(
        public readonly string $code,
        public readonly string $beneficiaryName,
        public readonly string $beneficiaryEmail,
        public readonly string $operation,
        public readonly array $payload,
        public readonly string $expiresAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Confirmă operația cu puncte · telemedconsult.md');
    }

    public function content(): Content
    {
        return new Content(view: 'mail.admin-wallet-confirmation', text: 'mail.admin-wallet-confirmation-text');
    }
}
