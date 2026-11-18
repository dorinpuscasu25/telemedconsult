<?php

use App\Services\PlatformConfig;
use App\Services\ReferralProgram;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::table('platform_settings')->where('key', ReferralProgram::DOCTOR_RATE_SETTING)->exists()) {
            app(PlatformConfig::class)->upsert(ReferralProgram::DOCTOR_RATE_SETTING, 10);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Valoarea anterioară rămâne în platform_setting_versions.
    }
};
