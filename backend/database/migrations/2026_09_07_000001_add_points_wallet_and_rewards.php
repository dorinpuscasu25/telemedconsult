<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropUnique(['user_id']);
        });
        Schema::table('wallets', function (Blueprint $table) {
            $table->string('type', 16)->default('real')->after('user_id');
            $table->unique(['user_id', 'type']);
        });

        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->string('wallet_type', 16)->default('real')->after('wallet_id');
            $table->index(['user_id', 'wallet_type']);
        });

        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->unsignedInteger('real_amount_minor')->default(0)->after('amount_minor');
            $table->unsignedInteger('points_amount_minor')->default(0)->after('real_amount_minor');
            $table->unsignedTinyInteger('points_percent')->default(0)->after('points_amount_minor');
        });

        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->boolean('accepts_points')->default(false)->after('is_available');
        });
    }

    public function down(): void
    {
        Schema::table('doctor_profiles', fn (Blueprint $table) => $table->dropColumn('accepts_points'));
        Schema::table('consultation_requests', fn (Blueprint $table) => $table->dropColumn(['real_amount_minor', 'points_amount_minor', 'points_percent']));
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'wallet_type']);
            $table->dropColumn('wallet_type');
        });
        Schema::table('wallets', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'type']);
            $table->unique('user_id');
            $table->dropColumn('type');
        });
    }
};
