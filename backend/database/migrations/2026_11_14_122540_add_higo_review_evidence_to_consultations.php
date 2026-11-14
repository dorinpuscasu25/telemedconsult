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
        Schema::table('consultations', function (Blueprint $table) {
            $table->string('higo_status', 20)->nullable();
            $table->foreignId('higo_exam_id')->nullable()->constrained('higo_exam_payloads')->nullOnDelete();
            $table->timestamp('higo_exam_performed_at')->nullable();
            $table->timestamp('higo_reviewed_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('consultations', function (Blueprint $table) {
            $table->dropForeign(['higo_exam_id']);
            $table->dropColumn(['higo_status', 'higo_exam_id', 'higo_exam_performed_at', 'higo_reviewed_at']);
        });
    }
};
