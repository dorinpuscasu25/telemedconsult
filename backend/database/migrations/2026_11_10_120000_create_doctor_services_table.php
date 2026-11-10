<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Medicul nu mai are „Preț consultație” și „Preț video”, ci o listă de
     * servicii: nume, tip (video, chat, la domiciliu), preț și durată. Pentru
     * chat, `duration` înseamnă orele în care răspunde. Investigațiile se pun
     * doar pe serviciile la domiciliu: {investigation_type_id: required|optional}.
     *
     * Prețurile vechi devin două servicii, ca nimeni să nu rămână fără ofertă.
     */
    public function up(): void
    {
        Schema::create('doctor_services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('doctor_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('type', 16);
            $table->unsignedInteger('price')->default(0);
            $table->unsignedInteger('duration')->default(30);
            $table->json('investigations')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->index(['doctor_id', 'is_active', 'position']);
        });

        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->foreignId('doctor_service_id')->nullable()->after('doctor_id')->constrained('doctor_services')->nullOnDelete();
        });

        $now = now();
        DB::table('doctor_profiles')->orderBy('id')->each(function ($profile) use ($now) {
            $rows = [];
            $rows[] = [
                'doctor_id' => $profile->user_id,
                'name' => 'Consultație video',
                'type' => 'video',
                'price' => (int) ($profile->video_price ?? 500),
                'duration' => (int) ($profile->video_duration_minutes ?: 30),
                'investigations' => null,
                'is_active' => true,
                'position' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if ((int) $profile->consultation_price > 0) {
                $investigations = DB::table('doctor_investigation_requirements')
                    ->where('doctor_id', $profile->user_id)
                    ->pluck('requirement', 'investigation_type_id')
                    ->mapWithKeys(fn ($requirement, $id) => [(string) $id => $requirement])
                    ->all();

                $rows[] = [
                    'doctor_id' => $profile->user_id,
                    'name' => 'Consultație cu examinare la domiciliu',
                    'type' => 'home',
                    'price' => (int) $profile->consultation_price,
                    'duration' => 60,
                    'investigations' => $investigations ? json_encode($investigations) : null,
                    'is_active' => true,
                    'position' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            DB::table('doctor_services')->insert($rows);
        });
    }

    public function down(): void
    {
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('doctor_service_id');
        });
        Schema::dropIfExists('doctor_services');
    }
};
