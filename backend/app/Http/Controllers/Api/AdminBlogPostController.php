<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpsertBlogPostRequest;
use App\Models\BlogPost;
use App\Services\PublicImageStorage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminBlogPostController extends Controller
{
    public function __construct(private readonly PublicImageStorage $images) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json([
            'data' => BlogPost::latest()->get()->map(fn (BlogPost $post) => $this->serialize($post)),
        ]);
    }

    public function show(Request $request, BlogPost $blogPost): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json(['post' => $this->serialize($blogPost)]);
    }

    public function store(UpsertBlogPostRequest $request): JsonResponse
    {
        $post = $this->images->persistReplacement(
            image: $request->file('cover_image'),
            directory: 'blog-covers',
            persist: fn (?string $coverImageUrl) => BlogPost::create($this->payload($request, null, $coverImageUrl)),
        );

        return response()->json([
            'message' => 'Articol creat.',
            'post' => $this->serialize($post),
        ], 201);
    }

    public function update(UpsertBlogPostRequest $request, BlogPost $blogPost): JsonResponse
    {
        $this->images->persistReplacement(
            image: $request->file('cover_image'),
            directory: 'blog-covers',
            persist: function (?string $coverImageUrl) use ($request, $blogPost): void {
                $blogPost->update($this->payload($request, $blogPost, $coverImageUrl));
            },
            currentUrl: $blogPost->cover_image_url,
            removeCurrent: (bool) ($request->validated('remove_cover_image') ?? false),
        );

        return response()->json([
            'message' => 'Articol actualizat.',
            'post' => $this->serialize($blogPost->refresh()),
        ]);
    }

    public function destroy(Request $request, BlogPost $blogPost): JsonResponse
    {
        $this->authorizeAdmin($request);

        $coverImageUrl = $blogPost->cover_image_url;
        $blogPost->delete();
        $this->images->delete($coverImageUrl);

        return response()->json([
            'message' => 'Articol șters.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(
        UpsertBlogPostRequest $request,
        ?BlogPost $blogPost,
        ?string $coverImageUrl,
    ): array {
        $validated = $request->validated();

        $isPublished = $validated['is_published'] ?? false;
        $slug = ($validated['slug'] ?? null) ?: $this->uniqueSlug($validated['title'], $blogPost);

        return [
            'title' => $validated['title'],
            'slug' => $slug,
            'excerpt' => $validated['excerpt'] ?? null,
            'body' => $validated['body'],
            'cover_image_url' => $coverImageUrl,
            'author_name' => $validated['author_name'] ?? null,
            'is_published' => $isPublished,
            'published_at' => $isPublished ? ($blogPost?->published_at ?? now()) : null,
        ];
    }

    private function uniqueSlug(string $title, ?BlogPost $blogPost = null): string
    {
        $base = Str::slug($title) ?: 'articol';
        $slug = $base;
        $suffix = 2;

        while (BlogPost::where('slug', $slug)
            ->when($blogPost, fn ($query) => $query->whereKeyNot($blogPost->id))
            ->exists()) {
            $slug = $base.'-'.$suffix++;
        }

        return $slug;
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
