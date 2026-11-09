/**
 * Pagina la care ajunge pacientul după înregistrare și asistentul de pornire,
 * de ex. programarea cu medicul ales în catalogul public (`/register?next=…`).
 * Se acceptă doar căi interne ale pacientului.
 */
const NEXT_KEY = 'onboarding_next';

export function safePatientPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/patient/') || value.includes('//') || value.includes('\\')) return null;
  return value;
}

export function rememberNext(value: string | null | undefined) {
  const path = safePatientPath(value);
  if (!path) return;
  try { sessionStorage.setItem(NEXT_KEY, path); } catch { /* fără stocare: pacientul ajunge la lista de medici */ }
}

export function peekNext(): string | null {
  try { return safePatientPath(sessionStorage.getItem(NEXT_KEY)); } catch { return null; }
}

export function clearNext() {
  try { sessionStorage.removeItem(NEXT_KEY); } catch { /* opțional */ }
}

/** Programarea după asistent: păstrează medicul ales și adaugă pacientul nou. */
export function bookingAfterOnboarding(patientProfileId: number | string): string {
  const next = peekNext();
  clearNext();
  const url = new URL(next && next.startsWith('/patient/doctors') ? next : '/patient/doctors', window.location.origin);
  url.searchParams.set('patient_profile', String(patientProfileId));
  url.searchParams.set('from', 'start');
  return `${url.pathname}${url.search}`;
}
