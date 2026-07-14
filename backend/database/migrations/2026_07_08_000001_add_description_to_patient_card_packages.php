<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_card_packages', function (Blueprint $table) {
            $table->text('description')->nullable()->after('name');
        });

        collect([
            1 => 'Deblochează un profil de pacient pentru consultații și examinări timp de un an.',
            2 => 'Potrivit pentru două profiluri din familie, fiecare cu fișă medicală separată.',
            6 => 'Pachet pentru familie extinsă, cu până la șase profiluri active pe același cont.',
        ])->each(fn (string $description, int $slots) => DB::table('patient_card_packages')
            ->where('profile_slots', $slots)
            ->whereNull('description')
            ->update(['description' => $description]));
    }

    public function down(): void
    {
        Schema::table('patient_card_packages', function (Blueprint $table) {
            $table->dropColumn('description');
        });
    }
};
