export interface PatientProfileEntitlements {
  free_profile?: { available: boolean; claimed_at: string | null; validity_years: number };
  can_add_patient?: boolean;
}
