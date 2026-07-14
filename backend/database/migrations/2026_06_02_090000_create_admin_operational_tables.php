<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('complaints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reported_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('consultation_request_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('new');
            $table->string('subject');
            $table->text('description');
            $table->text('resolution_note')->nullable();
            $table->string('coupon_code')->nullable();
            $table->integer('coupon_amount_minor')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('contract_templates', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('type')->default('general');
            $table->longText('content');
            $table->string('status')->default('active');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('platform_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->json('value')->nullable();
            $table->string('group')->default('general');
            $table->timestamps();
        });

        Schema::create('withdrawal_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->integer('amount_minor');
            $table->integer('approved_amount_minor')->nullable();
            $table->string('currency', 3)->default('MDL');
            $table->string('iban');
            $table->string('status')->default('pending');
            $table->text('admin_note')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('withdrawal_requests');
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('contract_templates');
        Schema::dropIfExists('complaints');
    }
};
