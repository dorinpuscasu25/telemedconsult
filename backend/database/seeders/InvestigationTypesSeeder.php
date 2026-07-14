<?php

namespace Database\Seeders;

use App\Models\InvestigationType;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class InvestigationTypesSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Starter catalog of investigation type definitions. Prices are seeded at 0
     * on purpose — the actual tariffs are a business decision set from admin
     * (see spec §7 CO2 / §14.1), not hardcoded here.
     *
     * @var list<array{code: string, name: string, requires_device: bool, higo_exam_type: ?string}>
     */
    private const TYPES = [
        ['code' => 'temperature', 'name' => 'Temperatură', 'requires_device' => true, 'higo_exam_type' => 'TEMPERATURE_EXAM'],
        ['code' => 'oxygen_saturation', 'name' => 'Saturație O₂ (SpO₂)', 'requires_device' => true, 'higo_exam_type' => 'OXYGEN_SATURATION_EXAM'],
        ['code' => 'heart_rate', 'name' => 'Puls / frecvență cardiacă', 'requires_device' => true, 'higo_exam_type' => 'HEART_RATE_EXAM'],
        ['code' => 'heart_auscultation', 'name' => 'Auscultație cord', 'requires_device' => true, 'higo_exam_type' => 'HEART_AUSCULTATION_EXAM'],
        ['code' => 'lungs_auscultation', 'name' => 'Auscultație plămâni', 'requires_device' => true, 'higo_exam_type' => 'LUNGS_AUSCULTATION_EXAM'],
        ['code' => 'throat_exam', 'name' => 'Examinare gât', 'requires_device' => true, 'higo_exam_type' => 'THROAT_EXAM'],
        ['code' => 'ear_exam', 'name' => 'Examinare urechi', 'requires_device' => true, 'higo_exam_type' => 'EAR_EXAM'],
        ['code' => 'skin_exam', 'name' => 'Examinare piele / dermatoscopie', 'requires_device' => true, 'higo_exam_type' => 'SKIN_EXAM'],
        ['code' => 'abdomen_exam', 'name' => 'Examinare abdomen', 'requires_device' => true, 'higo_exam_type' => 'ABDOMEN_EXAM'],
        ['code' => 'blood_pressure', 'name' => 'Tensiune arterială', 'requires_device' => true, 'higo_exam_type' => null],
    ];

    public function run(): void
    {
        foreach (self::TYPES as $type) {
            InvestigationType::updateOrCreate(
                ['code' => $type['code']],
                [
                    'name' => $type['name'],
                    'requires_device' => $type['requires_device'],
                    'higo_exam_type' => $type['higo_exam_type'],
                    'is_active' => true,
                ],
            );
        }
    }
}
