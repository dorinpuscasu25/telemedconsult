<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('doctor_profiles', fn (Blueprint $table) => $table->unsignedTinyInteger('points_payment_percent')->nullable());
    }

    public function down(): void
    {
        Schema::table('doctor_profiles', fn (Blueprint $table) => $table->dropColumn('points_payment_percent'));
    }
};
