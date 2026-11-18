<?php

namespace App\Http\Requests;

use App\Services\MedicalRecordSchema;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMedicalRecordSectionRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->input('section') === 'birth' && is_numeric($this->input('data.apgar'))) {
            $this->merge(['data' => [...$this->input('data', []), 'apgar' => (string) $this->input('data.apgar')]]);
        }
    }

    public function authorize(): bool
    {
        $profile = $this->route('patientProfile');

        return $profile && ((int) $profile->user_id === (int) $this->user()->id || $this->user()->hasRole('admin'));
    }

    public function rules(): array
    {
        $section = (string) $this->input('section');
        $base = [
            'section' => ['required', Rule::in(MedicalRecordSchema::SECTIONS)],
            'nothing_to_report' => ['sometimes', 'boolean'],
        ];

        // „Nimic de raportat” marchează secțiunea ca răspunsă, fără conținut.
        if ($this->boolean('nothing_to_report')) {
            return [...$base, 'data' => ['prohibited']];
        }

        $rules = [
            ...$base,
            ...(in_array($section, MedicalRecordSchema::SECTIONS, true) ? MedicalRecordSchema::rules($section) : []),
        ];
        $legacyWeeks = $this->route('patientProfile')?->medical_record['birth']['gestational_weeks'] ?? null;
        if ($section === 'birth' && is_numeric($legacyWeeks) && (int) $legacyWeeks > 42 && (string) $this->input('data.gestational_weeks') === (string) $legacyWeeks) {
            $rules['data.gestational_weeks'] = ['nullable', 'integer'];
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'data.*.name.required' => 'Completează denumirea pentru fiecare înregistrare.',
            'data.*.relationship.required' => 'Indică gradul de rudenie.',
            'data.items.*.name.required' => 'Completează denumirea vaccinului.',
        ];
    }
}
