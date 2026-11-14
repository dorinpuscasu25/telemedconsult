<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('doctor_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('doctor_id')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('budget_minor');
            $table->unsignedBigInteger('remaining_minor');
            $table->string('status')->default('active');
            $table->timestamp('ends_at');
            $table->timestamps();
            $table->index(['doctor_id', 'status']);
        });
        Schema::create('doctor_promotion_impressions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('doctor_promotion_id')->constrained()->restrictOnDelete();
            $table->foreignId('doctor_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('viewer_id')->constrained('users')->restrictOnDelete();
            $table->unsignedTinyInteger('position');
            $table->unsignedInteger('cost_minor')->default(100);
            $table->timestamps();
            $table->index(['doctor_id', 'viewer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('doctor_promotion_impressions');
        Schema::dropIfExists('doctor_promotions');
    }
};
