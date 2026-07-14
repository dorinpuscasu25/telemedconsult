<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('regions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type')->default('raion');
            $table->string('country')->default('Republica Moldova');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['country', 'name']);
            $table->index(['country', 'is_active']);
        });

        Schema::create('localities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('region_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type')->default('oras');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['region_id', 'name']);
            $table->index(['region_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('localities');
        Schema::dropIfExists('regions');
    }
};
