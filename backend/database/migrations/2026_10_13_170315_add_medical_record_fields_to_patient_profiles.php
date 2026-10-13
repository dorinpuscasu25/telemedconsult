<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('identity_number', 13)->nullable();
            $table->string('residential_environment', 10)->nullable();
            $table->json('address_details')->nullable();
            $table->json('medical_record')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropColumn(['identity_number', 'residential_environment', 'address_details', 'medical_record']);
        });
    }
};
