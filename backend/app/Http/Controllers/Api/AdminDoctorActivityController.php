<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\DoctorProfileView;
use App\Models\InstitutionEarning;
use App\Models\Referral;
use App\Models\User;
use App\Services\DoctorPerformance;
use App\Services\InstitutionLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminDoctorActivityController extends Controller
{
    public function show(Request $request, User $doctor): JsonResponse
    {
        abort_unless($request->user()->hasRole('admin'), 403);
        abort_unless($doctor->hasRole('doctor') && $doctor->doctorProfile, 404);
        $consultations = Consultation::where('doctor_id', $doctor->id)->where('status', 'completed');
        $requests = ConsultationRequest::where('doctor_id', $doctor->id);
        $cash = 'CASE WHEN COALESCE(real_amount_minor, 0) + COALESCE(points_amount_minor, 0) + COALESCE(promo_amount_minor, 0) > 0 THEN COALESCE(real_amount_minor, 0) ELSE amount_minor END';
        $totals = InstitutionEarning::where('doctor_id', $doctor->id)->selectRaw('SUM(doctor_amount_minor) as doctor_total, SUM(institution_amount_minor) as institution_total')->first();
        $balances = InstitutionEarning::where('doctor_id', $doctor->id)->with('institution:id,name')->get()->groupBy('medical_institution_id')->map(function ($rows) use ($doctor) {
            $institution = $rows->first()->institution;

            return ['institution' => $institution?->name, 'institution_id' => $institution?->id, 'owed' => app(InstitutionLedger::class)->doctorBalanceMinor($institution->id, $doctor->id) / 100, 'pending' => app(InstitutionLedger::class)->doctorPendingMinor($institution->id, $doctor->id) / 100];
        })->values();

        return response()->json(['doctor' => ['id' => $doctor->id, 'name' => $doctor->name, 'email' => $doctor->email, 'specialty' => $doctor->doctorProfile->specialty?->name, 'institution' => $doctor->doctorProfile->medicalInstitution?->name],
            'summary' => ['referred_accounts' => Referral::where('referrer_id', $doctor->id)->count(), 'profile_views' => DoctorProfileView::where('doctor_id', $doctor->id)->count(), 'completed_consultations' => (clone $consultations)->count(), 'unique_patients' => (clone $consultations)->whereNotNull('patient_profile_id')->distinct()->count('patient_profile_id'), 'unique_accounts' => (clone $consultations)->distinct()->count('patient_id'), 'appointments' => (clone $requests)->count(), 'held_cash' => (clone $requests)->where('payment_status', 'held')->sum(DB::raw($cash)) / 100, 'captured_cash' => (clone $requests)->where('payment_status', 'captured')->sum(DB::raw($cash)) / 100, 'doctor_earned' => ($totals->doctor_total ?? 0) / 100, 'institution_earned' => ($totals->institution_total ?? 0) / 100],
            'performance' => app(DoctorPerformance::class)->forDoctor($doctor->doctorProfile), 'institution_balances' => $balances,
            'appointments' => (clone $requests)->latest()->paginate(25, ['id', 'status', 'consultation_kind', 'scheduled_at', 'created_at', 'amount_minor', 'real_amount_minor', 'points_amount_minor', 'promo_amount_minor', 'payment_status'])->through(fn ($item) => [...$item->toArray(), 'real_amount_minor' => ($item->real_amount_minor + $item->points_amount_minor + $item->promo_amount_minor) > 0 ? $item->real_amount_minor : $item->amount_minor])]);
    }
}
