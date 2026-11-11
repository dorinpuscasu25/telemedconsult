<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Un medic nou nu are recenzii, deci nici rating: implicitul 5 afișa ★ 5,0 fals.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->decimal('rating', 2, 1)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->decimal('rating', 2, 1)->default(5)->change();
        });
    }
};
