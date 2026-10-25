/**
 * Sursa unică pentru denumirea și culoarea statusurilor unei consultații.
 *
 * Înainte, fiecare pagină își scria propriile etichete, așa că același status
 * apărea ca „Confirmată”, „Activ” sau „În desfășurare” în funcție de ecran.
 * Eticheta depinde de cine privește: pacientul așteaptă confirmarea, medicul
 * are o cerere nouă — dar culoarea și sensul rămân aceleași.
 */

export type Perspective = 'patient' | 'doctor' | 'operator';

export type StatusTone = 'warning' | 'info' | 'success' | 'neutral' | 'danger' | 'attention';

export type ConsultationStatusKey =
  | 'new'
  | 'accepted'
  | 'in_progress'
  | 'rescheduled'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'expired'
  | 'no_operator_available';

const LABELS: Record<ConsultationStatusKey, Record<Perspective, string>> = {
  new: { patient: 'Așteaptă confirmarea', doctor: 'Cerere nouă', operator: 'Cerere nouă' },
  accepted: { patient: 'Confirmată', doctor: 'Confirmată', operator: 'Preluată' },
  in_progress: { patient: 'În desfășurare', doctor: 'În desfășurare', operator: 'În desfășurare' },
  rescheduled: { patient: 'Oră nouă propusă', doctor: 'Așteaptă răspunsul pacientului', operator: 'Așteaptă răspunsul pacientului' },
  completed: { patient: 'Finalizată', doctor: 'Finalizată', operator: 'Finalizată' },
  cancelled: { patient: 'Anulată', doctor: 'Anulată', operator: 'Anulată' },
  rejected: { patient: 'Refuzată', doctor: 'Respinsă', operator: 'Respinsă' },
  expired: { patient: 'Expirată', doctor: 'Expirată', operator: 'Expirată' },
  no_operator_available: { patient: 'Fără operator disponibil', doctor: 'Fără operator disponibil', operator: 'Fără operator disponibil' }
};

const TONES: Record<ConsultationStatusKey, StatusTone> = {
  new: 'warning',
  accepted: 'info',
  in_progress: 'success',
  rescheduled: 'attention',
  completed: 'neutral',
  cancelled: 'neutral',
  rejected: 'danger',
  expired: 'neutral',
  no_operator_available: 'danger'
};

export const CLOSED_STATUSES = ['cancelled', 'rejected', 'expired', 'no_operator_available'];

/** Statusul afișat: o consultație acceptată și deschisă de medic e „în desfășurare”. */
export function consultationStatusKey(request: { status: string; doctor_started_at?: string | null }): ConsultationStatusKey {
  if (request.status === 'accepted' && request.doctor_started_at) return 'in_progress';
  return (request.status in LABELS ? request.status : 'cancelled') as ConsultationStatusKey;
}

export function consultationStatusLabel(status: string, perspective: Perspective): string {
  return LABELS[status as ConsultationStatusKey]?.[perspective] ?? status;
}

export function consultationStatusTone(status: string): StatusTone {
  return TONES[status as ConsultationStatusKey] ?? 'neutral';
}

export const TONE_CLASSES: Record<StatusTone, { badge: string; dot: string; soft: string; text: string }> = {
  warning: { badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-700' },
  attention: { badge: 'border-orange-200 bg-orange-50 text-orange-800', dot: 'bg-orange-500', soft: 'bg-orange-50', text: 'text-orange-700' },
  info: { badge: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-500', soft: 'bg-blue-50', text: 'text-blue-700' },
  success: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700' },
  neutral: { badge: 'border-slate-200 bg-slate-100 text-slate-700', dot: 'bg-slate-400', soft: 'bg-slate-50', text: 'text-slate-600' },
  danger: { badge: 'border-red-200 bg-red-50 text-red-700', dot: 'bg-red-500', soft: 'bg-red-50', text: 'text-red-700' }
};

const PAYMENT_LABELS: Record<string, string> = {
  held: 'Sumă rezervată',
  captured: 'Achitată',
  paid: 'Achitată',
  refunded: 'Restituită',
  none: 'Fără cost'
};

export function paymentStatusLabel(status?: string | null): string {
  if (!status) return '';
  return PAYMENT_LABELS[status] ?? status;
}

export const CONSULTATION_KIND_LABELS: Record<string, string> = {
  with_exam: 'Cu examinare la domiciliu',
  video: 'Consultație video'
};
