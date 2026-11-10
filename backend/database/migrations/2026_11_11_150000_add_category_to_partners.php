<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Eticheta partenerului pe pagina publică: Clinică, Dispozitive medicale, Servicii… */
    public function up(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->string('category', 60)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};
