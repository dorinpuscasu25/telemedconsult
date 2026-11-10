<?php

namespace App\Console\Commands;

use App\Models\ConsultationRequest;
use App\Notifications\AppEventNotification;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Reamintirea pacientului că propunerea medicului expiră în 2 h și cea pentru medic cu 15 minute înainte de consultație. O trimitem o
 * singură dată pe cerere; pe Telegram ajunge doar dacă medicul a ales reamintiri.
 */
#[Signature('consultations:remind')]
#[Description('Reamintiri: medicul înainte de consultație, pacientul înainte să expire propunerea')]
class SendConsultationReminders extends Command
{
    public function handle(): int
    {
        $now = CarbonImmutable::now();

        $due = ConsultationRequest::with('doctor')
            ->where('status', 'accepted')
            ->whereNull('doctor_started_at')
            ->whereNull('doctor_reminded_at')
            ->whereNotNull('doctor_id')
            ->whereBetween('scheduled_at', [$now, $now->addMinutes(15)])
            ->get();

        foreach ($due as $item) {
            $item->forceFill(['doctor_reminded_at' => $now])->save();
            $item->doctor?->notify(new AppEventNotification(
                'Consultație în 15 minute',
                'Consultația începe la '.$item->scheduled_at->setTimezone('Europe/Chisinau')->format('H:i').'.',
                '/doctor/consultations?request='.$item->id,
                'info',
                false,
                'reminders',
            ));
        }

        // Pacientul află cu 2 h înainte că propunerea medicului expiră.
        $proposals = ConsultationRequest::with('patient', 'doctor')
            ->where('status', 'rescheduled')
            ->whereNull('patient_asked_at')
            ->whereNull('proposal_reminded_at')
            ->whereBetween('proposal_expires_at', [$now, $now->addHours(2)])
            ->get();

        foreach ($proposals as $item) {
            $item->forceFill(['proposal_reminded_at' => $now])->save();
            $item->patient?->notify(new AppEventNotification(
                'Propunerea expiră în curând',
                'Alege una dintre orele propuse de medic până la '.$item->proposal_expires_at->setTimezone('Europe/Chisinau')->format('H:i').'.',
                '/patient/consultations?request='.$item->id,
                'warning',
                false,
                'requests',
            ));
        }

        $this->info("Reamintiri trimise: {$due->count()} medici, {$proposals->count()} pacienți");

        return self::SUCCESS;
    }
}
