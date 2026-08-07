<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Momentul în care medicul pornește consultația.
 *
 * După ce operatorul finalizează examinarea, cazul ajunge la medic. Acesta apasă
 * „Începe consultația”, ceea ce deschide chatul cu pacientul. E o acțiune
 * explicită, nu una automată: medicul decide când se apucă.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->timestamp('doctor_started_at')->nullable()->after('objective_data_completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropColumn('doctor_started_at');
        });
    }
};
