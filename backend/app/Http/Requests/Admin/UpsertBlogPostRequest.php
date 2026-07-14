<?php

namespace App\Http\Requests\Admin;

use App\Models\BlogPost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertBlogPostRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->loadMissing('roles')->hasRole('admin') ?? false;
    }

    public function rules(): array
    {
        /** @var BlogPost|null $blogPost */
        $blogPost = $this->route('blogPost');

        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', Rule::unique('blog_posts', 'slug')->ignore($blogPost)],
            'excerpt' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'cover_image' => [
                'nullable',
                'image',
                'mimes:jpg,jpeg,png,webp',
                'mimetypes:image/jpeg,image/png,image/webp',
                'max:5120',
            ],
            'remove_cover_image' => ['nullable', 'boolean'],
            'author_name' => ['nullable', 'string', 'max:255'],
            'is_published' => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'cover_image.image' => 'Coperta trebuie să fie o imagine validă.',
            'cover_image.mimes' => 'Coperta trebuie să fie JPG, PNG sau WebP.',
            'cover_image.mimetypes' => 'Tipul fișierului pentru copertă nu este acceptat.',
            'cover_image.max' => 'Imaginea de copertă poate avea maximum 5 MB.',
        ];
    }
}
