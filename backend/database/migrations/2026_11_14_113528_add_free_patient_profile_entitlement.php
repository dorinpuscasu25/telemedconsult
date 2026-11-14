<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('free_patient_profile_claimed_at')->nullable();
        });
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->boolean('is_free')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropColumn('is_free');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('free_patient_profile_claimed_at');
        });
    }
};
