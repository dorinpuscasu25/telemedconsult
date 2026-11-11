<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRequest;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pagina unui operator în admin: contul, zona, vizitele și câștigurile, pe o
 * singură pagină. Portofelul și pacienții aduși vin din endpoint-urile lor.
 */
class AdminOperatorController extends Controller
{
    /** Veniturile operatorului din vizite, în portofelul real. */
    private const INCOME_TYPES = ['operator_exam_income', 'operator_add_on_income', 'operator_travel_income'];

    public function show(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()?->loadMissing('roles')->hasRole('admin'), 403);
        $user->loadMissing(['roles', 'operatorProfile']);
        $profile = $user->operatorProfile;

        $visits = ConsultationRequest::where('operator_id', $user->id)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');
        $examsDone = ConsultationRequest::where('operator_id', $user->id)->whereNotNull('objective_data_completed_at')->count();
        $lastVisit = ConsultationRequest::where('operator_id', $user->id)->latest('updated_at')->value('updated_at');
        $income = WalletTransaction::where('user_id', $user->id)->whereIn('type', self::INCOME_TYPES)->where('status', 'completed');

        return response()->json(['data' => [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status,
            'roles' => $user->roles->pluck('name')->values(),
            'created_at' => $user->created_at,
            'telegram_linked' => (bool) $user->telegram_chat_id,
            'referral_code' => $user->referral_code,
            'profile' => $profile ? [
                'region' => $profile->region,
                'locality' => $profile->locality,
                'is_approved' => (bool) $profile->is_approved,
                'is_available' => (bool) $profile->is_available,
                'contract_number' => $profile->contract_number,
                'has_device_subscription' => (bool) $profile->has_device_subscription,
                'served_areas' => $profile->served_areas ?? [],
            ] : null,
            'visits' => [
                'total' => (int) $visits->sum(),
                'in_progress' => (int) (($visits['accepted'] ?? 0) + ($visits['new'] ?? 0) + ($visits['rescheduled'] ?? 0)),
                'exams_done' => $examsDone,
                'completed' => (int) ($visits['completed'] ?? 0),
                'cancelled' => (int) (($visits['cancelled'] ?? 0) + ($visits['rejected'] ?? 0) + ($visits['expired'] ?? 0)),
                'last_at' => $lastVisit,
            ],
            'earnings' => [
                'visits_total' => (int) (clone $income)->sum('amount_minor') / 100,
                'this_month' => (int) (clone $income)->where('created_at', '>=', now()->startOfMonth())->sum('amount_minor') / 100,
            ],
        ]]);
    }
}
