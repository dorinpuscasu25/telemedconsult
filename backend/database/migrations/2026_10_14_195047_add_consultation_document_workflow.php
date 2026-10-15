<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->text('current_illness_history')->nullable();
        });
        Schema::table('consultations', function (Blueprint $table) {
            $table->text('patient_complaints')->nullable();
            $table->text('objective_exam')->nullable();
            $table->boolean('higo_reviewed')->default(false);
        });
        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->boolean('pseudonymized')->default(false);
        });
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->string('signature_path')->nullable();
            $table->string('signature_mime')->nullable();
            $table->string('clinic_name')->nullable();
            $table->text('clinic_details')->nullable();
        });
        Schema::table('medical_documents', function (Blueprint $table) {
            $table->foreignId('parent_document_id')->nullable()->constrained('medical_documents')->restrictOnDelete();
            $table->json('content_snapshot')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('prescription_path')->nullable();
            $table->string('prescription_mime')->nullable();
        });
        Schema::create('conversation_reads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('last_message_id')->default(0);
            $table->timestamps();
            $table->unique(['conversation_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_reads');
        Schema::table('medical_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_document_id');
            $table->dropColumn(['content_snapshot', 'published_at', 'prescription_path', 'prescription_mime']);
        });
        Schema::table('doctor_profiles', fn (Blueprint $table) => $table->dropColumn(['signature_path', 'signature_mime', 'clinic_name', 'clinic_details']));
        Schema::table('patient_profiles', fn (Blueprint $table) => $table->dropColumn('pseudonymized'));
        Schema::table('consultations', fn (Blueprint $table) => $table->dropColumn(['patient_complaints', 'objective_exam', 'higo_reviewed']));
        Schema::table('consultation_requests', fn (Blueprint $table) => $table->dropColumn('current_illness_history'));
    }
};
