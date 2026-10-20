<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->string('clinic_logo_path')->nullable();
            $table->string('clinic_logo_mime')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('doctor_profiles', fn (Blueprint $table) => $table->dropColumn(['clinic_logo_path', 'clinic_logo_mime']));
    }
};
