<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('administrative_conversations')) {
            Schema::create('administrative_conversations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('target_id')->unique()->constrained('users')->restrictOnDelete();
                $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('administrative_messages')) {
            Schema::create('administrative_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('administrative_conversation_id')->constrained()->restrictOnDelete();
                $table->foreignId('sender_id')->constrained('users')->restrictOnDelete();
                $table->boolean('sender_is_admin');
                $table->text('body')->nullable();
                $table->json('attachments')->nullable();
                $table->timestamp('read_at')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasIndex('administrative_messages', ['administrative_conversation_id', 'sender_is_admin', 'read_at'])) {
            Schema::table('administrative_messages', function (Blueprint $table) {
                $table->index(['administrative_conversation_id', 'sender_is_admin', 'read_at'], 'admin_messages_conversation_read_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('administrative_messages');
        Schema::dropIfExists('administrative_conversations');
    }
};
