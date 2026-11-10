<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlogCategoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_news_list_includes_the_category(): void
    {
        BlogPost::create(['title' => 'Servicii noi', 'slug' => 'servicii-noi', 'body' => 'Text', 'category' => 'Platformă', 'is_published' => true, 'published_at' => now()]);

        $this->getJson('/api/v1/catalog/blog')->assertOk()->assertJsonPath('data.0.category', 'Platformă');
    }
}
