<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Parola contului din HIGO, păstrată criptat.
 *
 * Conturile de medic și operator din sistemul lor se creează cu username (emailul
 * nostru) și o parolă pe care o generăm noi. Operatorul are nevoie de ea ca să
 * intre în aplicația mobilă HIGO și să facă examinarea cu aparatul, deci nu o
 * putem arunca după creare.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['doctor_profiles', 'operator_profiles'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->text('higo_password')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['doctor_profiles', 'operator_profiles'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('higo_password');
            });
        }
    }
};
