<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Starea sincronizării cu HIGO, ținută lângă fiecare profil care are
 * corespondent acolo. Coloana `higo_*_id` spune *dacă* entitatea există în HIGO;
 * acestea spun *când* a fost trimisă ultima oară și de ce a eșuat, ca adminul să
 * poată vedea și relua eșecurile fără să scormonească prin `higo_sync_logs`.
 */
return new class extends Migration
{
    /** @var list<string> */
    private array $tables = ['patient_profiles', 'doctor_profiles', 'operator_profiles'];

    public function up(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->string('higo_sync_status')->nullable()->index();
                $blueprint->timestamp('higo_synced_at')->nullable();
                $blueprint->text('higo_sync_error')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropIndex(['higo_sync_status']);
                $blueprint->dropColumn(['higo_sync_status', 'higo_synced_at', 'higo_sync_error']);
            });
        }
    }
};
