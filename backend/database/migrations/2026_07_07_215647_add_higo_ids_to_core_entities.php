<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('higo_person_id')->nullable()->unique()->after('active_role_id');
        });

        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('higo_patient_id')->nullable()->unique()->after('user_id');
        });

        Schema::table('operator_profiles', function (Blueprint $table) {
            $table->string('higo_operator_id')->nullable()->unique()->after('user_id');
        });

        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->string('higo_doctor_id')->nullable()->unique()->after('user_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->dropColumn('higo_doctor_id');
        });

        Schema::table('operator_profiles', function (Blueprint $table) {
            $table->dropColumn('higo_operator_id');
        });

        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropColumn('higo_patient_id');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('higo_person_id');
        });
    }
};
