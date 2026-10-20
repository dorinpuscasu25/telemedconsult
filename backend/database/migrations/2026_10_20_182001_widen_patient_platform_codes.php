<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('patient_code', 15)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Existing fifteen-digit identifiers must never be truncated or reassigned.
    }
};
