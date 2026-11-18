export interface PatientProfileEntitlements {
  free_profile?: { available: boolean; claimed_at: string | null; validity_years: number | null; permanent: boolean };
  can_add_patient?: boolean;
}
