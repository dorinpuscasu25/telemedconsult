<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_investigations', function (Blueprint $table) {
            $table->date('performed_at')->nullable()->index();
            $table->string('file_disk')->default('public');
        });
    }

    public function down(): void
    {
        Schema::table('patient_investigations', function (Blueprint $table) {
            $table->dropIndex(['performed_at']);
            $table->dropColumn(['performed_at', 'file_disk']);
        });
    }
};
