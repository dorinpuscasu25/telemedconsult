<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('first_topup_promotion_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('payment_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedInteger('amount_minor');
            $table->unsignedInteger('minimum_deposit_minor');
            $table->unsignedTinyInteger('max_payment_percent');
            $table->json('doctor_ids');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('first_topup_promotion_grants');
    }
};
