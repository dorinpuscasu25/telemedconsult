<?php

use App\Models\PlatformSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        PlatformSetting::where('key', 'consultations.addendum_days')->update(['value' => json_encode(10)]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
