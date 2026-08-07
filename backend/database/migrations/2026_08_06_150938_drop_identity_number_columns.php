<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Elimină IDNP-ul din platformă.
 *
 * Nu mai colectăm acte de identitate: fiecare pacient are un cod generat de 6
 * cifre (`patient_code`), care servește și ca legătură cu HIGO. Coloanele de mai
 * jos rămăseseră fără nicio citire în cod, iar păstrarea lor însemna doar risc
 * inutil de date personale.
 *
 * `down()` recreează structura, dar valorile nu pot fi recuperate — ceea ce e
 * și scopul acestei migrări.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropColumn('identity_number');
        });

        Schema::table('patient_family_members', function (Blueprint $table) {
            $table->dropColumn('identity_number');
        });
    }

    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('identity_number')->nullable()->after('last_name');
        });

        Schema::table('patient_family_members', function (Blueprint $table) {
            $table->string('identity_number')->nullable();
        });
    }
};
