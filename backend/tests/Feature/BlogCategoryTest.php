<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use App\Models\Partner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BlogCategoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_news_list_includes_the_category(): void
    {
        BlogPost::create(['title' => 'Servicii noi', 'slug' => 'servicii-noi', 'body' => 'Text', 'category' => 'Platformă', 'is_published' => true, 'published_at' => now()]);

        $this->getJson('/api/v1/catalog/blog')->assertOk()->assertJsonPath('data.0.category', 'Platformă');
        $this->getJson('/api/v1/catalog/blog/servicii-noi')->assertOk()->assertJsonPath('data.category', 'Platformă');
    }

    public function test_partner_category_is_saved_by_admin_and_shown_publicly(): void
    {
        Partner::create(['name' => 'Higo', 'category' => 'Dispozitive medicale', 'is_active' => true, 'sort_order' => 0]);

        $this->getJson('/api/v1/catalog/partners')->assertOk()->assertJsonPath('data.0.category', 'Dispozitive medicale');
    }
}
