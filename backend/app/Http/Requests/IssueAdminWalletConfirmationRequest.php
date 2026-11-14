<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class IssueAdminWalletConfirmationRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('reason'))) {
            $this->merge(['reason' => trim($this->input('reason'))]);
        }
    }

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
            'operation' => ['required', 'in:adjustment,promotion'],
            'amount' => ['required_if:operation,adjustment', 'prohibited_if:operation,promotion', 'numeric', 'decimal:0,2', 'min:0.01', 'max:1000000'],
            'direction' => ['required_if:operation,adjustment', 'prohibited_if:operation,promotion', 'in:credit,debit'],
            'reason' => ['required_if:operation,adjustment', 'prohibited_if:operation,promotion', 'string', 'min:3', 'max:255'],
        ];
    }
}
