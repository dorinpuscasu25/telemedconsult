<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('patient_profiles')->where('is_free', true)->whereNotNull('active_until')->update(['active_until' => null]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Termenele istorice eliminate nu se reconstruiesc arbitrar la rollback.
    }
};
