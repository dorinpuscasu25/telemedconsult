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
        Schema::create('higo_devices', function (Blueprint $table) {
            $table->id();
            $table->string('higo_device_id')->nullable()->unique();
            $table->string('serial_number')->unique();
            $table->string('box_serial_number')->nullable();
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('assigned_higo_user_type')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();

            $table->index(['assigned_user_id', 'status']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('higo_devices');
    }
};
