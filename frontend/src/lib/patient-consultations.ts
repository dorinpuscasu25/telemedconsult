import { dateTime } from './format';

/** Tipul unei consultații văzute de pacient și textele derivate din ea. */

export interface PatientConsultation {
  id: string;
  type: 'doctor' | 'operator' | string;
  status: string;
  consultation_kind?: string | null;
  symptoms?: string | null;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  proposal?: import('./doctor').Proposal | null;
  service?: import('./doctor').RequestService;
  doctor_started_at?: string | null;
  created_at: string;
  amount?: number | null;
  doctor?: { name: string } | null;
  operator?: { name: string } | null;
  specialty?: string | null;
  patient_profile?: { name?: string | null } | null;
  payment_status?: string | null;
  closed_at?: string | null;
  /** Fără recenzie, consultația se închide și se plătește singură la această dată. */
  auto_close_at?: string | null;
  /** Confirmată fără concluzie: după această oră banii revin automat. */
  refund_due_at?: string | null;
}

export function consultationTitle(request: PatientConsultation) {
  if (request.type === 'operator') return 'Examinare la domiciliu';
  return request.specialty || 'Consultație medicală';
}

/** Ce urmează, spus pe limba pacientului — pentru fiecare etapă. */
/**
 * Cât timp o consultație începută poate fi un apel real. Una începută mai demult
 * și nefinalizată (de ex. cu examinare, în așteptarea rezultatelor) e „în
 * desfășurare”, dar nimeni nu mai așteaptă pacientul în apel.
 */
export const LIVE_CALL_WINDOW_MS = 2 * 60 * 60 * 1000;

export function isRecentlyStarted(request: Pick<PatientConsultation, 'doctor_started_at'>, now = new Date()): boolean {
  if (!request.doctor_started_at) return false;
  return now.getTime() - new Date(request.doctor_started_at).getTime() < LIVE_CALL_WINDOW_MS;
}

export function patientNextStep(request: PatientConsultation): string | null {
  switch (request.status) {
    case 'new':
      return request.type === 'operator'
        ? 'Așteptăm ca un operator să preia cererea.'
        : 'Medicul trebuie să confirme ora solicitată. Vei primi o notificare.';
    case 'rescheduled':
      return request.proposed_scheduled_at ? `Ți s-a propus o oră nouă: ${dateTime(request.proposed_scheduled_at)}.` : 'Ți s-a propus o oră nouă.';
    case 'accepted':
      if (request.doctor_started_at) {
        return isRecentlyStarted(request)
          ? 'Consultația a început. Poți intra în apel sau în chat.'
          : 'Consultația e în desfășurare. Așteptăm concluzia medicului; îți poate scrie în chat.';
      }
      if (request.type !== 'operator' && request.scheduled_at) return `Confirmată pentru ${dateTime(request.scheduled_at)}. Medicul deschide consultația la ora stabilită.${request.refund_due_at ? ` Dacă nu are loc până la ${dateTime(request.refund_due_at)}, banii revin automat în portofel.` : ''}`;
      return 'Cererea a fost preluată.';
    case 'completed':
      return paymentNote(request) ?? 'Concluzia medicului este disponibilă în documentul PDF.';
    default:
      return null;
  }
}


/**
 * Banii stau rezervați până închizi consultația cu o recenzie; atunci ajung la
 * medic. Fără recenzie, consultația se închide singură la `auto_close_at`.
 */
export function paymentNote(request: Pick<PatientConsultation, 'status' | 'payment_status' | 'closed_at' | 'auto_close_at' | 'amount'>): string | null {
  if (request.status !== 'completed') return null;
  const amount = request.amount ? `${Math.round(Number(request.amount))} MDL` : 'plata';
  if (request.payment_status === 'held' && !request.closed_at) {
    return `Concluzia e în documentul PDF. Lasă o recenzie ca să închizi consultația: abia atunci ${request.amount ? `cei ${amount}` : 'banii'} ajung la medic.${request.auto_close_at ? ` Fără recenzie, se închide automat pe ${dateTime(request.auto_close_at)}.` : ''}`;
  }
  if (request.payment_status === 'captured') return `Consultația e închisă și ${amount} au ajuns la medic. Concluzia rămâne în documentul PDF.`;
  return null;
}
