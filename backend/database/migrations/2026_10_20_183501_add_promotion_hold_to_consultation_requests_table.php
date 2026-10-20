<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->unsignedInteger('promo_amount_minor')->default(0);
            $table->foreignId('promo_grant_id')->nullable()->constrained('first_topup_promotion_grants')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('promo_grant_id');
            $table->dropColumn('promo_amount_minor');
        });
    }
};
