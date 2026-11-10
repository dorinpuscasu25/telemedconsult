<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * La înregistrare, după confirmarea emailului, medicul alege instituția la
     * care vrea să lucreze (sau că lucrează independent). Administratorul vede
     * alegerea și, la aprobare, îl leagă de acea instituție.
     */
    public function up(): void
    {
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->foreignId('requested_institution_id')->nullable()->constrained('medical_institutions', indexName: 'doctor_profiles_requested_institution_fk')->nullOnDelete();
            $table->timestamp('institution_chosen_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->dropForeign('doctor_profiles_requested_institution_fk');
            $table->dropColumn(['requested_institution_id', 'institution_chosen_at']);
        });
    }
};
