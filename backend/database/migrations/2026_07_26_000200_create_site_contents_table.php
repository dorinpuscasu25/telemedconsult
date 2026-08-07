<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Textele statice ale site-ului public, editabile din panoul de administrare.
 *
 * Tabela ține DOAR valorile suprascrise de admin. Textele implicite trăiesc în
 * `SiteContent::CATALOG` (cod), astfel încât:
 *  - un deploy nou aduce automat texte valide, fără seed obligatoriu;
 *  - o cheie ștearsă din tabelă revine la valoarea implicită;
 *  - frontendul are aceleași valori împachetate în bundle ca fallback, deci
 *    pagina nu rămâne goală dacă API-ul nu răspunde.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_contents', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_contents');
    }
};
