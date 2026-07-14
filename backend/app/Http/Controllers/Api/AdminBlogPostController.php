<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminBlogPostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => BlogPost::latest()->get()->map(fn (BlogPost $post) => $this->serialize($post)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        $post = BlogPost::create($this->payload($request));

        return response()->json([
            'message' => 'Articol creat.',
            'post' => $this->serialize($post),
        ], 201);
    }

    public function update(Request $request, BlogPost $blogPost): JsonResponse
    {
        $this->authorizeAdmin($request);

        $blogPost->update($this->payload($request, $blogPost));

        return response()->json([
            'message' => 'Articol actualizat.',
            'post' => $this->serialize($blogPost->refresh()),
        ]);
    }

    public function destroy(Request $request, BlogPost $blogPost): JsonResponse
    {
        $this->authorizeAdmin($request);

        $blogPost->delete();

        return response()->json([
            'message' => 'Articol șters.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Request $request, ?BlogPost $blogPost = null): array
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', Rule::unique('blog_posts', 'slug')->ignore($blogPost)],
            'excerpt' => ['nullable', 'string', 'max:500'],
            'body' => ['required', 'string'],
            'cover_image_url' => ['nullable', 'url', 'max:2000'],
            'author_name' => ['nullable', 'string', 'max:255'],
            'is_published' => ['nullable', 'boolean'],
        ]);

        $isPublished = $validated['is_published'] ?? false;
        $slug = ($validated['slug'] ?? null) ?: Str::slug($validated['title']);

        return [
            'title' => $validated['title'],
            'slug' => $slug,
            'excerpt' => $validated['excerpt'] ?? null,
            'body' => $validated['body'],
            'cover_image_url' => $validated['cover_image_url'] ?? null,
            'author_name' => $validated['author_name'] ?? null,
            'is_published' => $isPublished,
            'published_at' => $isPublished ? ($blogPost?->published_at ?? now()) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serialize(BlogPost $post): array
    {
        return [
            'id' => $post->id,
            'title' => $post->title,
            'slug' => $post->slug,
            'excerpt' => $post->excerpt,
            'body' => $post->body,
            'cover_image_url' => $post->cover_image_url,
            'author_name' => $post->author_name,
            'is_published' => $post->is_published,
            'published_at' => $post->published_at,
            'created_at' => $post->created_at,
        ];
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
    }
}
