<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DoctorPromotion;
use App\Models\DoctorPromotionImpression;
use App\Models\User;
use App\Models\Wallet;
use App\Services\DoctorPromotions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class DoctorPromotionController extends Controller
{
    private function doctor(Request $request): User
    {
        $user = $request->user();
        abort_unless($user->hasRole('doctor'), 403);

        return $user;
    }

    public function index(Request $request, DoctorPromotions $promotions): JsonResponse
    {
        $doctor = $this->doctor($request);
        $promotions->expire($doctor);

        return response()->json(['balance' => (int) Wallet::where('user_id', $doctor->id)->where('type', 'points')->value('balance_minor') / 100, 'data' => $this->rows(DoctorPromotion::where('doctor_id', $doctor->id)->latest()->limit(50)->get())]);
    }

    public function store(Request $request, DoctorPromotions $promotions): JsonResponse
    {
        $doctor = $this->doctor($request);
        $input = $request->validate(['points' => ['required', 'integer', 'min:1', 'max:100000'], 'days' => ['required', 'integer', 'min:1', 'max:365']]);

        return response()->json(['data' => $promotions->start($doctor, $input['points'], $input['days'])], 201);
    }

    public function destroy(Request $request, DoctorPromotion $promotion, DoctorPromotions $promotions): JsonResponse
    {
        $promotions->stop($this->doctor($request), $promotion);

        return response()->json(['message' => 'Campania este oprită. Punctele neutilizate au fost returnate.']);
    }

    public function impression(Request $request, DoctorPromotions $promotions): JsonResponse
    {
        abort_unless($request->user()->hasRole('patient'), 403);
        $input = $request->validate(['token' => ['required', 'string', 'max:5000']]);

        return response()->json(['counted' => $promotions->impression($request->user(), $input['token'])]);
    }

    public function admin(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $rows = DoctorPromotion::with('doctor:id,name')->latest()->paginate(50);

        return response()->json(['data' => $this->rows($rows->getCollection()), 'page' => $rows->currentPage(), 'last_page' => $rows->lastPage()]);
    }

    private function rows(Collection $campaigns): Collection
    {
        $counts = DoctorPromotionImpression::whereIn('doctor_promotion_id', $campaigns->pluck('id'))->selectRaw('doctor_promotion_id, COUNT(*) as total, SUM(CASE WHEN position <= 6 THEN 1 ELSE 0 END) as first_group, SUM(CASE WHEN position BETWEEN 7 AND 12 THEN 1 ELSE 0 END) as second_group, SUM(CASE WHEN position >= 13 THEN 1 ELSE 0 END) as third_group')->groupBy('doctor_promotion_id')->get()->keyBy('doctor_promotion_id');

        return $campaigns->map(fn ($campaign) => [...$campaign->toArray(), 'budget' => $campaign->budget_minor / 100, 'remaining' => $campaign->remaining_minor / 100, 'impressions' => (int) ($counts->get($campaign->id)?->total ?? 0), 'groups' => [(int) ($counts->get($campaign->id)?->first_group ?? 0), (int) ($counts->get($campaign->id)?->second_group ?? 0), (int) ($counts->get($campaign->id)?->third_group ?? 0)]]);
    }
}
