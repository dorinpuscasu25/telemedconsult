<?php

namespace App\Services;

use App\Models\Consultation;
use App\Models\ConsultationRequest;
use App\Models\Conversation;
use App\Models\User;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use App\Notifications\AppEventNotification;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Banii unei consultații: rămân rezervați din portofelul pacientului până când
 * consultația se închide.
 *
 * - Concluzia medicului NU ia banii. Pacientul închide consultația lăsând
 *   recenzia și abia atunci plata ajunge la prestator (și la instituția lui).
 * - Dacă pacientul nu lasă recenzie, consultația se închide singură după
 *   `consultations.auto_close_days` zile de la concluzie și plata se face atunci.
 * - Dacă la `consultations.no_show_refund_hours` ore după ora programată nu
 *   există concluzie, consultația nu a avut loc: banii revin pacientului.
 *   Excepție: examinarea la domiciliu deja făcută rămâne pentru decizia adminului.
 */
class ConsultationSettlement
{
    public const AUTO_CLOSE_DAYS = 'consultations.auto_close_days';

    public const NO_SHOW_REFUND_HOURS = 'consultations.no_show_refund_hours';

    public function __construct(private readonly PlatformConfig $config) {}

    public function autoCloseDays(): int
    {
        return max(1, (int) $this->config->number(self::AUTO_CLOSE_DAYS, 3));
    }

    public function noShowRefundHours(): int
    {
        return max(1, (int) $this->config->number(self::NO_SHOW_REFUND_HOURS, 24));
    }

    /** Când se închide singură o consultație finalizată fără recenzie. */
    public function autoCloseAt(ConsultationRequest $request): ?CarbonInterface
    {
        if ($request->status !== 'completed' || $request->closed_at || ! $request->completed_at) {
            return null;
        }

        return $request->completed_at->copy()->addDays($this->autoCloseDays());
    }

    /** Ora după care o consultație confirmată fără concluzie își returnează banii. */
    public function refundDueAt(ConsultationRequest $request): ?CarbonInterface
    {
        $reference = collect([$request->scheduled_at, $request->doctor_started_at, $request->accepted_at])->filter()->max();

        return $reference?->copy()->addHours($this->noShowRefundHours());
    }

    /**
     * Închide consultația și plătește prestatorul. Idempotent: o a doua apelare
     * nu mai mișcă bani (plata e deja `captured`).
     */
    public function close(ConsultationRequest $request): void
    {
        DB::transaction(function () use ($request) {
            $locked = ConsultationRequest::lockForUpdate()->findOrFail($request->id);
            if ($locked->status !== 'completed') {
                return;
            }
            if (! $locked->closed_at) {
                $locked->forceFill(['closed_at' => now()])->save();
            }
            $this->capture($locked);
        });
    }

    /** Mută banii rezervați la prestator; partea instituției se fixează în același moment. */
    public function capture(ConsultationRequest $request): void
    {
        if ($request->payment_status !== 'held' || $request->amount_minor <= 0) {
            return;
        }

        $providerId = $request->doctor_id ?: $request->operator_id;
        $provider = $providerId ? User::with('roles')->find($providerId) : null;
        if (! $provider) {
            return;
        }

        $consultationId = Consultation::where('consultation_request_id', $request->id)->value('id');

        $providerWallet = Wallet::where('user_id', $provider->id)->where('type', 'real')->lockForUpdate()->first()
            ?? Wallet::create(['user_id' => $provider->id, 'balance_minor' => 0, 'currency' => 'MDL']);

        if ($request->provider_amount_minor > 0) {
            $providerWallet->increment('balance_minor', $request->provider_amount_minor);

            WalletTransaction::create([
                'wallet_id' => $providerWallet->id,
                'user_id' => $provider->id,
                'amount_minor' => $request->provider_amount_minor,
                'currency' => $providerWallet->currency,
                'type' => $provider->hasRole('operator') ? 'operator_exam_income' : 'consultation_income',
                'status' => 'completed',
                'description' => $provider->hasRole('operator') ? 'Venit examinare operator' : 'Venit consultație medic',
                'metadata' => [
                    'consultation_request_id' => $request->id,
                    'consultation_id' => $consultationId,
                    'gross_amount_minor' => $request->amount_minor,
                    'platform_fee_minor' => $request->platform_fee_minor,
                    'promo_subsidy_minor' => (int) $request->promo_amount_minor,
                ],
                'rate_snapshot' => $request->pricing_snapshot['rate_snapshot'] ?? [],
                'consultation_request_id' => $request->id,
            ]);
        }

        if ($request->platform_fee_minor > 0) {
            WalletTransaction::create([
                'wallet_id' => $providerWallet->id,
                'user_id' => $provider->id,
                'amount_minor' => 0,
                'currency' => $providerWallet->currency,
                'type' => 'platform_fee',
                'status' => 'completed',
                'description' => 'Comision platformă',
                'metadata' => [
                    'consultation_request_id' => $request->id,
                    'consultation_id' => $consultationId,
                    'platform_fee_minor' => $request->platform_fee_minor,
                ],
                'rate_snapshot' => $request->pricing_snapshot['rate_snapshot'] ?? [],
                'consultation_request_id' => $request->id,
            ]);
        }

        $request->forceFill(['payment_status' => 'captured'])->save();

        $earning = $provider->hasRole('doctor')
            ? app(InstitutionLedger::class)->recordEarning($request->refresh(), $provider)
            : null;

        $provider->notify(new AppEventNotification(
            'Plată primită',
            $earning
                ? 'Consultația a fost închisă. Partea ta, '.$this->mdl($earning->doctor_amount_minor).', apare la instituție; instituția ți-o plătește.'
                : 'Consultația a fost închisă. '.$this->mdl((int) $request->provider_amount_minor).' au intrat în balanța ta.',
            $provider->hasRole('operator') ? '/operator' : '/doctor/stats',
            'success',
        ));
    }

