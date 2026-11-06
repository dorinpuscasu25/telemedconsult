<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Alergiile sunt acum o singură secțiune (`drug_allergies`) cu tipul ales pe
 * fiecare înregistrare: medicament / aliment / alergen respirator. Mutăm
 * înregistrările vechi din `food_allergies` acolo, marcate ca aliment.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('patient_profiles')->whereNotNull('medical_record')->orderBy('id')->each(function ($profile) {
            $record = json_decode((string) $profile->medical_record, true);
            if (! is_array($record)) {
                return;
            }
            $changed = false;
            $allergies = [];
            foreach ((array) ($record['drug_allergies'] ?? []) as $entry) {
                if (is_array($entry)) {
                    $allergies[] = ['allergy_type' => $entry['allergy_type'] ?? 'drug', ...$entry];
                    $changed = true;
                }
            }
            foreach ((array) ($record['food_allergies'] ?? []) as $entry) {
                if (is_array($entry)) {
                    $allergies[] = ['allergy_type' => 'food', ...$entry];
                }
            }
            if (array_key_exists('food_allergies', $record)) {
                unset($record['food_allergies']);
                $changed = true;
            }
            if (! $changed) {
                return;
            }
            $record['drug_allergies'] = $allergies;
            DB::table('patient_profiles')->where('id', $profile->id)->update(['medical_record' => json_encode($record, JSON_UNESCAPED_UNICODE)]);
        });
    }

    public function down(): void
    {
        // Datele rămân în secțiunea unificată; nu le despărțim înapoi.
    }
};
