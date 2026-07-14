<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('label');
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('active_role_id')->nullable()->after('password')->constrained('roles')->nullOnDelete();
            $table->string('status')->default('active')->after('active_role_id');
            $table->string('phone')->nullable()->after('email');
            $table->timestamp('last_seen_at')->nullable()->after('remember_token');
        });

        Schema::create('role_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['role_id', 'user_id']);
        });

        Schema::create('specialties', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('slug')->unique();
            $table->timestamps();
        });

        Schema::create('patient_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('identity_number')->nullable();
            $table->date('birth_date')->nullable();
            $table->string('gender')->nullable();
            $table->string('address')->nullable();
            $table->string('emergency_contact')->nullable();
            $table->text('medical_summary')->nullable();
            $table->timestamps();
        });

        Schema::create('doctor_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('specialty_id')->nullable()->constrained()->nullOnDelete();
            $table->string('license_number')->nullable();
            $table->text('bio')->nullable();
            $table->unsignedSmallInteger('experience_years')->default(0);
            $table->unsignedInteger('consultation_price')->default(0);
            $table->json('platforms')->nullable();
            $table->decimal('rating', 2, 1)->default(5);
            $table->unsignedInteger('reviews_count')->default(0);
            $table->boolean('is_available')->default(true);
            $table->boolean('is_approved')->default(false);
            $table->timestamps();
        });

        Schema::create('operator_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('region')->nullable();
            $table->json('equipment')->nullable();
            $table->boolean('is_available')->default(true);
            $table->boolean('is_approved')->default(false);
            $table->timestamps();
        });

        Schema::create('coordinator_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('region')->nullable();
            $table->boolean('is_available')->default(true);
            $table->timestamps();
        });

        Schema::create('consultation_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('doctor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('operator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('coordinator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('specialty_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type')->default('doctor');
            $table->string('status')->default('new');
            $table->text('symptoms')->nullable();
            $table->text('triage_notes')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('consultations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('doctor_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->default('draft');
            $table->text('diagnosis')->nullable();
            $table->text('treatment_plan')->nullable();
            $table->text('recommendations')->nullable();
            $table->text('prescription_notes')->nullable();
            $table->unsignedInteger('price')->default(0);
            $table->json('fhir_payload')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('doctor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('operator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('open');
            $table->timestamps();
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
            $table->text('body');
            $table->string('type')->default('text');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('medical_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('doctor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type')->default('consultation_summary');
            $table->string('title');
            $table->string('status')->default('draft');
            $table->string('pdf_path')->nullable();
            $table->timestamp('signed_at')->nullable();
            $table->string('external_reference')->nullable();
            $table->json('fhir_payload')->nullable();
            $table->timestamps();
        });

        Schema::create('integration_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('medical_document_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider');
            $table->string('event_type');
            $table->string('status')->default('queued');
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('next_retry_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_events');
        Schema::dropIfExists('medical_documents');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('consultations');
        Schema::dropIfExists('consultation_requests');
        Schema::dropIfExists('coordinator_profiles');
        Schema::dropIfExists('operator_profiles');
        Schema::dropIfExists('doctor_profiles');
        Schema::dropIfExists('patient_profiles');
        Schema::dropIfExists('specialties');
        Schema::dropIfExists('role_user');

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('active_role_id');
            $table->dropColumn(['status', 'phone', 'last_seen_at']);
        });

        Schema::dropIfExists('roles');
    }
};
