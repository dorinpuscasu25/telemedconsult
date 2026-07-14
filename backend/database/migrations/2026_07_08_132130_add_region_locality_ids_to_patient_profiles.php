<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->foreignId('region_id')->nullable()->after('locality')->constrained('regions')->nullOnDelete();
            $table->foreignId('locality_id')->nullable()->after('region_id')->constrained('localities')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('locality_id');
            $table->dropConstrainedForeignId('region_id');
        });
    }
};
