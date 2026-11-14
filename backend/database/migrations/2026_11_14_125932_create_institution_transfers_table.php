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
        Schema::create('institution_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('doctor_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('from_institution_id')->nullable()->constrained('medical_institutions')->nullOnDelete();
            $table->foreignId('to_institution_id')->constrained('medical_institutions')->restrictOnDelete();
            $table->string('status', 20)->default('pending');
            $table->text('note')->nullable();
            $table->text('decision_note')->nullable();
            $table->decimal('doctor_share_percent', 5, 2)->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();
            $table->index(['doctor_id', 'status']);
            $table->index(['to_institution_id', 'status', 'created_at']);
            $table->index(['from_institution_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('institution_transfers');
    }
};
