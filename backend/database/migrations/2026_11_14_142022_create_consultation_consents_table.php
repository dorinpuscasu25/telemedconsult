<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultation_consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_request_id')->constrained()->restrictOnDelete();
            $table->foreignId('patient_profile_id')->constrained()->restrictOnDelete();
            $table->foreignId('accepted_by')->constrained('users')->restrictOnDelete();
            $table->string('type');
            $table->string('version', 64);
            $table->json('snapshot');
            $table->timestamp('accepted_at');
            $table->timestamps();
            $table->unique(['consultation_request_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consultation_consents');
    }
};
