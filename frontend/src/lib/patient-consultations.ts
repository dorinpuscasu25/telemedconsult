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
  doctor_started_at?: string | null;
  created_at: string;
  amount?: number | null;
  doctor?: { name: string } | null;
  operator?: { name: string } | null;
  specialty?: string | null;
  patient_profile?: { name?: string | null } | null;
}

export function consultationTitle(request: PatientConsultation) {
  if (request.type === 'operator') return 'Examinare la domiciliu';
  return request.specialty || 'Consultație medicală';
}

/** Ce urmează, spus pe limba pacientului — pentru fiecare etapă. */
export function patientNextStep(request: PatientConsultation): string | null {
  switch (request.status) {
    case 'new':
      return request.type === 'operator'
        ? 'Așteptăm ca un operator să preia cererea.'
        : 'Medicul trebuie să confirme ora solicitată. Vei primi o notificare.';
    case 'rescheduled':
      return request.proposed_scheduled_at ? `Ți s-a propus o oră nouă: ${dateTime(request.proposed_scheduled_at)}.` : 'Ți s-a propus o oră nouă.';
    case 'accepted':
      if (request.doctor_started_at) return 'Consultația a început. Poți intra în apel sau în chat.';
      if (request.type !== 'operator' && request.scheduled_at) return `Confirmată pentru ${dateTime(request.scheduled_at)}. Medicul deschide consultația la ora stabilită.`;
      return 'Cererea a fost preluată.';
    case 'completed':
      return 'Concluzia medicului este disponibilă în documentul PDF.';
    default:
      return null;
  }
}

