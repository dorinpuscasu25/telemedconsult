<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->integer('amount_minor')->default(0)->after('scheduled_at');
            $table->integer('platform_fee_minor')->default(0)->after('amount_minor');
            $table->integer('provider_amount_minor')->default(0)->after('platform_fee_minor');
            $table->string('payment_status')->default('none')->after('provider_amount_minor');
            $table->timestamp('acceptance_expires_at')->nullable()->after('payment_status');
            $table->timestamp('chat_expires_at')->nullable()->after('acceptance_expires_at');
            $table->timestamp('cancelled_at')->nullable()->after('completed_at');
            $table->timestamp('refunded_at')->nullable()->after('cancelled_at');
            $table->text('cancellation_reason')->nullable()->after('refunded_at');

            $table->index(['status', 'acceptance_expires_at']);
            $table->index(['payment_status', 'refunded_at']);
        });
    }

    public function down(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropIndex(['status', 'acceptance_expires_at']);
            $table->dropIndex(['payment_status', 'refunded_at']);
            $table->dropColumn([
                'amount_minor',
                'platform_fee_minor',
                'provider_amount_minor',
                'payment_status',
                'acceptance_expires_at',
                'chat_expires_at',
                'cancelled_at',
                'refunded_at',
                'cancellation_reason',
            ]);
        });
    }
};
