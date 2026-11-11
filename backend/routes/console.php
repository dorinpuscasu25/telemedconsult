<?php

use App\Services\TelegramBot;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Aducerea periodică a examinărilor din HIGO.
 *
 * Webhook-ul lor rămâne calea preferată — datele ajung în secunde. Cât timp
 * abonarea nu e activă, comanda de mai jos face aceeași treabă la interval.
 * Cele două nu se bat cap în cap: `external_id` e unic, deci o examinare adusă
 * pe ambele căi nu produce date duble.
 */
Schedule::command('higo:pull')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

/*
 * Banii consultațiilor: închide și plătește consultațiile fără recenzie ajunse
 * la termen și returnează banii celor care nu au avut loc.
 */
Schedule::command('consultations:settle')
    ->everyTenMinutes()
    ->withoutOverlapping();

/*
 * Reamintirea medicului cu 15 minute înainte de consultație.
 */
Schedule::command('consultations:remind')
    ->everyMinute()
    ->withoutOverlapping();

/*
 * Botul de Telegram se repară singur: dacă webhook-ul s-a pierdut sau arată
 * spre altă adresă, îl înregistrează din nou. În modul polling (TELEGRAM_MODE)
 * serverul citește singur mesajele la câteva secunde, fără webhook.
 */
Schedule::command('telegram:webhook ensure')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->when(fn () => app(TelegramBot::class)->configured());

Schedule::command('telegram:poll')
    ->everyFiveSeconds()
    ->withoutOverlapping()
    ->when(fn () => app(TelegramBot::class)->configured() && app(TelegramBot::class)->polling());
