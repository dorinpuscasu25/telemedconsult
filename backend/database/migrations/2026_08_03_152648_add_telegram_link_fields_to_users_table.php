<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Conectarea contului la botul de Telegram se face prin deep-link cu token de
 * unică folosință (`t.me/<bot>?start=<token>`), nu prin lipirea manuală a chat
 * id-ului. Coloanele de mai jos țin tokenul temporar, metadatele legăturii și
 * comutatorul per utilizator pentru canalul Telegram.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('telegram_username')->nullable()->after('telegram_chat_id');
            $table->timestamp('telegram_linked_at')->nullable()->after('telegram_username');
            $table->string('telegram_link_token', 64)->nullable()->unique()->after('telegram_linked_at');
            $table->timestamp('telegram_link_token_expires_at')->nullable()->after('telegram_link_token');
            $table->boolean('telegram_notifications_enabled')->default(true)->after('telegram_link_token_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['telegram_link_token']);
            $table->dropColumn([
                'telegram_username',
                'telegram_linked_at',
                'telegram_link_token',
                'telegram_link_token_expires_at',
                'telegram_notifications_enabled',
            ]);
        });
    }
};
