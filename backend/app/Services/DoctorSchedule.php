<?php

namespace App\Services;

use App\Models\ConsultationRequest;
use App\Models\DoctorAvailability;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Regulile de programare ale unui medic, într-un singur loc: disponibilitate,
 * concediu, programul săptămânal (opțional) și suprapunerea cu alte cereri.
 *
 * Folosite atât la validarea unei ore alese (`unavailableReason`), cât și la
 * listarea orelor libere (`freeSlots`), ca cele două să nu se contrazică.
 */
class DoctorSchedule
{
    public const LOCAL_TIMEZONE = 'Europe/Chisinau';

    public const SLOT_MINUTES = 30;

    public const MAX_DURATION_MINUTES = 720;

    private const ACTIVE_STATUSES = ['new', 'accepted', 'rescheduled'];

    /**
     * Programul propus pacientului când medicul nu și-a setat unul: luni–vineri,
     * 09:00–18:00. Doar pentru orele afișate; medicul confirmă sau propune alta.
     */
    private const DEFAULT_WINDOW = ['starts_at' => '09:00:00', 'ends_at' => '18:00:00'];

    /**
     * Motivul pentru care medicul nu poate fi programat la ora dată, sau null dacă se poate.
     */
    public function unavailableReason(User $doctor, CarbonImmutable $scheduledAt, ?int $ignoreRequestId = null, int $durationMinutes = self::SLOT_MINUTES): ?string
    {
        $doctor->loadMissing('doctorProfile');
        $scheduledAt = $this->inAppTimezone($scheduledAt);
        $local = $scheduledAt->setTimezone(self::LOCAL_TIMEZONE);

        if (! $doctor->doctorProfile?->is_available) {
            return 'Medicul nu este disponibil pentru consultații.';
        }

        if ($this->isOnVacation($doctor, $local->toDateString())) {
            return 'Medicul este în concediu în această perioadă.';
        }

        // Programul săptămânal e o restricție opțională: un medic fără niciun
        // interval configurat rămâne programabil oricând.
        $schedule = $this->weeklySchedule($doctor);
        if ($schedule->isNotEmpty() && ! $this->fitsSchedule($schedule->where('is_active', true), $local, $durationMinutes)) {
            return 'Medicul nu are program disponibil în acest interval.';
        }

        if ($this->hasConflict('doctor_id', $doctor->id, $scheduledAt, $ignoreRequestId, $durationMinutes)) {
            return 'Acest interval este deja ocupat.';
        }

        return null;
    }

    /**
     * Verifică suprapunerea intervalelor folosind durata fixată la rezervare.
     */
    public function hasConflict(string $providerColumn, int $providerId, CarbonImmutable $scheduledAt, ?int $ignoreRequestId = null, int $durationMinutes = self::SLOT_MINUTES): bool
    {
        $scheduledAt = $this->inAppTimezone($scheduledAt);
        $slotEnd = $scheduledAt->addMinutes($durationMinutes);

        return $this->bookedWindows($providerColumn, $providerId, $scheduledAt, $slotEnd, $ignoreRequestId)
            ->contains(fn ($window) => $window['start'] < $slotEnd->getTimestamp() && $window['end'] > $scheduledAt->getTimestamp());
    }

    private function bookedWindows(string $providerColumn, int $providerId, CarbonImmutable $from, CarbonImmutable $to, ?int $ignoreRequestId): Collection
    {
        return ConsultationRequest::query()
            ->when($ignoreRequestId, fn ($query) => $query->where('id', '!=', $ignoreRequestId))
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->where($providerColumn, $providerId)
            ->whereNotNull('scheduled_at')
            ->whereBetween('scheduled_at', [$this->inAppTimezone($from->subMinutes(self::MAX_DURATION_MINUTES)), $this->inAppTimezone($to)])
            ->get(['scheduled_at', 'pricing_snapshot'])
            ->map(fn ($item) => ['start' => $item->scheduled_at->getTimestamp(), 'end' => $item->scheduled_at->getTimestamp() + ($providerColumn === 'doctor_id' ? $this->durationMinutes($item->pricing_snapshot['service'] ?? null) : self::SLOT_MINUTES) * 60]);
    }

    public function durationMinutes(?array $service): int
    {
        return in_array($service['type'] ?? null, ['video', 'home'], true) ? max(1, min(self::MAX_DURATION_MINUTES, (int) ($service['duration'] ?? self::SLOT_MINUTES))) : self::SLOT_MINUTES;
    }

