<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pachetele de cartele pot aduce puncte bonus la cumpărare (setat per pachet din
 * admin). Cerința clientului: pachetul de 600 MDL aduce 600 de puncte bonus;
 * pachetele de 240 și 450 MDL nu aduc bonus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_card_packages', function (Blueprint $table) {
            $table->unsignedInteger('bonus_points_minor')->default(0)->after('price_minor');
        });

        DB::table('patient_card_packages')->where('price_minor', 60000)->update(['bonus_points_minor' => 60000]);
    }

    public function down(): void
    {
        Schema::table('patient_card_packages', function (Blueprint $table) {
            $table->dropColumn('bonus_points_minor');
        });
    }
};
