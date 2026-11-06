<?php

use App\Services\FeatureFlags;
use App\Services\PlatformConfig;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Notificările Telegram fuseseră oprite din Admin → Module. Le repornim la nivel
 * de platformă; fiecare utilizator le poate opri în continuare din pagina lui.
 */
return new class extends Migration
{
    public function up(): void
    {
        $key = FeatureFlags::PREFIX.'telegram_notifications';

        if (DB::table('platform_settings')->where('key', $key)->exists()) {
            app(PlatformConfig::class)->upsert($key, true, FeatureFlags::GROUP, 'boolean');
        }
    }

    public function down(): void {}
};
