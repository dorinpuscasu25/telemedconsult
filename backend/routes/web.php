<?php

use Illuminate\Support\Facades\Route;

/*
 * Backend-ul servește doar API-ul. Interfața e aplicația din `frontend/`,
 * deci cine deschide rădăcina e trimis acolo.
 */
Route::get('/', fn () => redirect()->away(rtrim((string) config('services.frontend_url', config('app.url')), '/')))->name('home');
