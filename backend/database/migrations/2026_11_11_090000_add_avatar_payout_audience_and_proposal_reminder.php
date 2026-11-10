<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * - fotografia de profil a utilizatorului (o vede pacientul în catalog);
     * - contul în care medicul primește extragerile;
     * - cui i se adresează un anunț din Noutăți (toți, pacienți sau medici);
     * - reamintirea pacientului că propunerea medicului expiră curând.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_url')->nullable()->after('phone');
        });
        Schema::table('doctor_profiles', function (Blueprint $table) {
            $table->string('payout_bank', 80)->nullable();
            $table->string('payout_iban', 40)->nullable();
        });
        Schema::table('blog_posts', function (Blueprint $table) {
            $table->string('audience', 16)->default('all')->after('category');
        });
        Schema::table('consultation_requests', function (Blueprint $table) {
            $table->timestamp('proposal_reminded_at')->nullable()->after('proposal_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('avatar_url'));
        Schema::table('doctor_profiles', fn (Blueprint $table) => $table->dropColumn(['payout_bank', 'payout_iban']));
        Schema::table('blog_posts', fn (Blueprint $table) => $table->dropColumn('audience'));
        Schema::table('consultation_requests', fn (Blueprint $table) => $table->dropColumn('proposal_reminded_at'));
    }
};
