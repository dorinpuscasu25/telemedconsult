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
    ) {}

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
        $text = '<b>'.e($this->title).'</b>'."\n".e($this->body);

        if ($this->url) {
            $text .= "\n".$this->url;
        }

        return ['text' => $text];
    }
}
