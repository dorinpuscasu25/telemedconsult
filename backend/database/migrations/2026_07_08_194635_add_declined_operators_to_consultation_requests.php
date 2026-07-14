<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->json('declined_operator_ids')->nullable()->after('operator_id');
            $table->timestamp('operator_accepted_at')->nullable()->after('accepted_at');
        });
    }

    public function down(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropColumn(['declined_operator_ids', 'operator_accepted_at']);
        });
    }
};
