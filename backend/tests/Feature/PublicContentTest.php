<?php

namespace Tests\Feature;

use App\Models\BlogPost;
use App\Models\Partner;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PublicContentTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_blog_returns_only_published_posts(): void
    {
        BlogPost::create([
            'title' => 'Publicat',
            'slug' => 'publicat',
            'body' => 'Corp articol',
            'is_published' => true,
            'published_at' => now(),
        ]);
        BlogPost::create([
            'title' => 'Ciornă',
            'slug' => 'ciorna',
            'body' => 'Nepublicat',
            'is_published' => false,
        ]);

        $this->getJson('/api/v1/catalog/blog')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', 'publicat');

        $this->getJson('/api/v1/catalog/blog/publicat')
            ->assertOk()
            ->assertJsonPath('data.body', 'Corp articol');

        $this->getJson('/api/v1/catalog/blog/ciorna')->assertNotFound();
    }

    public function test_public_partners_returns_only_active_ordered(): void
    {
        Partner::create(['name' => 'Al doilea', 'sort_order' => 2, 'is_active' => true]);
        Partner::create(['name' => 'Primul', 'sort_order' => 1, 'is_active' => true]);
        Partner::create(['name' => 'Inactiv', 'sort_order' => 0, 'is_active' => false]);

        $this->getJson('/api/v1/catalog/partners')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Primul');
    }

    public function test_blog_admin_crud_requires_admin(): void
    {
        Role::firstOrCreate(['name' => 'patient'], ['label' => 'Pacient']);
        $patient = User::factory()->create(['status' => 'active']);
        $patient->roles()->sync([Role::where('name', 'patient')->value('id')]);

        Sanctum::actingAs($patient);
        $this->postJson('/api/v1/admin/blog-posts', ['title' => 'X', 'body' => 'Y'])->assertForbidden();
    }

    public function test_admin_can_create_a_blog_post_and_it_appears_publicly(): void
    {
        Role::firstOrCreate(['name' => 'admin'], ['label' => 'Administrator']);
        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/admin/blog-posts', [
            'title' => 'Articol nou',
            'body' => 'Conținut demonstrativ',
            'is_published' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('post.slug', 'articol-nou');

        $this->getJson('/api/v1/catalog/blog')
            ->assertOk()
            ->assertJsonPath('data.0.slug', 'articol-nou');
    }

    public function test_admin_can_upload_replace_and_delete_blog_cover(): void
    {
        Storage::fake('public');
        $this->actingAsAdmin();

        $created = $this->post('/api/v1/admin/blog-posts', [
            'title' => 'Articol cu imagine',
            'body' => 'Conținut',
            'cover_image' => UploadedFile::fake()->image('coperta.jpg', 1200, 630),
            'is_published' => '1',
        ])->assertCreated();

        $postId = $created->json('post.id');
        $oldPath = $this->storagePath($created->json('post.cover_image_url'));
        Storage::disk('public')->assertExists($oldPath);

        $updated = $this->post("/api/v1/admin/blog-posts/{$postId}", [
            '_method' => 'PUT',
            'title' => 'Articol actualizat',
            'body' => 'Conținut actualizat',
            'cover_image' => UploadedFile::fake()->image('coperta-noua.png', 1200, 630),
            'is_published' => '1',
        ])->assertOk();

        $newPath = $this->storagePath($updated->json('post.cover_image_url'));
        Storage::disk('public')->assertMissing($oldPath);
        Storage::disk('public')->assertExists($newPath);

        $this->deleteJson("/api/v1/admin/blog-posts/{$postId}")->assertOk();
        Storage::disk('public')->assertMissing($newPath);
    }

    public function test_admin_can_upload_partner_logo_and_invalid_files_are_rejected(): void
    {
        Storage::fake('public');
        $this->actingAsAdmin();

        $created = $this->post('/api/v1/admin/partners', [
            'name' => 'Partener imagine',
            'logo' => UploadedFile::fake()->image('logo.png', 600, 300),
            'website_url' => 'https://example.com',
            'is_active' => '1',
        ])->assertCreated();

        $logoPath = $this->storagePath($created->json('partner.logo_url'));
        Storage::disk('public')->assertExists($logoPath);

        $this->getJson('/api/v1/catalog/partners')
            ->assertOk()
            ->assertJsonPath('data.0.logo_url', $created->json('partner.logo_url'));

        $this->withHeader('Accept', 'application/json')->post('/api/v1/admin/partners', [
            'name' => 'Fișier invalid',
            'logo' => UploadedFile::fake()->create('logo.svg', 10, 'image/svg+xml'),
        ])->assertUnprocessable()->assertJsonValidationErrors('logo');

        $this->assertSame(1, Partner::count());
    }

    private function actingAsAdmin(): User
    {
        Role::firstOrCreate(['name' => 'admin'], ['label' => 'Administrator']);
        $admin = User::factory()->create(['status' => 'active']);
        $admin->roles()->sync([Role::where('name', 'admin')->value('id')]);
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function storagePath(string $url): string
    {
        return Str::after((string) parse_url($url, PHP_URL_PATH), '/storage/');
    }
}
