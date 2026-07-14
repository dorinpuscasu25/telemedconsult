<?php

namespace App\Services;

use App\Models\ConsultationRequest;

/**
 * Canonical `with_exam` consultation state machine (spec §10). This is an
 * additive layer: the working `status` column is kept for backward compat, and
 * the canonical FSM state is DERIVED from status + the objective/anamnesis flags
 * + lifecycle timestamps. Also exposes the §10 transition table for guarding.
 */
class ConsultationStateMachine
{
    public const DRAFT = 'draft';

    public const PENDING_CONFIRM = 'pending_confirm';

    public const PAID = 'paid';

    public const OPERATOR_ASSIGNED = 'operator_assigned';

    public const REASSIGNING = 'reassigning';

    public const OPERATOR_ACCEPTED = 'operator_accepted';

    public const SCHEDULED = 'scheduled';

    public const IN_PROGRESS = 'in_progress';

    public const DATA_COLLECTED = 'data_collected';

    public const AWAITING_PATIENT_INPUT = 'awaiting_patient_input';

    public const AWAITING_DOCTOR = 'awaiting_doctor';

    public const ADDITIONAL_REQUESTED = 'additional_requested';

    public const CONCLUDED = 'concluded';

    public const CLOSED = 'closed';

    public const CANCELLED = 'cancelled';

    public const NO_OPERATOR_AVAILABLE = 'no_operator_available';

    /**
     * The §10 transition table: state => list of states it may move to.
     *
     * @var array<string, list<string>>
     */
    public const TRANSITIONS = [
        self::DRAFT => [self::PENDING_CONFIRM, self::CANCELLED],
        self::PENDING_CONFIRM => [self::PAID, self::CANCELLED, self::NO_OPERATOR_AVAILABLE],
        self::PAID => [self::OPERATOR_ASSIGNED],
        self::OPERATOR_ASSIGNED => [self::OPERATOR_ACCEPTED, self::REASSIGNING, self::CANCELLED],
        self::REASSIGNING => [self::OPERATOR_ASSIGNED, self::NO_OPERATOR_AVAILABLE],
        self::OPERATOR_ACCEPTED => [self::SCHEDULED, self::REASSIGNING, self::CANCELLED],
        self::SCHEDULED => [self::IN_PROGRESS, self::CANCELLED],
        self::IN_PROGRESS => [self::DATA_COLLECTED],
        self::DATA_COLLECTED => [self::AWAITING_DOCTOR, self::AWAITING_PATIENT_INPUT],
        self::AWAITING_PATIENT_INPUT => [self::AWAITING_DOCTOR],
        self::AWAITING_DOCTOR => [self::ADDITIONAL_REQUESTED, self::CONCLUDED],
        self::ADDITIONAL_REQUESTED => [self::IN_PROGRESS],
        self::CONCLUDED => [self::CLOSED],
        self::CLOSED => [],
        self::CANCELLED => [],
        self::NO_OPERATOR_AVAILABLE => [],
    ];

    public function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    /**
     * @return list<string>
     */
    public function allowedNext(string $state): array
    {
        return self::TRANSITIONS[$state] ?? [];
    }

    /**
     * Derive the canonical FSM state from the request's stored status + flags.
     */
    public function stateFor(ConsultationRequest $request): string
    {
        if (in_array($request->consultation_kind, ['video', 'preliminary'], true)) {
            return match (true) {
                $request->closed_at !== null => self::CLOSED,
                $request->conclusion_sent_at !== null => self::CONCLUDED,
                in_array($request->status, ['cancelled', 'rejected', 'expired'], true) => self::CANCELLED,
                default => self::AWAITING_DOCTOR,
            };
        }

        return match (true) {
            $request->status === 'no_operator_available' => self::NO_OPERATOR_AVAILABLE,
            in_array($request->status, ['cancelled', 'rejected', 'expired'], true) => self::CANCELLED,
            $request->closed_at !== null => self::CLOSED,
            $request->conclusion_sent_at !== null => self::CONCLUDED,
            $request->objective_data_completed_at !== null && $request->anamnesis_completed_at !== null => self::AWAITING_DOCTOR,
            $request->objective_data_completed_at !== null => self::AWAITING_PATIENT_INPUT,
            $request->anamnesis_completed_at !== null => self::IN_PROGRESS,
            $request->status === 'rescheduled' => self::OPERATOR_ACCEPTED,
            $request->status === 'accepted' && $request->scheduled_at !== null => self::SCHEDULED,
            $request->status === 'accepted' => self::OPERATOR_ACCEPTED,
            $request->status === 'new' && $request->operator_id !== null => self::OPERATOR_ASSIGNED,
            default => self::PAID,
        };
    }

    /**
     * FSM1 gate: a with_exam consultation reaches the doctor only when BOTH the
     * objective data and the anamnesis are complete.
     */
    public function readyForDoctor(ConsultationRequest $request): bool
    {
        if (in_array($request->consultation_kind, ['video', 'preliminary'], true)) {
            return true;
        }

        return $request->objective_data_completed_at !== null && $request->anamnesis_completed_at !== null;
    }
}
