<?php

namespace App\Notifications;

use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** Emailul cu linkul de acceptare trimis medicului invitat de o instituție. */
class InstitutionInvitationNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $institutionName,
        private readonly ?string $doctorName,
        private readonly string $url,
        private readonly CarbonInterface $expiresAt,
        private readonly bool $hasAccount,
    ) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Invitație de la '.$this->institutionName.' · telemedconsult.md')
            ->greeting($this->doctorName ? 'Bună, '.$this->doctorName : 'Bună ziua')
            ->line($this->institutionName.' te invită să faci consultații pe telemedconsult.md ca medic al instituției.')
            ->line($this->hasAccount
                ? 'Ai deja cont pe platformă: autentifică-te și acceptă invitația.'
                : 'Îți creezi contul în câteva secunde: alegi o parolă și ești gata.')
            ->action('Vezi invitația', $this->url)
            ->line('Linkul este valabil până la '.$this->expiresAt->timezone(config('app.timezone'))->format('d.m.Y H:i').'.');
    }
}