    /**
     * Orele libere sunt propuse din 30 în 30 de minute și includ întreaga durată a serviciului.
     *
     * Fără program săptămânal se propun orele programului implicit (luni–vineri,
     * 09:00–18:00), cu `default_schedule: true`; pacientul poate alege și altă oră.
     *
     * @return array{has_schedule: bool, default_schedule: bool, is_available: bool, timezone: string, days: list<array{date: string, slots: list<array{starts_at: string, time: string}>}>}
     */
    public function freeSlots(User $doctor, int $days = 7, ?CarbonImmutable $now = null, bool $includeTaken = false, ?int $ignoreRequestId = null, int $durationMinutes = self::SLOT_MINUTES): array
    {
        $doctor->loadMissing('doctorProfile');
        $now ??= CarbonImmutable::now();
        $schedule = $this->weeklySchedule($doctor);
        $isAvailable = (bool) $doctor->doctorProfile?->is_available;
        $usesDefault = $schedule->isEmpty();
        if ($usesDefault) {
            $schedule = collect(range(1, 5))->map(fn (int $weekday) => (object) ['weekday' => $weekday, ...self::DEFAULT_WINDOW]);
        } else {
            $schedule = $schedule->where('is_active', true);
        }
        $result = ['has_schedule' => true, 'default_schedule' => $usesDefault, 'is_available' => $isAvailable, 'timezone' => self::LOCAL_TIMEZONE, 'days' => []];

        if (! $isAvailable) {
            return [...$result, 'has_schedule' => ! $usesDefault];
        }

        $firstDay = $now->setTimezone(self::LOCAL_TIMEZONE)->startOfDay();
        $lastDay = $firstDay->addDays($days);
        $booked = $this->bookedWindows('doctor_id', $doctor->id, $firstDay, $lastDay, $ignoreRequestId);
        $vacationDays = $doctor->doctorVacations()
            ->whereDate('ends_on', '>=', $firstDay->toDateString())
            ->whereDate('starts_on', '<=', $lastDay->toDateString())
            ->get(['starts_on', 'ends_on']);

        for ($day = $firstDay; $day < $lastDay; $day = $day->addDay()) {
            $date = $day->toDateString();
            $onVacation = $vacationDays->contains(fn ($vacation) => CarbonImmutable::parse($vacation->starts_on)->toDateString() <= $date && CarbonImmutable::parse($vacation->ends_on)->toDateString() >= $date);
            $slots = [];

            if (! $onVacation) {
                foreach ($schedule->where('weekday', $day->dayOfWeek)->sortBy('starts_at') as $window) {
                    $start = $day->setTimeFromTimeString((string) $window->starts_at);
                    $end = $this->windowEnd($day, $window->ends_at);

                    for ($slot = $start; $slot->addMinutes($durationMinutes) <= $end; $slot = $slot->addMinutes(self::SLOT_MINUTES)) {
                        $taken = $this->overlapsBooked($booked, $slot, $durationMinutes);
                        if ($slot <= $now || ($taken && ! $includeTaken)) {
                            continue;
                        }
                        $slots[$slot->format('H:i')] = ['starts_at' => $slot->utc()->toIso8601String(), 'time' => $slot->format('H:i')]
                            + ($includeTaken ? ['taken' => $taken] : []);
                    }
                }
            }

            $result['days'][] = ['date' => $date, 'slots' => array_values($slots)];
        }

        return $result;
    }

    private function overlapsBooked(Collection $windows, CarbonImmutable $slot, int $durationMinutes): bool
    {
        return $windows->contains(fn ($window) => $window['start'] < $slot->getTimestamp() + $durationMinutes * 60 && $window['end'] > $slot->getTimestamp());
    }

    private function isOnVacation(User $doctor, string $localDate): bool
    {
        return $doctor->doctorVacations()
            ->whereDate('starts_on', '<=', $localDate)
            ->whereDate('ends_on', '>=', $localDate)
            ->exists();
    }

    /**
     * @return Collection<int, DoctorAvailability>
     */
    private function weeklySchedule(User $doctor): Collection
    {
        return $doctor->doctorAvailabilities()->get();
    }

    private function fitsSchedule(Collection $schedule, CarbonImmutable $local, int $durationMinutes): bool
    {
        return $schedule->contains(fn (DoctorAvailability $window) => (int) $window->weekday === $local->dayOfWeek
            && $local->setTimeFromTimeString((string) $window->starts_at) <= $local
            && $local->addMinutes($durationMinutes) <= $this->windowEnd($local, $window->ends_at));
    }

    private function inAppTimezone(CarbonImmutable $value): CarbonImmutable
    {
        return $value->setTimezone(config('app.timezone', 'UTC'));
    }

    private function windowEnd(CarbonImmutable $day, mixed $value): CarbonImmutable
    {
        $end = $day->setTimeFromTimeString((string) $value);

        return $end->format('H:i:s') === '00:00:00' ? $end->addDay() : $end;
    }
}
