<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ConfirmAdminWalletRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->hasRole('admin') ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'confirmation_id' => ['required', 'uuid'],
            'code' => ['required', 'string', 'regex:/^\d{6}$/'],
            'amount' => ['prohibited'],
            'direction' => ['prohibited'],
            'reason' => ['prohibited'],
            'operation' => ['prohibited'],
        ];
    }
}
