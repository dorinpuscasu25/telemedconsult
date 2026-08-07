<?php

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
