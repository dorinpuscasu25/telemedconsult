<?php

use App\Services\PlatformConfig;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Regulile comerciale confirmate de client (noiembrie 2026):
 * - consultația: 67% medicului, 33% platformei (fără alte rețineri separate);
 * - referral: 3% permanent, în bonusuri, pentru pacienți, medici și operatori.
 *
 * Procentul achitabil din bonusuri rămâne cel setat de admin (implicit 40%).
 *
 * Setările salvate deja din admin sunt actualizate; cele nesalvate iau valoarea
 * implicită nouă din PlatformConfig.
 */
return new class extends Migration
{
    private const VALUES = [
        'rate.platform_commission' => 33,
        'rate.admin_accounting' => 0,
        'rate.bank_guarantee' => 0,
        'rate.bank_transaction' => 0,
        'rate.affiliate_doctor_topup' => 3,
        'rate.affiliate_operator' => 3,
        'rate.affiliate_patient_topup' => 3,
        'affiliate.patient_topup_first_only' => false,
    ];

    public function up(): void
    {
        $config = app(PlatformConfig::class);
        $existing = DB::table('platform_settings')->whereIn('key', array_keys(self::VALUES))->pluck('key')->all();

        foreach (self::VALUES as $key => $value) {
            if (in_array($key, $existing, true)) {
                $config->upsert($key, $value);
            }
        }
    }

    public function down(): void
    {
        // Valorile anterioare rămân în platform_setting_versions.
    }
};
