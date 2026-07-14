<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:50'],
            'telegram_chat_id' => ['nullable', 'string', 'max:100'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'account_type' => ['required', Rule::in(['patient', 'doctor', 'operator'])],
            'specialty_id' => ['nullable', 'required_if:account_type,doctor', Rule::exists('specialties', 'id')],
            'license_number' => ['nullable', 'string', 'max:255'],
            'region' => [
                'nullable',
                'required_if:account_type,operator',
                'string',
                'max:255',
                Rule::exists('regions', 'name')->where('is_active', true),
            ],
            'referral_code' => [
                'nullable',
                'string',
                'max:32',
                Rule::exists('users', 'referral_code'),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Introduceți numele complet.',
            'email.required' => 'Introduceți emailul.',
            'email.email' => 'Introduceți un email valid.',
            'email.unique' => 'Există deja un cont cu acest email.',
            'password.required' => 'Introduceți parola.',
            'password.min' => 'Parola trebuie să aibă minim 8 caractere.',
            'password.confirmed' => 'Parolele introduse nu coincid.',
            'specialty_id.required_if' => 'Alegeți specialitatea.',
            'region.required_if' => 'Alegeți regiunea din catalog.',
            'region.exists' => 'Regiunea selectată nu există în catalog.',
            'referral_code.exists' => 'Linkul de afiliere este invalid sau nu mai este disponibil.',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => mb_strtolower(trim((string) $this->input('email'))),
            'account_type' => $this->input('account_type', 'patient'),
            'referral_code' => filled($this->input('referral_code'))
                ? mb_strtoupper(trim((string) $this->input('referral_code')))
                : null,
        ]);
    }
}
