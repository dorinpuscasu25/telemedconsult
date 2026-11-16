<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('doctor_promotions')) {
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
        }
        if (! Schema::hasTable('doctor_promotion_impressions')) {
            Schema::create('doctor_promotion_impressions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('doctor_promotion_id')->constrained()->restrictOnDelete();
                $table->foreignId('doctor_id')->constrained('users')->restrictOnDelete();
                $table->foreignId('viewer_id')->constrained('users')->restrictOnDelete();
                $table->unsignedTinyInteger('position');
                $table->unsignedInteger('cost_minor')->default(100);
                $table->timestamps();
            });
        }

        if (! Schema::hasIndex('doctor_promotion_impressions', ['doctor_id', 'viewer_id', 'created_at'])) {
            Schema::table('doctor_promotion_impressions', function (Blueprint $table) {
                $table->index(['doctor_id', 'viewer_id', 'created_at'], 'promotion_impressions_viewer_date_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('doctor_promotion_impressions');
        Schema::dropIfExists('doctor_promotions');
    }
};
