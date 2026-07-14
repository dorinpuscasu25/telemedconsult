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
        Schema::create('higo_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('direction')->default('outbound');
            $table->string('operation');
            $table->string('resource_type')->nullable();
            $table->string('resource_id')->nullable();
            $table->string('local_model_type')->nullable();
            $table->unsignedBigInteger('local_model_id')->nullable();
            $table->string('higo_id')->nullable();
            $table->string('status')->default('started');
            $table->string('method', 10)->nullable();
            $table->string('endpoint')->nullable();
            $table->unsignedSmallInteger('http_status')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['operation', 'status']);
            $table->index(['resource_type', 'resource_id']);
            $table->index(['local_model_type', 'local_model_id']);
            $table->index(['higo_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('higo_sync_logs');
    }
};
