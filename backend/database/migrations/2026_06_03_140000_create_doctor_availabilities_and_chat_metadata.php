<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('doctor_availabilities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('doctor_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday');
            $table->time('starts_at');
            $table->time('ends_at');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['doctor_id', 'weekday', 'is_active']);
        });

        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->timestamp('proposed_scheduled_at')->nullable()->after('scheduled_at');
            $table->foreignId('proposed_by')->nullable()->after('proposed_scheduled_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->json('metadata')->nullable()->after('read_at');
        });

        $doctorRoleId = DB::table('roles')->where('name', 'doctor')->value('id');
        if ($doctorRoleId) {
            $doctorIds = DB::table('role_user')->where('role_id', $doctorRoleId)->pluck('user_id');
            $now = now();
            foreach ($doctorIds as $doctorId) {
                foreach ([1, 2, 3, 4, 5] as $weekday) {
                    DB::table('doctor_availabilities')->insert([
                        'doctor_id' => $doctorId,
                        'weekday' => $weekday,
                        'starts_at' => '09:00:00',
                        'ends_at' => '18:00:00',
                        'is_active' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn('metadata');
        });

        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proposed_by');
            $table->dropColumn('proposed_scheduled_at');
        });

        Schema::dropIfExists('doctor_availabilities');
    }
};
