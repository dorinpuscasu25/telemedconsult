<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('patient_profiles')->orderBy('id')->chunkById(200, function ($profiles) {
            foreach ($profiles as $profile) {
                if (preg_match('/^[0-9]{6}$/', (string) $profile->patient_code)) {
                    DB::table('patient_profiles')->where('id', $profile->id)->update([
                        'patient_code' => str_pad($profile->patient_code, 15, '0', STR_PAD_LEFT),
                    ]);
                } elseif (! preg_match('/^[0-9]{15}$/', (string) $profile->patient_code)) {
                    do {
                        $code = (string) random_int(100000000000000, 999999999999999);
                    } while (DB::table('patient_profiles')->where('patient_code', $code)->exists());
                    DB::table('patient_profiles')->where('id', $profile->id)->update(['patient_code' => $code]);
                }
            }
        });
    }

    public function down(): void
    {
        // Published patient identifiers are permanent; rollback must not reassign them.
    }
};
