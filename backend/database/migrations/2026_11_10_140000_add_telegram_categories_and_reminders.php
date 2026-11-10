<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pe Telegram utilizatorul alege ce primește: cereri noi, mesaje, plăți și
     * reamintiri cu 15 minute înainte de consultație. `doctor_reminded_at`
     * împiedică trimiterea aceleiași reamintiri de două ori.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('telegram_preferences')->nullable()->after('telegram_notifications_enabled');
        });
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->timestamp('doctor_reminded_at')->nullable()->after('doctor_started_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('telegram_preferences');
        });
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropColumn('doctor_reminded_at');
        });
    }
};
