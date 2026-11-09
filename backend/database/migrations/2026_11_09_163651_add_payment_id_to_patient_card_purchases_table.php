<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pachetul cumpărat printr-o plată MAIB păstrează plata care l-a declanșat.
     * Indexul unic garantează că un callback dublat nu creează două pachete.
     */
    public function up(): void
    {
        Schema::table('patient_card_purchases', function (Blueprint $table) {
            $table->foreignId('payment_id')->nullable()->after('patient_card_package_id')->constrained('payments')->nullOnDelete();
            $table->unique('payment_id');
        });
    }

    public function down(): void
    {
        Schema::table('patient_card_purchases', function (Blueprint $table) {
            $table->dropUnique(['payment_id']);
            $table->dropConstrainedForeignId('payment_id');
        });
    }
};
