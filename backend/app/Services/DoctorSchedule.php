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

    private const ACTIVE_STATUSES = ['new', 'accepted', 'rescheduled'];

    /**
     * Motivul pentru care medicul nu poate fi programat la ora dată, sau null dacă se poate.
     */
    public function unavailableReason(User $doctor, CarbonImmutable $scheduledAt, ?int $ignoreRequestId = null): ?string
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
        $schedule = $this->activeSchedule($doctor);
        if ($schedule->isNotEmpty() && ! $this->fitsSchedule($schedule, $local)) {
            return 'Medicul nu are program disponibil în acest interval.';
        }

        if ($this->hasConflict('doctor_id', $doctor->id, $scheduledAt, $ignoreRequestId)) {
            return 'Acest interval este deja ocupat.';
        }

        return null;
    }

    /**
     * Există o altă cerere activă a aceluiași prestator în ±30 de minute.
     */
    public function hasConflict(string $providerColumn, int $providerId, CarbonImmutable $scheduledAt, ?int $ignoreRequestId = null): bool
    {
        // Datele se compară în fusul aplicației, în care sunt stocate.
        $scheduledAt = $this->inAppTimezone($scheduledAt);
        $slotEnd = $scheduledAt->addMinutes(self::SLOT_MINUTES);

        return ConsultationRequest::query()
            ->when($ignoreRequestId, fn ($query) => $query->where('id', '!=', $ignoreRequestId))
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->where($providerColumn, $providerId)
            ->whereNotNull('scheduled_at')
            ->whereBetween('scheduled_at', [$scheduledAt->subMinutes(self::SLOT_MINUTES - 1), $slotEnd->subMinute()])
            ->exists();
    }

    /**
     * Orele libere ale medicului pe următoarele zile, în intervale de 30 de minute.
     *
     * Fără program săptămânal nu există ore „libere” de propus: răspunsul spune
     * `has_schedule: false`, iar pacientul alege ora liber.
     *
     * @return array{has_schedule: bool, is_available: bool, timezone: string, days: list<array{date: string, slots: list<array{starts_at: string, time: string}>}>}
     */
    public function freeSlots(User $doctor, int $days = 7, ?CarbonImmutable $now = null, bool $includeTaken = false, ?int $ignoreRequestId = null): array
    {
        $doctor->loadMissing('doctorProfile');
        $now ??= CarbonImmutable::now();
        $schedule = $this->activeSchedule($doctor);
        $isAvailable = (bool) $doctor->doctorProfile?->is_available;
        $result = ['has_schedule' => $schedule->isNotEmpty(), 'is_available' => $isAvailable, 'timezone' => self::LOCAL_TIMEZONE, 'days' => []];

        if (! $isAvailable || $schedule->isEmpty()) {
            return $result;
        }

        $firstDay = $now->setTimezone(self::LOCAL_TIMEZONE)->startOfDay();
        $lastDay = $firstDay->addDays($days);
        $booked = ConsultationRequest::query()
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->where('doctor_id', $doctor->id)
            ->when($ignoreRequestId, fn ($query) => $query->where('id', '!=', $ignoreRequestId))
            ->whereNotNull('scheduled_at')
            ->whereBetween('scheduled_at', [$this->inAppTimezone($firstDay->subMinutes(self::SLOT_MINUTES)), $this->inAppTimezone($lastDay->addMinutes(self::SLOT_MINUTES))])
            ->toBase()
            ->pluck('scheduled_at')
            // Valorile brute sunt în fusul aplicației, în care se stochează.
            ->map(fn ($value) => CarbonImmutable::parse((string) $value, config('app.timezone', 'UTC'))->getTimestamp());
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
                    $end = $day->setTimeFromTimeString((string) $window->ends_at);

                    for ($slot = $start; $slot->addMinutes(self::SLOT_MINUTES) <= $end; $slot = $slot->addMinutes(self::SLOT_MINUTES)) {
                        $taken = $this->overlapsBooked($booked, $slot);
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

    private function overlapsBooked(Collection $bookedTimestamps, CarbonImmutable $slot): bool
    {
        $timestamp = $slot->getTimestamp();
        $window = (self::SLOT_MINUTES - 1) * 60;

        return $bookedTimestamps->contains(fn (int $booked) => abs($booked - $timestamp) <= $window);
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
    private function activeSchedule(User $doctor): Collection
    {
        return $doctor->doctorAvailabilities()->where('is_active', true)->get();
    }

    private function fitsSchedule(Collection $schedule, CarbonImmutable $local): bool
    {
        $start = $local->format('H:i:s');
        $end = $local->addMinutes(self::SLOT_MINUTES)->format('H:i:s');

        return $schedule->contains(fn (DoctorAvailability $window) => (int) $window->weekday === $local->dayOfWeek
            && $this->timeString($window->starts_at) <= $start
            && $this->timeString($window->ends_at) >= $end);
    }

    private function inAppTimezone(CarbonImmutable $value): CarbonImmutable
    {
        return $value->setTimezone(config('app.timezone', 'UTC'));
    }

    private function timeString(mixed $value): string
    {
        return CarbonImmutable::parse((string) $value)->format('H:i:s');
    }
}
