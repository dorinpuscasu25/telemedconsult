<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_parameters', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->string('label');
            $table->string('unit', 40)->nullable();
            $table->string('type', 20)->default('number');
            $table->decimal('min', 12, 3)->nullable();
            $table->decimal('max', 12, 3)->nullable();
            $table->string('group', 40)->default('exam');
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_parameters');
    }
};
