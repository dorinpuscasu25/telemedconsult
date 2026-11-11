<?php

namespace App\Notifications;

use App\Notifications\Channels\TelegramChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AppEventNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $title,
        private readonly string $body,
        private readonly ?string $url = null,
        private readonly string $level = 'info',
        private readonly bool $sendEmail = true,
        private readonly ?string $category = null,
    ) {}

    /**
     * Categoria pentru preferințele de Telegram: requests, messages, payments
     * sau reminders. Când nu e dată, se deduce din titlu; restul trec mereu.
     */
    public function telegramCategory(): ?string
    {
        if ($this->category !== null) {
            return $this->category;
        }

        $title = mb_strtolower($this->title);

        return match (true) {
            str_contains($title, 'mesaj') => 'messages',
            str_contains($title, 'plat') || str_contains($title, 'ai primit') || str_contains($title, 'extrager') => 'payments',
            str_contains($title, 'consultație nouă') || str_contains($title, 'examinare nouă') || str_contains($title, 'cere alte ore') || str_contains($title, 'a ales ora') => 'requests',
            default => null,
        };
    }

    public function via(object $notifiable): array
    {
        return ['database', TelegramChannel::class];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject($this->title)
            ->greeting('Bună, '.$notifiable->name)
            ->line($this->body);

        if ($this->url) {
            $message->action('Deschide telemedconsult.md', $this->url);
        }

        return $message;
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->title,
            'body' => $this->body,
            'url' => $this->url,
            'level' => $this->level,
        ];
    }

    public function toTelegram(object $notifiable): array
    {
        $text = '<b>'.e($this->title).'</b>'."\n".'Ai o actualizare în platformă. Deschide contul pentru detalii.';
        $url = $this->url ? (str_starts_with($this->url, '/') ? rtrim(config('services.frontend_url'), '/').$this->url : $this->url) : null;

        // Telegram primește butoane doar cu adrese https; altfel linkul rămâne în text.
        if ($url && str_starts_with($url, 'https://')) {
            return ['text' => $text, 'reply_markup' => ['inline_keyboard' => [[['text' => 'Deschide în aplicație', 'url' => $url]]]]];
        }
        if ($url) {
            $text .= "\n".e($url);
        }

        return ['text' => $text];
    }
}
