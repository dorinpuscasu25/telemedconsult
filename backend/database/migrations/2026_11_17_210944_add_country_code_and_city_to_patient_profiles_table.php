<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('country_code', 2)->nullable()->index();
            $table->string('city', 120)->nullable();
        });
        DB::table('patient_profiles')->whereNull('country')->orWhereIn('country', ['', 'Republica Moldova', 'Moldova', 'MD'])->update(['country_code' => 'MD']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropColumn(['country_code', 'city']);
        });
    }
};
