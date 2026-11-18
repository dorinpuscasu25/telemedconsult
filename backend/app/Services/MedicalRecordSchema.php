<?php

namespace App\Services;

use Illuminate\Validation\Rule;

class MedicalRecordSchema
{
    /** Cheia din `medical_record` cu secțiunile marcate „Nimic de raportat”: {secțiune: true}. */
    public const NOTHING_TO_REPORT = 'nothing_to_report';

    public const SECTIONS = ['birth', 'vaccinations', 'surgeries', 'drug_allergies', 'chronic_conditions', 'family_history', 'lifestyle', 'disease_history'];

    /** Medicament / aliment / alergen respirator. */
    public const ALLERGY_TYPES = ['drug', 'food', 'respiratory'];

    public static function rules(string $section): array
    {
        $text = ['nullable', 'string', 'max:4000'];
        $date = ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'];
        $birth = [
            'birth_method' => ['nullable', Rule::in(['natural', 'cesarean', 'forceps', 'vacuum', 'other'])],
            'birth_method_details' => $text,
            'gestational_weeks' => ['nullable', 'integer', 'min:24', 'max:42'],
            'birth_weight' => ['nullable', 'numeric', 'min:1', 'max:10000'],
            'head_circumference' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'apgar' => ['nullable', 'string', 'max:30', 'regex:/^(?:10|[0-9])(?:\s*(?:[\/\-]|din|pe)\s*(?:10|[0-9]))?$/u'],
            'feeding' => ['nullable', Rule::in(['natural', 'artificial', 'mixed'])],
            'feeding_natural_period' => $text, 'feeding_artificial_period' => $text, 'feeding_mixed_period' => $text,
            'blood_group' => ['nullable', Rule::in(['A', 'B', 'AB', 'O'])],
            'rh' => ['nullable', Rule::in(['positive', 'negative'])],
            'congenital_conditions' => $text, 'other_details' => $text,
            'development' => $text, 'development_age' => $text,
            'development_6_months' => $text, 'development_1_year' => $text,
            'development_2_years' => $text, 'development_3_years' => $text,
        ];
        $lifestyle = [
            'activity' => ['nullable', Rule::in(['sedentary', 'active', 'regular_sport'])],
            'workplace' => $text, 'exposures' => $text, 'smoking' => $text,
            'alcohol' => $text, 'long_term_medication' => $text, 'notes' => $text,
        ];
        $rows = match ($section) {
            'surgeries' => ['name' => ['required', 'string', 'max:255'], 'date' => $date, 'period' => $text, 'complications' => $text],
            'drug_allergies' => ['allergy_type' => ['nullable', Rule::in(self::ALLERGY_TYPES)], 'name' => ['required', 'string', 'max:255'], 'period' => $text, 'manifestation' => $text, 'resolution' => $text],
            'chronic_conditions' => ['name' => ['required', 'string', 'max:255'], 'date' => $date, 'specialist' => $text, 'notes' => $text],
            'family_history' => ['relationship' => ['required', 'string', 'max:255'], 'name' => ['required', 'string', 'max:255'], 'notes' => $text],
            'disease_history' => ['name' => ['required', 'string', 'max:255'], 'date' => $date, 'period' => $text, 'notes' => $text],
            default => [],
        };
        if (in_array($section, ['birth', 'lifestyle'], true)) {
            $fields = $section === 'birth' ? $birth : $lifestyle;
            $rules = ['data' => ['required', 'array:'.implode(',', array_keys($fields))]];
            foreach ($fields as $key => $rule) {
                $rules['data.'.$key] = $rule;
            }

            return $rules;
        }
        if ($section === 'vaccinations') {
            return [
                'data' => ['required', 'array:refusal,items'],
                'data.refusal' => ['nullable', Rule::in(['none', 'temporary', 'categorical', 'unknown'])],
                'data.items' => ['present', 'array', 'max:200'],
                'data.items.*' => ['array:name,date,dose,reaction,notes'],
                'data.items.*.name' => ['required', 'string', 'max:255'],
                'data.items.*.date' => $date,
                'data.items.*.dose' => $text,
                'data.items.*.reaction' => $text,
                'data.items.*.notes' => $text,
            ];
        }
        $rules = ['data' => ['present', 'array', 'list', 'max:200'], 'data.*' => ['array:'.implode(',', array_keys($rows))]];
        foreach ($rows as $key => $rule) {
            $rules['data.*.'.$key] = $rule;
        }

        return $rules;
    }
}
