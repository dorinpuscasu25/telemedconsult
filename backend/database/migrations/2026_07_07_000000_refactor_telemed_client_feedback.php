<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE patient_profiles ADD INDEX patient_profiles_user_id_index (user_id)');
            DB::statement('ALTER TABLE patient_profiles DROP INDEX patient_profiles_user_id_unique');
        } else {
            Schema::table('patient_profiles', function (Blueprint $table) {
                $table->dropUnique(['user_id']);
            });
        }

        Schema::table('users', function (Blueprint $table) {
            $table->string('telegram_chat_id')->nullable()->after('phone');
        });

        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('user_id');
            $table->string('last_name')->nullable()->after('first_name');
            $table->string('country')->default('Republica Moldova')->after('gender');
            $table->string('region')->nullable()->after('country');
            $table->string('locality')->nullable()->after('region');
            $table->json('life_history')->nullable()->after('medical_summary');
            $table->string('status')->default('inactive')->after('life_history');
            $table->timestamp('active_until')->nullable()->after('status');
            $table->index(['user_id', 'status']);
            $table->index(['country', 'region', 'locality']);
        });

        Schema::create('patient_card_packages', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedSmallInteger('profile_slots');
            $table->integer('price_minor');
            $table->unsignedSmallInteger('validity_days')->default(365);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('patient_card_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('patient_card_package_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('profile_slots');
            $table->integer('amount_minor');
            $table->unsignedSmallInteger('validity_days');
            $table->unsignedSmallInteger('used_slots')->default(0);
            $table->timestamp('expires_at');
            $table->json('settings_snapshot')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'expires_at']);
        });

        Schema::create('patient_investigations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_profile_id')->constrained('patient_profiles')->cascadeOnDelete();
            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type')->default('investigation');
            $table->string('title');
            $table->string('file_path')->nullable();
            $table->string('mime_type')->nullable();
            $table->integer('file_size')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('consultation_objective_data', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('patient_profile_id')->constrained('patient_profiles')->cascadeOnDelete();
            $table->foreignId('operator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source')->default('manual');
            $table->json('payload');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('operator_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('operator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('patient_profile_id')->nullable()->constrained('patient_profiles')->nullOnDelete();
            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comment');
            $table->timestamps();
            $table->unique(['patient_id', 'consultation_request_id']);
        });

        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->foreignId('patient_profile_id')->nullable()->after('patient_id')->constrained('patient_profiles')->nullOnDelete();
            $table->string('consultation_kind')->default('with_exam')->after('type');
            $table->json('selected_services')->nullable()->after('symptoms');
            $table->json('pricing_snapshot')->nullable()->after('provider_amount_minor');
            $table->timestamp('anamnesis_completed_at')->nullable()->after('accepted_at');
            $table->timestamp('objective_data_completed_at')->nullable()->after('anamnesis_completed_at');
            $table->timestamp('conclusion_sent_at')->nullable()->after('objective_data_completed_at');
            $table->integer('doctor_response_minutes')->nullable()->after('conclusion_sent_at');
            $table->timestamp('free_chat_until')->nullable()->after('chat_expires_at');
            $table->timestamp('chat_reactivated_until')->nullable()->after('free_chat_until');
            $table->timestamp('rating_required_after')->nullable()->after('refunded_at');
            $table->timestamp('closed_at')->nullable()->after('rating_required_after');
        });

        Schema::table('consultations', function (Blueprint $table) {
            $table->foreignId('patient_profile_id')->nullable()->after('patient_id')->constrained('patient_profiles')->nullOnDelete();
            $table->text('current_illness_history')->nullable()->after('status');
            $table->json('objective_data_snapshot')->nullable()->after('current_illness_history');
            $table->string('signed_pdf_path')->nullable()->after('fhir_payload');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->foreignId('patient_profile_id')->nullable()->after('patient_id')->constrained('patient_profiles')->nullOnDelete();
            $table->timestamp('starts_at')->nullable()->after('status');
            $table->timestamp('free_until')->nullable()->after('starts_at');
            $table->timestamp('reactivated_until')->nullable()->after('free_until');
            $table->timestamp('hard_closes_at')->nullable()->after('reactivated_until');
        });

        Schema::table('medical_documents', function (Blueprint $table) {
            $table->foreignId('patient_profile_id')->nullable()->after('patient_id')->constrained('patient_profiles')->nullOnDelete();
            $table->foreignId('consultation_request_id')->nullable()->after('consultation_id')->constrained()->nullOnDelete();
            $table->string('signature_provider')->nullable()->after('signed_at');
            $table->json('signature_payload')->nullable()->after('signature_provider');
        });

        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->json('service_catalog')->nullable()->after('platforms');
            $table->json('required_investigations')->nullable()->after('service_catalog');
            $table->unsignedInteger('video_price')->nullable()->after('consultation_price');
            $table->unsignedSmallInteger('video_duration_minutes')->default(15)->after('video_price');
            $table->string('google_meet_account')->nullable()->after('video_duration_minutes');
            $table->string('affiliate_code')->nullable()->unique()->after('google_meet_account');
        });

        Schema::table('operator_profiles', function (Blueprint $table) {
            $table->string('country')->default('Republica Moldova')->after('user_id');
            $table->string('locality')->nullable()->after('region');
            $table->integer('base_fee_minor')->default(0)->after('equipment');
            $table->json('served_areas')->nullable()->after('base_fee_minor');
            $table->json('travel_fees')->nullable()->after('served_areas');
            $table->json('service_catalog')->nullable()->after('travel_fees');
            $table->boolean('has_device_subscription')->default(false)->after('service_catalog');
            $table->string('contract_number')->nullable()->after('has_device_subscription');
            $table->string('affiliate_code')->nullable()->unique()->after('contract_number');
        });

        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->json('rate_snapshot')->nullable()->after('metadata');
            $table->foreignId('consultation_request_id')->nullable()->after('rate_snapshot')->constrained()->nullOnDelete();
        });

        Schema::table('platform_settings', function (Blueprint $table) {
            $table->string('type')->default('string')->after('group');
            $table->timestamp('effective_from')->nullable()->after('type');
            $table->foreignId('updated_by')->nullable()->after('effective_from')->constrained('users')->nullOnDelete();
        });

        Schema::create('platform_setting_versions', function (Blueprint $table) {
            $table->id();
            $table->string('key');
            $table->json('value')->nullable();
            $table->string('group')->default('general');
            $table->string('type')->default('string');
            $table->timestamp('effective_from')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['key', 'effective_from']);
        });

        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->string('contract_number')->nullable()->after('iban');
            $table->string('payout_period')->nullable()->after('contract_number');
            $table->timestamp('payout_sent_at')->nullable()->after('payout_period');
            $table->string('payout_method')->nullable()->after('payout_sent_at');
            $table->string('payout_reference')->nullable()->after('payout_method');
            $table->foreignId('processed_by')->nullable()->after('processed_at')->constrained('users')->nullOnDelete();
        });

        $now = now();

        DB::table('patient_profiles')->orderBy('id')->get()->each(function (object $profile) use ($now) {
            $user = DB::table('users')->find($profile->user_id);
            $parts = preg_split('/\s+/', trim((string) ($user->name ?? 'Pacient')), 2);

            DB::table('patient_profiles')->where('id', $profile->id)->update([
                'first_name' => $parts[0] ?? null,
                'last_name' => $parts[1] ?? null,
                'country' => 'Republica Moldova',
                'region' => $profile->address,
                'locality' => null,
                'status' => 'active',
                'active_until' => $now->copy()->addYear(),
                'life_history' => json_encode([]),
                'created_at' => $profile->created_at ?? $now,
                'updated_at' => $now,
            ]);
        });

        DB::table('consultation_requests')->whereNull('patient_profile_id')->orderBy('id')->get()->each(function (object $request) {
            $profileId = DB::table('patient_profiles')->where('user_id', $request->patient_id)->orderBy('id')->value('id');
            if ($profileId) {
                DB::table('consultation_requests')->where('id', $request->id)->update(['patient_profile_id' => $profileId]);
            }
        });

        DB::table('consultations')->whereNull('patient_profile_id')->orderBy('id')->get()->each(function (object $consultation) {
            $profileId = DB::table('patient_profiles')->where('user_id', $consultation->patient_id)->orderBy('id')->value('id');
            if ($profileId) {
                DB::table('consultations')->where('id', $consultation->id)->update(['patient_profile_id' => $profileId]);
            }
        });

        DB::table('conversations')->whereNull('patient_profile_id')->orderBy('id')->get()->each(function (object $conversation) {
            $profileId = DB::table('patient_profiles')->where('user_id', $conversation->patient_id)->orderBy('id')->value('id');
            if ($profileId) {
                DB::table('conversations')->where('id', $conversation->id)->update(['patient_profile_id' => $profileId]);
            }
        });

        collect([
            ['name' => '1 profil / an', 'profile_slots' => 1, 'price_minor' => 24000],
            ['name' => '2 profiluri / an', 'profile_slots' => 2, 'price_minor' => 45000],
            ['name' => '6 profiluri / an', 'profile_slots' => 6, 'price_minor' => 60000],
        ])->each(fn (array $package) => DB::table('patient_card_packages')->insert([
            ...$package,
            'validity_days' => 365,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]));
    }

    public function down(): void
    {
        Schema::table('withdrawal_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('processed_by');
            $table->dropColumn(['contract_number', 'payout_period', 'payout_sent_at', 'payout_method', 'payout_reference']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('telegram_chat_id');
        });

        Schema::dropIfExists('platform_setting_versions');

        Schema::table('platform_settings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('updated_by');
            $table->dropColumn(['type', 'effective_from']);
        });

        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('consultation_request_id');
            $table->dropColumn('rate_snapshot');
        });

        Schema::table('operator_profiles', function (Blueprint $table) {
            $table->dropUnique(['affiliate_code']);
            $table->dropColumn([
                'country',
                'locality',
                'base_fee_minor',
                'served_areas',
                'travel_fees',
                'service_catalog',
                'has_device_subscription',
                'contract_number',
                'affiliate_code',
            ]);
        });

        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->dropUnique(['affiliate_code']);
            $table->dropColumn([
                'service_catalog',
                'required_investigations',
                'video_price',
                'video_duration_minutes',
                'google_meet_account',
                'affiliate_code',
            ]);
        });

        Schema::table('medical_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('patient_profile_id');
            $table->dropConstrainedForeignId('consultation_request_id');
            $table->dropColumn(['signature_provider', 'signature_payload']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('patient_profile_id');
            $table->dropColumn(['starts_at', 'free_until', 'reactivated_until', 'hard_closes_at']);
        });

        Schema::table('consultations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('patient_profile_id');
            $table->dropColumn(['current_illness_history', 'objective_data_snapshot', 'signed_pdf_path']);
        });

        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('patient_profile_id');
            $table->dropColumn([
                'consultation_kind',
                'selected_services',
                'pricing_snapshot',
                'anamnesis_completed_at',
                'objective_data_completed_at',
                'conclusion_sent_at',
                'doctor_response_minutes',
                'free_chat_until',
                'chat_reactivated_until',
                'rating_required_after',
                'closed_at',
            ]);
        });

        Schema::dropIfExists('operator_reviews');
        Schema::dropIfExists('consultation_objective_data');
        Schema::dropIfExists('patient_investigations');
        Schema::dropIfExists('patient_card_purchases');
        Schema::dropIfExists('patient_card_packages');

        Schema::table('patient_profiles', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'status']);
            $table->dropIndex(['country', 'region', 'locality']);
            $table->dropColumn([
                'first_name',
                'last_name',
                'country',
                'region',
                'locality',
                'life_history',
                'status',
                'active_until',
            ]);
            $table->unique('user_id');
        });
    }
};
