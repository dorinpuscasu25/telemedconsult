<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Operatorul la care e legat pacientul în HIGO.
 *
 * Pacientul se creează fără legătură — la înregistrare nu știm încă cine îl va
 * examina. Legarea se face când i se atribuie un operator, iar coloana asta ne
 * spune la cine e legat acum, ca să nu retrimitem inutil aceeași legătură.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('higo_general_practitioner_id')->nullable()->after('higo_patient_id');
        });
    }

    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropColumn('higo_general_practitioner_id');
        });
    }
};
