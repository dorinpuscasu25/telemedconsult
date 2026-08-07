<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payload-ul brut al fiecărei examinări primite de la HIGO, păstrat exact cum a
 * venit și separat de interpretarea lui.
 *
 * Ăsta e mecanismul care ne lasă să integrăm fără documentația lor completă:
 * dacă maparea câmpurilor e greșită sau incompletă, brutul rămâne intact și
 * `higo:remap` reconstruiește datele obiective după corectarea mapării. Nimic
 * nu se pierde în perioada de descoperire a contractului.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('higo_exam_payloads', function (Blueprint $table) {
            $table->id();

            // Id-ul examinării la ei — cheia de idempotență: același webhook
            // livrat de două ori nu produce două seturi de date obiective.
            $table->string('external_id')->nullable()->unique();

            $table->string('higo_patient_id')->nullable()->index();
            $table->string('device_serial')->nullable()->index();

            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('patient_profile_id')->nullable()->constrained()->nullOnDelete();
            // Tabela e `consultation_objective_data` (fără plural), deci numele
            // dedus automat de `constrained()` ar fi greșit.
            $table->foreignId('consultation_objective_data_id')->nullable()
                ->constrained('consultation_objective_data')->nullOnDelete();

            // received = stocat, încă nemapat; mapped = a produs date obiective;
            // unmatched = nu am găsit pacientul/consultația; failed = eroare.
            $table->string('status')->default('received')->index();
            $table->text('error')->nullable();

            $table->json('raw');
            $table->timestamp('received_at');
            $table->timestamp('mapped_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('higo_exam_payloads');
    }
};
