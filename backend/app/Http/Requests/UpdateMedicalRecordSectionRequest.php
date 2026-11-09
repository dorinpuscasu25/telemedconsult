<?php

namespace App\Http\Requests;

use App\Services\MedicalRecordSchema;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMedicalRecordSectionRequest extends FormRequest
{
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

        return [
            ...$base,
            ...(in_array($section, MedicalRecordSchema::SECTIONS, true) ? MedicalRecordSchema::rules($section) : []),
        ];
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
