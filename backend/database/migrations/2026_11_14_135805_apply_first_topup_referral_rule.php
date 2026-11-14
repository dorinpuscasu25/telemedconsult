<?php

use App\Services\PlatformConfig;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $config = app(PlatformConfig::class);
        $config->upsert('affiliate.patient_topup_first_only', true, 'affiliate', 'boolean');
        $config->upsert('affiliate.patient_registration_rules', PlatformConfig::DEFAULTS['affiliate.patient_registration_rules']['value'], 'affiliate', 'string');
    }

    public function down(): void
    {
        // Regula comercială nouă nu se inversează prin rollback de schemă.
    }
};
