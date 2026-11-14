<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class DecideInstitutionTransferRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->hasRole('institution') ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'status' => ['required', 'in:approved,rejected'],
            'doctor_share_percent' => ['required_if:status,approved', 'nullable', 'numeric', 'min:0', 'max:100'],
            'decision_note' => ['required_if:status,rejected', 'nullable', 'string', 'min:3', 'max:1000'],
        ];
    }
}
