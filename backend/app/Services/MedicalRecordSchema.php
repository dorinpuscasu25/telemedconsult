<?php

namespace App\Services;

use Illuminate\Validation\Rule;

class MedicalRecordSchema
{
    public const SECTIONS = ['birth', 'vaccinations', 'surgeries', 'drug_allergies', 'food_allergies', 'chronic_conditions', 'family_history', 'lifestyle', 'disease_history'];

    public static function rules(string $section): array
    {
        $text = ['nullable', 'string', 'max:4000'];
        $date = ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'];
        $birth = [
            'birth_method' => ['nullable', Rule::in(['natural', 'cesarean', 'forceps', 'vacuum'])],
            'gestational_weeks' => ['nullable', 'integer', 'min:24', 'max:43'],
            'birth_weight' => ['nullable', 'numeric', 'min:1', 'max:10000'],
            'head_circumference' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'apgar' => ['nullable', 'integer', 'min:1', 'max:10'],
            'feeding' => ['nullable', Rule::in(['natural', 'artificial', 'mixed'])],
            'blood_group' => ['nullable', Rule::in(['A', 'B', 'AB', 'O'])],
            'rh' => ['nullable', Rule::in(['positive', 'negative'])],
            'congenital_conditions' => $text, 'other_details' => $text,
            'development' => $text, 'development_age' => $text,
        ];
        $lifestyle = [
            'activity' => ['nullable', Rule::in(['sedentary', 'active', 'regular_sport'])],
            'workplace' => $text, 'exposures' => $text, 'smoking' => $text,
            'alcohol' => $text, 'long_term_medication' => $text, 'notes' => $text,
        ];
        $rows = match ($section) {
            'surgeries' => ['name' => ['required', 'string', 'max:255'], 'date' => $date, 'period' => $text, 'complications' => $text],
            'drug_allergies', 'food_allergies' => ['name' => ['required', 'string', 'max:255'], 'period' => $text, 'manifestation' => $text, 'resolution' => $text],
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
