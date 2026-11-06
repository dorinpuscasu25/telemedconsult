<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promoția de 500 de puncte poate fi acordată și manual de admin, pentru
 * utilizatorii înregistrați înainte de lansarea ofertei — fără plată asociată.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('first_topup_promotion_grants', function (Blueprint $table) {
            $table->unsignedBigInteger('payment_id')->nullable()->change();
            $table->foreignId('granted_by_admin_id')->nullable()->after('payment_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('first_topup_promotion_grants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('granted_by_admin_id');
        });
    }
};
