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
        Schema::table('institution_earnings', function (Blueprint $table) {
            $table->index(['medical_institution_id', 'created_at', 'doctor_id'], 'institution_earnings_period_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('institution_earnings', function (Blueprint $table) {
            $table->dropIndex('institution_earnings_period_index');
        });
    }
};
