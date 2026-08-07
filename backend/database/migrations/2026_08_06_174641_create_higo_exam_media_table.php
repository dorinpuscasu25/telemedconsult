<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Imaginile și înregistrările unei examinări HIGO.
 *
 * Majoritatea examinărilor lor (otoscopie, dermatoscop, gât, auscultații) nu au
 * nicio valoare numerică: tot conținutul e în resursa `Media`. Fără tabela asta,
 * fișa medicului rămâne goală pentru 8 din 10 examinări.
 *
 * Fișierul se descarcă și se păstrează la noi, nu doar linkul: url-ul lor e un
 * blob Azure semnat SAS care expiră într-o oră, deci un link stocat ar fi mort
 * până se uită medicul la fișă.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('higo_exam_media', function (Blueprint $table) {
            $table->id();

            $table->foreignId('higo_exam_payload_id')->constrained()->cascadeOnDelete();
            // Se ștampilează la mapare, ca endpointul de servire să poată
            // verifica accesul fără să treacă prin payload.
            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();

            $table->string('higo_media_id');
            $table->string('exam_type')->nullable();
            // image | audio — decide cum se afișează în fișă.
            $table->string('kind')->default('image');
            $table->string('content_type')->nullable();
            // „INDEX: 3” din nota lor: ordinea în care le-a făcut operatorul.
            $table->unsignedInteger('sequence')->nullable();

            $table->string('disk')->nullable();
            $table->string('path')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();

            $table->text('error')->nullable();
            $table->timestamp('fetched_at')->nullable();
            $table->timestamps();

            // Aceeași examinare reluată din `higo:remap` nu are voie să dubleze
            // fișierele.
            $table->unique(['higo_exam_payload_id', 'higo_media_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('higo_exam_media');
    }
};
