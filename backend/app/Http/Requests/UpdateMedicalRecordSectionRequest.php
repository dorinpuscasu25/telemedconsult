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

        return [
            'section' => ['required', Rule::in(MedicalRecordSchema::SECTIONS)],
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
