<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\DoctorProfile;
use App\Models\InstitutionEarning;
use App\Models\MedicalInstitution;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class InstitutionReports
{
    public function appointmentsFor(MedicalInstitution $institution): Builder
    {
        return ConsultationRequest::where(function ($query) use ($institution): void {
            $query->where('pricing_snapshot->institution_id', $institution->id)
                ->orWhere(function ($legacy) use ($institution): void {
                    $legacy->whereJsonDoesntContainKey('pricing_snapshot->institution_id')->whereHas('doctor.doctorProfile', function ($profile) use ($institution): void {
                        $profile->where('medical_institution_id', $institution->id)
                            ->where(fn ($dates) => $dates->whereNull('institution_joined_at')->orWhereColumn('consultation_requests.created_at', '>=', 'doctor_profiles.institution_joined_at'));
                    });
                });
        });
    }

    public function report(MedicalInstitution $institution, array $filters): array
    {
        $from = ! empty($filters['from']) ? CarbonImmutable::parse($filters['from'], 'Europe/Chisinau')->startOfDay()->setTimezone(config('app.timezone'))->toDateTimeString() : null;
        $to = ! empty($filters['to']) ? CarbonImmutable::parse($filters['to'], 'Europe/Chisinau')->endOfDay()->setTimezone(config('app.timezone'))->toDateTimeString() : null;
        $doctorIds = DoctorProfile::where('medical_institution_id', $institution->id)->pluck('user_id')
            ->merge(InstitutionEarning::where('medical_institution_id', $institution->id)->distinct()->pluck('doctor_id'))
            ->merge($this->appointmentsFor($institution)->distinct()->pluck('doctor_id'))->filter()->unique();
        $doctors = User::with('doctorProfile')->whereIn('id', $doctorIds)->orderBy('name')->get(['id', 'name']);
        if (isset($filters['doctor_id'])) {
            abort_unless($doctorIds->contains((int) $filters['doctor_id']), 404, 'Medicul nu are activitate în instituție.');
        }
        $appointments = $this->appointmentsFor($institution)
            ->when($filters['doctor_id'] ?? null, fn ($query, $id) => $query->where('doctor_id', $id))
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($from, fn ($query, $date) => $query->whereRaw('COALESCE(scheduled_at, created_at) >= ?', [$date]))
            ->when($to, fn ($query, $date) => $query->whereRaw('COALESCE(scheduled_at, created_at) <= ?', [$date]));
        $earnings = InstitutionEarning::where('medical_institution_id', $institution->id)
            ->when($filters['doctor_id'] ?? null, fn ($query, $id) => $query->where('doctor_id', $id))
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->whereHas('consultationRequest', fn ($request) => $request->where('status', $status)))
            ->when($from, fn ($query, $date) => $query->where('created_at', '>=', $date))
            ->when($to, fn ($query, $date) => $query->where('created_at', '<=', $date));
        $appointmentCounts = (clone $appointments)->selectRaw('doctor_id, COUNT(*) as total')->groupBy('doctor_id')->pluck('total', 'doctor_id');
        $byStatus = (clone $appointments)->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $totals = (clone $earnings)->selectRaw('doctor_id, COUNT(*) as consultations, SUM(gross_amount_minor) as gross, SUM(provider_amount_minor) as provider, SUM(doctor_amount_minor) as doctor_total, SUM(institution_amount_minor) as institution_total')->groupBy('doctor_id')->get()->keyBy('doctor_id');
        $mode = $filters['mode'] ?? 'appointments';
        $perPage = $filters['per_page'] ?? 25;
        $rows = $mode === 'earnings'
            ? (clone $earnings)->with('doctor:id,name')->latest('id')->paginate($perPage)->through(fn ($item) => [
                'id' => $item->id, 'request_id' => $item->consultation_request_id, 'doctor_id' => $item->doctor_id, 'doctor' => $item->doctor?->name,
                'date' => $item->created_at, 'gross' => $item->gross_amount_minor / 100, 'provider' => $item->provider_amount_minor / 100,
                'doctor_amount' => $item->doctor_amount_minor / 100, 'institution_amount' => $item->institution_amount_minor / 100, 'doctor_share_percent' => $item->doctor_share_percent,
            ])
            : (clone $appointments)->with('doctor:id,name')->orderByRaw('COALESCE(scheduled_at, created_at) DESC')->orderByDesc('id')
                ->paginate($perPage, ['id', 'doctor_id', 'status', 'scheduled_at', 'created_at', 'amount_minor', 'real_amount_minor', 'points_amount_minor', 'promo_amount_minor', 'payment_status', 'pricing_snapshot'])
                ->through(fn ($item) => [
                    'id' => $item->id, 'doctor_id' => $item->doctor_id, 'doctor' => $item->doctor?->name, 'status' => $item->status,
                    'date' => $item->scheduled_at ?? $item->created_at, 'created_at' => $item->created_at, 'amount' => $item->amount_minor / 100,
                    'payment_status' => $item->payment_status, 'service' => $item->pricing_snapshot['service']['name'] ?? null,
                ]);

        return [
            'timezone' => 'Europe/Chisinau', 'filters' => $filters, 'mode' => $mode, 'rows' => $rows,
            'summary' => [
                'appointments' => (int) $appointmentCounts->sum(), 'by_status' => $byStatus->map(fn ($count) => (int) $count),
                'settled_consultations' => (int) $totals->sum('consultations'), 'gross' => (int) $totals->sum('gross') / 100,
                'provider' => (int) $totals->sum('provider') / 100, 'doctor_total' => (int) $totals->sum('doctor_total') / 100,
                'institution_total' => (int) $totals->sum('institution_total') / 100,
            ],
            'doctors' => $doctors->map(function ($doctor) use ($institution, $appointmentCounts, $totals): array {
                $total = $totals->get($doctor->id);

                return ['id' => $doctor->id, 'name' => $doctor->name, 'is_current' => (int) $doctor->doctorProfile?->medical_institution_id === (int) $institution->id,
                    'appointments' => (int) $appointmentCounts->get($doctor->id, 0), 'consultations' => (int) ($total->consultations ?? 0),
                    'doctor_total' => (int) ($total->doctor_total ?? 0) / 100, 'institution_total' => (int) ($total->institution_total ?? 0) / 100];
            })->values(),
        ];
    }
}
