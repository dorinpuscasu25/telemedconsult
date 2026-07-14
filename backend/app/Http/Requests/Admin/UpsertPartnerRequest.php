<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpsertPartnerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->loadMissing('roles')->hasRole('admin') ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'logo' => [
                'nullable',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'mimetypes:image/jpeg,image/png,image/webp',
                'max:5120',
            ],
            'remove_logo' => ['nullable', 'boolean'],
            'website_url' => ['nullable', 'url', 'max:2000'],
            'description' => ['nullable', 'string', 'max:1000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'logo.image' => 'Logo-ul trebuie să fie o imagine validă.',
            'logo.mimes' => 'Logo-ul trebuie să fie JPG, PNG sau WebP.',
            'logo.mimetypes' => 'Tipul fișierului pentru logo nu este acceptat.',
            'logo.max' => 'Logo-ul poate avea maximum 5 MB.',
        ];
    }
}
