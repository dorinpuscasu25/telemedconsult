<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('medical_institutions', function (Blueprint $table) {
            $table->decimal('revenue_share_percent', 5, 2)->default(85);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('medical_institutions', function (Blueprint $table) {
            $table->dropColumn('revenue_share_percent');
        });
    }
};
