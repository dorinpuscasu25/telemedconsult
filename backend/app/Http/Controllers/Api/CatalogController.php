<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BlogPost;
use App\Models\DoctorInvestigationRequirement;
use App\Models\DoctorProfile;
use App\Models\InvestigationType;
use App\Models\Locality;
use App\Models\OperatorProfile;
use App\Models\Partner;
use App\Models\PlatformSetting;
use App\Models\Region;
use App\Models\Specialty;
use App\Services\FeatureFlags;
use Illuminate\Http\JsonResponse;

class CatalogController extends Controller
{
    public function specialties(): JsonResponse
    {
        return response()->json(['data' => Specialty::orderBy('name')->get()]);
    }

    public function doctors(): JsonResponse
    {
        if (! app(FeatureFlags::class)->enabled('doctors')) {
            return response()->json(['data' => []]);
        }

        $doctors = DoctorProfile::with(['user', 'specialty', 'investigationRequirements.investigationType'])
            ->where('is_approved', true)
            ->latest()
            ->get()
            ->map(function (DoctorProfile $profile) {
                $isOnVacation = $profile->user->doctorVacations()
                    ->whereDate('starts_on', '<=', now()->toDateString())
                    ->whereDate('ends_on', '>=', now()->toDateString())
                    ->exists();

                return [
                    'id' => (string) $profile->user->id,
                    'name' => $profile->user->name,
                    'email' => $profile->user->email,
                    'phone' => $profile->user->phone,
                    'specialty' => $profile->specialty?->name,
                    'specialty_id' => $profile->specialty_id,
                    'experience_years' => $profile->experience_years,
                    'consultation_price' => $profile->consultation_price,
                    'video_price' => $profile->video_price,
                    'video_duration_minutes' => $profile->video_duration_minutes,
                    'platforms' => $profile->platforms ?? [],
                    'service_catalog' => $profile->service_catalog ?? [],
                    'required_investigations' => $profile->required_investigations ?? [],
                    'investigation_requirements' => [
                        'required' => $this->investigationRequirements($profile, 'required'),
                        'optional' => $this->investigationRequirements($profile, 'optional'),
                    ],
                    'rating' => $profile->rating,
                    'reviews_count' => $profile->reviews_count,
                    'is_available' => $profile->is_available && ! $isOnVacation,
                    'is_on_vacation' => $isOnVacation,
                ];
            });

        return response()->json(['data' => $doctors]);
    }

    public function operators(): JsonResponse
    {
        $examPrice = $this->settingNumber('operator_exam_price', 250);
        $operators = OperatorProfile::with('user')
            ->where('is_approved', true)
            ->latest()
            ->get()
            ->map(fn (OperatorProfile $profile) => [
                'id' => (string) $profile->user->id,
                'name' => $profile->user->name,
                'email' => $profile->user->email,
                'phone' => $profile->user->phone,
                'region' => $profile->region,
                'country' => $profile->country,
                'locality' => $profile->locality,
                'equipment' => $profile->equipment ?? [],
                'base_fee' => $profile->base_fee_minor / 100,
                'served_areas' => $profile->served_areas ?? [],
                'travel_fees' => $profile->travel_fees ?? [],
                'service_catalog' => $profile->service_catalog ?? [],
                'is_available' => $profile->is_available,
                'exam_price' => $examPrice,
            ]);

        return response()->json(['data' => $operators]);
    }

    public function pricing(): JsonResponse
    {
        return response()->json([
            'data' => [
                'operator_exam_price' => $this->settingNumber('operator_exam_price', 250),
                'minimum_consultation_price' => $this->settingNumber('minimum_consultation_price', 500),
            ],
        ]);
    }

    public function features(): JsonResponse
    {
        return response()->json(['data' => app(FeatureFlags::class)->enabledMap()]);
    }

    public function investigations(): JsonResponse
    {
        $investigations = InvestigationType::where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (InvestigationType $type) => [
                'id' => $type->id,
                'code' => $type->code,
                'name' => $type->name,
                'description' => $type->description,
                'default_price' => $type->default_price,
                'requires_device' => $type->requires_device,
                'higo_exam_type' => $type->higo_exam_type,
            ]);

        return response()->json(['data' => $investigations]);
    }

    public function regions(): JsonResponse
    {
        $regions = Region::where('is_active', true)
            ->with(['localities' => fn ($query) => $query->where('is_active', true)->orderBy('name')])
            ->orderBy('country')
            ->orderBy('name')
            ->get()
            ->map(fn (Region $region) => [
                'id' => $region->id,
                'name' => $region->name,
                'type' => $region->type,
                'country' => $region->country,
                'localities' => $region->localities->map(fn (Locality $locality) => [
                    'id' => $locality->id,
                    'name' => $locality->name,
                    'type' => $locality->type,
                ])->values(),
            ]);

        return response()->json(['data' => $regions]);
    }

    public function blog(): JsonResponse
    {
        $posts = BlogPost::where('is_published', true)
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (BlogPost $post) => [
                'id' => $post->id,
                'title' => $post->title,
                'slug' => $post->slug,
                'excerpt' => $post->excerpt,
                'cover_image_url' => $post->cover_image_url,
                'author_name' => $post->author_name,
                'published_at' => $post->published_at,
            ]);

        return response()->json(['data' => $posts]);
    }

    public function blogPost(string $slug): JsonResponse
    {
        $post = BlogPost::where('slug', $slug)
            ->where('is_published', true)
            ->firstOrFail();

        return response()->json([
            'data' => [
                'id' => $post->id,
                'title' => $post->title,
                'slug' => $post->slug,
                'excerpt' => $post->excerpt,
                'body' => $post->body,
                'cover_image_url' => $post->cover_image_url,
                'author_name' => $post->author_name,
                'published_at' => $post->published_at,
            ],
        ]);
    }

    public function partners(): JsonResponse
    {
        $partners = Partner::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (Partner $partner) => [
                'id' => $partner->id,
                'name' => $partner->name,
                'logo_url' => $partner->logo_url,
                'website_url' => $partner->website_url,
                'description' => $partner->description,
            ]);

        return response()->json(['data' => $partners]);
    }

    /**
     * @return list<array{id: int, name: ?string, code: ?string, default_price: ?int, requires_device: bool}>
     */
    private function investigationRequirements(DoctorProfile $profile, string $requirement): array
    {
        return $profile->investigationRequirements
            ->where('requirement', $requirement)
            ->map(fn (DoctorInvestigationRequirement $item) => [
                'id' => $item->investigation_type_id,
                'name' => $item->investigationType?->name,
                'code' => $item->investigationType?->code,
                'default_price' => $item->investigationType?->default_price,
                'requires_device' => (bool) $item->investigationType?->requires_device,
            ])
            ->values()
            ->all();
    }

    private function settingNumber(string $key, int $default): int
    {
        $setting = PlatformSetting::where('key', $key)->first();

        return (int) ($setting?->value ?? $default);
    }
}
