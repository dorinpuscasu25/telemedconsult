<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PerformanceAward;
use App\Services\DoctorPerformance;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PerformanceAwardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('doctor') || $request->user()->hasRole('admin'), 403);

        return response()->json(['data' => PerformanceAward::orderByDesc('period')->limit(24)->get(['id', 'period', 'status', 'prizes', 'results', 'published_at'])]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $input = $request->validate(['period' => ['required', 'date_format:Y-m'], 'prizes' => ['required', 'array', 'min:1', 'max:20'], 'prizes.*.position' => ['required', 'integer', 'min:1', 'max:100', 'distinct'], 'prizes.*.amount' => ['required', 'numeric', 'min:0.01', 'max:1000000']]);
        $award = DB::transaction(function () use ($request, $input) {
            $award = PerformanceAward::firstOrCreate(['period' => $input['period']], ['prizes' => [], 'updated_by' => $request->user()->id]);
            $award = PerformanceAward::whereKey($award->id)->lockForUpdate()->firstOrFail();
            abort_unless($award->status === 'draft', 409, 'Premiile publicate nu se modifică.');
            $award->update(['prizes' => collect($input['prizes'])->map(fn ($prize) => ['position' => $prize['position'], 'amount_minor' => (int) round($prize['amount'] * 100)])->sortBy('position')->values()->all(), 'updated_by' => $request->user()->id]);

            return $award;
        });

        return response()->json(['data' => $award], 201);
    }

    public function publish(Request $request, PerformanceAward $award, DoctorPerformance $performance): JsonResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        $award = DB::transaction(function () use ($request, $award, $performance) {
            $award = PerformanceAward::whereKey($award->id)->lockForUpdate()->firstOrFail();
            abort_unless($award->status === 'draft', 409, 'Rezultatele au fost deja publicate.');
            abort_unless($award->period < CarbonImmutable::now('Europe/Chisinau')->format('Y-m'), 422, 'Rezultatele se publică după încheierea lunii.');
            $ranking = $performance->leaderboard($award->period);
            $results = collect($award->prizes)->map(function ($prize) use ($ranking) {
                $row = $ranking->firstWhere('position', $prize['position']);

                return [...$prize, 'doctor_id' => $row['doctor_id'] ?? null, 'doctor' => $row['doctor'] ?? null, 'score' => $row['score'] ?? null, 'payment_status' => 'manual_pending'];
            });
            $award->update(['status' => 'published', 'published_at' => now(), 'updated_by' => $request->user()->id, 'results' => $results->all(), 'ranking_snapshot' => $ranking->all()]);

            return $award;
        });

        return response()->json(['data' => $award]);
    }
}
