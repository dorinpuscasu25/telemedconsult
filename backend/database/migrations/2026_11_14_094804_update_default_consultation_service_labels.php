<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        foreach ($this->labels() as $key => [$old, $new]) {
            DB::table('site_contents')->where('key', $key)->where('value', $old)->update(['value' => $new]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach ($this->labels() as $key => [$old, $new]) {
            DB::table('site_contents')->where('key', $key)->where('value', $new)->update(['value' => $old]);
        }
    }

    private function labels(): array
    {
        return [
            'home.services.video.title' => ['Consultație video', 'Consultație video + chat'],
            'home.services.chat.title' => ['Întrebare în chat', 'Consultație în chat'],
            'home.steps.3.text' => ['Diagnosticul, recomandările și PDF-ul rămân în fișa medicală.', 'Lasă recenzia pentru a debloca diagnosticul, recomandările și documentul PDF. Monitorizarea continuă în chat.'],
        ];
    }
};
