<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('doctor_investigation_requirements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('doctor_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('investigation_type_id')->constrained('investigation_types')->cascadeOnDelete();
            $table->string('requirement')->default('required');
            $table->timestamps();

            $table->unique(['doctor_id', 'investigation_type_id'], 'doctor_investigation_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('doctor_investigation_requirements');
    }
};
