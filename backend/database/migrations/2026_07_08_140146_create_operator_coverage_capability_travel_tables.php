<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('operator_coverage', function (Blueprint $table) {
            $table->id();
            $table->foreignId('operator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('region_id')->constrained('regions')->cascadeOnDelete();
            $table->foreignId('locality_id')->nullable()->constrained('localities')->cascadeOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['operator_id', 'region_id', 'locality_id']);
            $table->index(['region_id', 'locality_id', 'is_active']);
        });

        Schema::create('operator_capabilities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('operator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('investigation_type_id')->constrained('investigation_types')->cascadeOnDelete();
            $table->unsignedInteger('price_override')->nullable();
            $table->timestamps();

            $table->unique(['operator_id', 'investigation_type_id']);
        });

        Schema::create('operator_travel_fees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('operator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('region_id')->constrained('regions')->cascadeOnDelete();
            $table->foreignId('locality_id')->nullable()->constrained('localities')->cascadeOnDelete();
            $table->unsignedInteger('fee')->default(0);
            $table->timestamps();

            $table->unique(['operator_id', 'region_id', 'locality_id']);
        });

        Schema::table('operator_profiles', function (Blueprint $table) {
            $table->boolean('accepting_requests')->default(true)->after('is_available');
        });
    }

    public function down(): void
    {
        Schema::table('operator_profiles', function (Blueprint $table) {
            $table->dropColumn('accepting_requests');
        });

        Schema::dropIfExists('operator_travel_fees');
        Schema::dropIfExists('operator_capabilities');
        Schema::dropIfExists('operator_coverage');
    }
};
