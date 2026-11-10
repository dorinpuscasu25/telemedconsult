<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['title', 'slug', 'excerpt', 'body', 'cover_image_url', 'author_name', 'category', 'audience', 'is_published', 'published_at'])]
class BlogPost extends Model
{
    use StoresDatesInAppTimezone;

    protected function casts(): array
    {
        return [
            'is_published' => 'boolean',
            'published_at' => 'datetime',
        ];
    }
}
