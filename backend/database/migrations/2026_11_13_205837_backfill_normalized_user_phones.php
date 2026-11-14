<?php

use App\Services\Higo\HigoResourceBuilder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $normalizer = app(HigoResourceBuilder::class);
        $phones = [];
        $updates = [];
        foreach (DB::table('users')->select('id', 'phone')->orderBy('id')->cursor() as $user) {
            $phone = $normalizer->normalizePhone($user->phone);
            if ($phone !== null && isset($phones[$phone])) {
                throw new RuntimeException('Telefoane duplicate la conturile '.$phones[$phone].' și '.$user->id.'. Rezolvă duplicatele înainte de migrare.');
            }
            if ($phone !== null) {
                $phones[$phone] = $user->id;
            }
            $updates[$user->id] = $phone;
        }
        DB::transaction(function () use ($updates) {
            foreach ($updates as $id => $phone) {
                DB::table('users')->where('id', $id)->update(['normalized_phone' => $phone]);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('users')->update(['normalized_phone' => null]);
    }
};
