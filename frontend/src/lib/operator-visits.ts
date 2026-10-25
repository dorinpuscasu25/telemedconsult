/** Tipuri și helper-e comune pentru vizitele operatorului (Acasă + Vizite). */

interface CostLine {
  id: number;
  name: string;
  requirement: string;
  price: number;
}

export interface RequestItem {
  id: string;
  type: string;
  status: string;
  consultation_kind?: string;
  symptoms?: string | null;
  triage_notes?: string | null;
  objective_data_completed_at?: string | null;
  patient?: { id: string; name: string; email: string } | null;
  patient_profile?: { name?: string; patient_code?: string | null; region?: string | null; locality?: string | null; address?: string | null } | null;
  doctor?: { id: string; name: string } | null;
  operator?: { id: string; name: string } | null;
  amount?: number;
  provider_amount?: number;
  payment_status?: string;
  pricing_snapshot?: { cost_breakdown?: { investigations?: CostLine[]; travel_fee?: number } } | null;
  acceptance_expires_at?: string | null;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
}

export type Stage = 'new' | 'active' | 'done';

/**
 * Etapele urmăresc munca OPERATORULUI, nu statusul global al consultației.
 * După ce examinarea e finalizată, cazul rămâne deschis la medic, dar
 * operatorul nu mai are ce face cu el.
 */
export const operatorStageOf = (request: RequestItem): Stage | null => {
  if (['cancelled', 'rejected', 'expired'].includes(request.status)) return null;
  if (['new', 'rescheduled'].includes(request.status)) return 'new';
  if (request.objective_data_completed_at || request.status === 'completed') return 'done';
  return request.status === 'accepted' ? 'active' : null;
};

export const patientNameOf = (request: RequestItem) => request.patient_profile?.name || request.patient?.name || 'Pacient';

export const addressOf = (request: RequestItem) => {
  const profile = request.patient_profile;
  if (!profile) return '';
  return [profile.address, profile.locality, profile.region].filter(Boolean).join(', ');
};

export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Moldova`)}`;