    private function mdl(int $minor): string
    {
        return number_format($minor / 100, $minor % 100 === 0 ? 0 : 2, ',', ' ').' MDL';
    }

    /** Returnează integral banii rezervați. Idempotent. */
    public function refund(ConsultationRequest $request, string $reason): void
    {
        $request = ConsultationRequest::lockForUpdate()->findOrFail($request->id);
        if ($request->payment_status !== 'held' || $request->amount_minor <= 0) {
            return;
        }

        $ledger = app(WalletLedger::class);
        $patientWallet = $ledger->locked($request->patient_id, WalletLedger::REAL);
        $pointsWallet = $ledger->locked($request->patient_id, WalletLedger::POINTS);
        $realAmount = (int) (($request->real_amount_minor + $request->points_amount_minor + $request->promo_amount_minor) > 0 ? $request->real_amount_minor : $request->amount_minor);
        $pointsAmount = (int) $request->points_amount_minor;
        if ($realAmount > 0) {
            $ledger->move($patientWallet, $realAmount, 'service_refund', 'Returnare bani reali pentru consultație', ['reason' => $reason], $request->id);
        }
        if ($pointsAmount > 0) {
            $ledger->move($pointsWallet, $pointsAmount, 'points_service_refund', 'Returnare puncte pentru consultație', ['reason' => $reason], $request->id);
        }

        if ($request->promo_amount_minor > 0) {
            $promoWallet = $ledger->locked($request->patient_id, WalletLedger::PROMO);
            $ledger->move($promoWallet, $request->promo_amount_minor, 'promo_service_refund', 'Returnare bonus promoțional pentru consultație', ['reason' => $reason, 'promo_grant_id' => $request->promo_grant_id], $request->id);
        }

        $request->forceFill([
            'payment_status' => 'refunded',
            'refunded_at' => now(),
        ])->save();
    }

    /**
     * Rulează periodic (și la încărcarea listelor): închide consultațiile fără
     * recenzie ajunse la termen și returnează banii celor care nu au avut loc.
     *
     * @return array{closed: int, refunded: int}
     */
    public function settleDue(int $limit = 100): array
    {
        $closed = 0;
        $refunded = 0;

        ConsultationRequest::where('status', 'completed')
            ->whereNull('closed_at')
            ->whereNotNull('completed_at')
            ->where('completed_at', '<', now()->subDays($this->autoCloseDays()))
            ->limit($limit)
            ->get()
            ->each(function (ConsultationRequest $item) use (&$closed) {
                $this->close($item);
                $item->refresh()->patient?->notify(new AppEventNotification(
                    'Consultația s-a închis',
                    'Consultația s-a închis automat și plata a ajuns la medic. Poți lăsa în continuare o recenzie.',
                    '/patient/consultations?request='.$item->id,
                    'info',
                ));
                $closed++;
            });

        $hours = $this->noShowRefundHours();
        ConsultationRequest::where('status', 'accepted')
            ->where('payment_status', 'held')
            ->whereNull('objective_data_completed_at')
            ->lazyById(200)
            ->filter(fn (ConsultationRequest $item) => $this->refundDueAt($item)?->isPast())
            ->each(function (ConsultationRequest $item) use (&$refunded, $hours) {
                $reason = "Consultația nu a avut loc în {$hours} h de la ora programată.";
                $done = DB::transaction(function () use ($item, $reason) {
                    $locked = ConsultationRequest::lockForUpdate()->find($item->id);
                    if (! $locked || $locked->status !== 'accepted' || $locked->payment_status !== 'held' || $locked->objective_data_completed_at) {
                        return false;
                    }
                    $this->refund($locked, $reason);
                    $locked->refresh()->forceFill(['status' => 'expired', 'cancelled_at' => now(), 'cancellation_reason' => $reason])->save();
                    Conversation::where('consultation_request_id', $locked->id)->update(['status' => 'closed']);

                    return true;
                });
                if (! $done) {
                    return;
                }
                $item->patient?->notify(new AppEventNotification('Banii au revenit în portofel', $reason.' Suma rezervată a revenit în portofel.', '/patient/consultations?request='.$item->id, 'info'));
                $item->doctor?->notify(new AppEventNotification('Consultație anulată automat', $reason.' Banii au revenit pacientului.', '/doctor/consultations?request='.$item->id, 'warning'));
                $refunded++;
            });

        return ['closed' => $closed, 'refunded' => $refunded];
    }
}
