<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class EmailOtpMail extends Mailable
{
    public function __construct(
        public readonly string $userName,
        public readonly string $code,
        public readonly int $expiresMinutes,
        public readonly string $purpose = 'verify',
        public readonly ?string $actionUrl = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: ($this->purpose === 'login' ? 'Codul tău de autentificare' : 'Confirmă adresa de email').' · telemedconsult.md',
        );
    }

    public function content(): Content
    {
        return new Content(view: 'mail.email-otp', text: 'mail.email-otp-text', with: [
            'copyUrl' => $this->actionUrl ? $this->actionUrl.'&action=copy' : null,
        ]);
    }
}
