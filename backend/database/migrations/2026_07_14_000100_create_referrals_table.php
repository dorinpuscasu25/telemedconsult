<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referrer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('referred_user_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('reward_amount_minor')->default(0);
            $table->string('currency', 3)->default('MDL');
            $table->string('status')->default('pending');
            $table->timestamp('rewarded_at')->nullable();
            $table->timestamps();

            $table->index(['referrer_id', 'status']);
            $table->index('created_at');
        });

        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->foreignId('referral_id')
                ->nullable()
                ->unique()
                ->after('consultation_request_id')
                ->constrained('referrals')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropForeign(['referral_id']);
            $table->dropUnique(['referral_id']);
            $table->dropColumn('referral_id');
        });

        Schema::dropIfExists('referrals');
    }
};
