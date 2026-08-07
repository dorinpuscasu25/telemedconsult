<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Codul de pacient — 6 cifre, unic — care înlocuiește IDNP-ul.
 *
 * Nu mai cerem act de identitate la adăugarea unui pacient: e dată personală de
 * care platforma nu are nevoie. Codul generat servește la două lucruri: e
 * identificatorul trimis în HIGO și e ce tastează operatorul ca să găsească
 * pacientul în aplicația lor mobilă.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('patient_code', 6)->nullable()->unique()->after('id');
        });

        // Profilurile existente primesc și ele un cod, ca nimic să nu rămână
        // fără identificator după trecerea la noul model.
        $used = [];

        foreach (DB::table('patient_profiles')->whereNull('patient_code')->pluck('id') as $id) {
            do {
                $code = (string) random_int(100000, 999999);
            } while (isset($used[$code]) || DB::table('patient_profiles')->where('patient_code', $code)->exists());

            $used[$code] = true;
            DB::table('patient_profiles')->where('id', $id)->update(['patient_code' => $code]);
        }
    }

    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropUnique(['patient_code']);
            $table->dropColumn('patient_code');
        });
    }
};
