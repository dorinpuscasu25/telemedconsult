<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Comisioanele de afiliere se plătesc acum ca PROCENT din fiecare alimentare de
 * portofel făcută de utilizatorul invitat, nu ca sumă fixă la confirmarea
 * emailului.
 *
 * Tabela `referrals` nu poate găzdui asta: `referred_user_id` este unique și
 * `wallet_transactions.referral_id` este de asemenea unique, deci schema veche
 * permitea structural o singură plată per invitat, pentru totdeauna.
 *
 * `referral_commissions` ține un rând per plată comisionată. Unicitatea pe
 * `payment_id` garantează idempotența: un callback MAIB repetat nu poate credita
 * de două ori aceeași alimentare.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referral_commissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referral_id')->constrained('referrals')->cascadeOnDelete();
            $table->foreignId('referrer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('referred_user_id')->constrained('users')->cascadeOnDelete();

            // Idempotență: o alimentare generează maximum un comision.
            $table->foreignId('payment_id')->unique()->constrained('payments')->cascadeOnDelete();
            $table->foreignId('wallet_transaction_id')->nullable()->constrained('wallet_transactions')->nullOnDelete();

            $table->unsignedBigInteger('deposit_amount_minor');
            $table->unsignedBigInteger('commission_amount_minor');
            $table->decimal('rate_percent', 5, 2);
            $table->string('currency', 3)->default('MDL');
            $table->timestamps();

            $table->index(['referrer_id', 'created_at']);
            $table->index('referred_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_commissions');
    }
};
