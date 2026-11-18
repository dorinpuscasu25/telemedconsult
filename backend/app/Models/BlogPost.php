<?php

namespace App\Models;

use App\Models\Concerns\StoresDatesInAppTimezone;
use App\Services\PublicImageStorage;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['title', 'slug', 'excerpt', 'body', 'cover_image_url', 'author_name', 'category', 'audience', 'is_published', 'published_at'])]
class BlogPost extends Model
{
    use StoresDatesInAppTimezone;

    protected function coverImageUrl(): Attribute
    {
        return Attribute::make(get: fn (?string $value) => app(PublicImageStorage::class)->canonicalUrl($value));
    }

    protected function casts(): array
    {
        return [
            'is_published' => 'boolean',
            'published_at' => 'datetime',
        ];
    }
}
