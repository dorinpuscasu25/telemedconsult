<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Ciclul cererii cu termene clare:
     * - medicul răspunde la o cerere nouă până la `doctor_reply_due_at`;
     * - propune până la 3 ore (`proposed_slots`), cu un mesaj opțional;
     * - pacientul alege una până la `proposal_expires_at` sau cere alte ore
     *   (`patient_asked_at`, `patient_time_note`), iar medicul are din nou un termen;
     * - la reprogramarea unei consultații confirmate (`proposal_is_reschedule`),
     *   fără răspuns rămâne ora inițială.
     * Ciorna concluziei se salvează pe cerere, ca să poată fi începută în apel
     * și terminată în Consultații.
     */
    public function up(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->timestamp('doctor_reply_due_at')->nullable()->after('acceptance_expires_at');
            $table->json('proposed_slots')->nullable()->after('proposed_by');
            $table->string('proposal_note', 500)->nullable()->after('proposed_slots');
            $table->timestamp('proposal_expires_at')->nullable()->after('proposal_note');
            $table->boolean('proposal_is_reschedule')->default(false)->after('proposal_expires_at');
            $table->timestamp('patient_asked_at')->nullable()->after('proposal_is_reschedule');
            $table->string('patient_time_note', 500)->nullable()->after('patient_asked_at');
            $table->json('conclusion_draft')->nullable()->after('conclusion_sent_at');
            $table->timestamp('conclusion_draft_saved_at')->nullable()->after('conclusion_draft');
        });
    }

    public function down(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropColumn(['doctor_reply_due_at', 'proposed_slots', 'proposal_note', 'proposal_expires_at', 'proposal_is_reschedule', 'patient_asked_at', 'patient_time_note', 'conclusion_draft', 'conclusion_draft_saved_at']);
        });
    }
};
