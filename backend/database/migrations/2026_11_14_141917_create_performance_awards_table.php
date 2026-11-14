<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_awards', function (Blueprint $table) {
            $table->id();
            $table->string('period', 7)->unique();
            $table->string('status')->default('draft');
            $table->json('prizes');
            $table->json('results')->nullable();
            $table->json('ranking_snapshot')->nullable();
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_awards');
    }
};
