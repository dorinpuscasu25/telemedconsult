<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Instituții medicale (clinici) care lucrează pe platformă cu propriii medici.
 *
 * Medicul afiliat primește partea lui din consultație de la instituție, nu de la
 * platformă: platforma își reține comisionul ca la orice medic, iar restul se
 * împarte între instituție și medic după procentul setat de instituție.
 */
return new class extends Migration
{
    /**
     * Fiecare pas verifică ce există deja: pe MySQL, o rulare anterioară se
     * oprea la indexul invitațiilor (nume peste 64 de caractere) și lăsa
     * tabelele de dinainte create, iar migrarea nu mai putea fi reluată.
     */
    public function up(): void
    {
        if (! Schema::hasTable('medical_institutions')) {
            Schema::create('medical_institutions', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('legal_name')->nullable();
                $table->string('fiscal_code', 32)->nullable();
                $table->string('iban', 64)->nullable();
                $table->string('bank_name')->nullable();
                $table->string('email')->nullable();
                $table->string('phone', 50)->nullable();
                $table->string('address')->nullable();
                $table->decimal('doctor_share_percent', 5, 2)->default(70);
                $table->string('status', 20)->default('active');
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('medical_institution_user')) {
            Schema::create('medical_institution_user', function (Blueprint $table) {
                $table->id();
                $table->foreignId('medical_institution_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->timestamps();
            });
        }

        if (! Schema::hasColumn('doctor_profiles', 'medical_institution_id')) {
            Schema::table('doctor_profiles', function (Blueprint $table) {
                $table->foreignId('medical_institution_id')->nullable()->constrained()->nullOnDelete();
            });
        }
        if (! Schema::hasColumn('doctor_profiles', 'institution_share_percent')) {
            Schema::table('doctor_profiles', fn (Blueprint $table) => $table->decimal('institution_share_percent', 5, 2)->nullable());
        }
        if (! Schema::hasColumn('doctor_profiles', 'institution_joined_at')) {
            Schema::table('doctor_profiles', fn (Blueprint $table) => $table->timestamp('institution_joined_at')->nullable());
        }

        if (! Schema::hasTable('medical_institution_invitations')) {
            Schema::create('medical_institution_invitations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('medical_institution_id')->constrained()->cascadeOnDelete();
                $table->string('email');
                $table->string('name')->nullable();
                $table->foreignId('specialty_id')->nullable()->constrained()->nullOnDelete();
                $table->string('license_number')->nullable();
                $table->decimal('doctor_share_percent', 5, 2)->nullable();
                $table->string('token_hash', 64)->unique();
                $table->string('status', 20)->default('pending');
                $table->timestamp('expires_at');
                $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('accepted_at')->nullable();
                $table->timestamps();
            });
        }
        if (! Schema::hasIndex('medical_institution_invitations', 'institution_invitations_status_index')) {
            Schema::table('medical_institution_invitations', fn (Blueprint $table) => $table->index(['medical_institution_id', 'status'], 'institution_invitations_status_index'));
        }

        if (! Schema::hasTable('institution_earnings')) {
            Schema::create('institution_earnings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('medical_institution_id')->constrained()->cascadeOnDelete();
                $table->foreignId('doctor_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('consultation_request_id')->unique()->constrained()->cascadeOnDelete();
                $table->unsignedBigInteger('gross_amount_minor');
                $table->unsignedBigInteger('provider_amount_minor');
                $table->decimal('doctor_share_percent', 5, 2);
                $table->unsignedBigInteger('doctor_amount_minor');
                $table->unsignedBigInteger('institution_amount_minor');
                $table->string('currency', 3)->default('MDL');
                $table->timestamps();
                $table->index(['medical_institution_id', 'doctor_id']);
            });
        }

        if (! Schema::hasColumn('withdrawal_requests', 'medical_institution_id')) {
            Schema::table('withdrawal_requests', fn (Blueprint $table) => $table->foreignId('medical_institution_id')->nullable()->constrained()->nullOnDelete());
        }
        if (! Schema::hasColumn('withdrawal_requests', 'payer')) {
            // Cine plătește: platforma (medici independenți, instituții) sau instituția (medicii ei).
            Schema::table('withdrawal_requests', fn (Blueprint $table) => $table->string('payer', 20)->default('platform'));
        }

        DB::table('roles')->updateOrInsert(
            ['name' => 'institution'],
            ['label' => 'Instituție medicală', 'created_at' => now(), 'updated_at' => now()],
        );
    }

    public function down(): void
    {
        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('medical_institution_id');
            $table->dropColumn('payer');
        });
        Schema::dropIfExists('institution_earnings');
        Schema::dropIfExists('medical_institution_invitations');
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('medical_institution_id');
            $table->dropColumn(['institution_share_percent', 'institution_joined_at']);
        });
        Schema::dropIfExists('medical_institution_user');
        Schema::dropIfExists('medical_institutions');
        DB::table('roles')->where('name', 'institution')->delete();
    }
};
