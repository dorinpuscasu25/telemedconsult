<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->updateBrand('Doctor.md', 'telemedconsult.md');

        if (Schema::hasTable('platform_settings')) {
            DB::table('platform_settings')
                ->where('key', 'support_email')
                ->update([
                    'value' => json_encode('suport@telemedconsult.md'),
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        $this->updateBrand('telemedconsult.md', 'Doctor.md');

        if (Schema::hasTable('platform_settings')) {
            DB::table('platform_settings')
                ->where('key', 'support_email')
                ->where('value', json_encode('suport@telemedconsult.md'))
                ->update([
                    'value' => json_encode('suport@doctor.md'),
                    'updated_at' => now(),
                ]);
        }
    }

    private function updateBrand(string $from, string $to): void
    {
        if (Schema::hasTable('platform_settings')) {
            DB::table('platform_settings')
                ->where('key', 'platform_name')
                ->update([
                    'value' => json_encode($to),
                    'updated_at' => now(),
                ]);
        }

        if (! Schema::hasTable('blog_posts')) {
            return;
        }

        DB::table('blog_posts')
            ->select(['id', 'title', 'body', 'author_name'])
            ->orderBy('id')
            ->each(function (object $post) use ($from, $to): void {
                DB::table('blog_posts')
                    ->where('id', $post->id)
                    ->update([
                        'title' => str_replace($from, $to, $post->title),
                        'body' => str_replace($from, $to, $post->body),
                        'author_name' => $post->author_name === null
                            ? null
                            : str_replace($from, $to, $post->author_name),
                        'updated_at' => now(),
                    ]);
            });
    }
};
