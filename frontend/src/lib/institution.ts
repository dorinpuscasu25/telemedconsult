/** Tipurile răspunsurilor din panoul instituției medicale. */

export interface Institution {
  id: number;
  name: string;
  legal_name?: string | null;
  fiscal_code?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  doctor_share_percent: number;
  status: string;
}

export interface InstitutionSummary {
  earned_total: number;
  institution_total: number;
  doctors_total: number;
  owed_to_doctors: number;
  platform_balance: number;
  platform_pending: number;
}

export interface InstitutionDoctor {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  specialty?: string | null;
  license_number?: string | null;
  doctor_share_percent: number | null;
  effective_share_percent: number;
  joined_at?: string | null;
  is_available: boolean;
  consultations: number;
  doctor_total: number;
  institution_total: number;
  balance: number;
}

export interface InstitutionInvitation {
  id: number;
  email: string;
  name?: string | null;
  specialty?: string | null;
  doctor_share_percent: number | null;
  expires_at: string;
  expired: boolean;
  created_at: string;
}

export interface InstitutionWithdrawal {
  id: number;
  doctor?: string | null;
  doctor_id: number;
  amount: number;
  approved_amount: number | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  note?: string | null;
  payout_reference?: string | null;
  date: string;
  processed_at?: string | null;
  processed_by?: string | null;
  doctor_balance?: number;
}

/** Cum se împarte o consultație de 100 MDL, ca exemplu concret pentru manager. */
export function splitExample(sharePercent: number, net = 100) {
  const doctor = Math.round(net * sharePercent) / 100;
  return { doctor, institution: Math.round((net - doctor) * 100) / 100 };
}
