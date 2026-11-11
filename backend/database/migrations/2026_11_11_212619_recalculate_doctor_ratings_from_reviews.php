<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ratingul și numărul de recenzii se recalculează din recenziile reale. Valorile
 * puse de mână (date demo, implicitul 5) dispar; medicii fără recenzii au 0.
 * Ireversibil intenționat: valorile vechi nu erau reale.
 */
return new class extends Migration
{
    public function up(): void
    {
        $stats = DB::table('doctor_reviews')
            ->selectRaw('doctor_id, AVG(rating) as rating, COUNT(*) as reviews_count')
            ->groupBy('doctor_id')
            ->get()
            ->keyBy('doctor_id');

        DB::table('doctor_profiles')->select(['id', 'user_id'])->orderBy('id')->each(function (object $profile) use ($stats) {
            $row = $stats->get($profile->user_id);
            DB::table('doctor_profiles')->where('id', $profile->id)->update([
                'rating' => $row ? round((float) $row->rating, 1) : 0,
                'reviews_count' => $row ? (int) $row->reviews_count : 0,
            ]);
        });
    }

    public function down(): void
    {
        //
    }
};
