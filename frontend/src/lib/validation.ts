export const VALIDATION_EVENT = 'telemed:validation';
export const VALIDATION_CLEAR_EVENT = 'telemed:validation-clear';
export type FieldErrors = Record<string, string[]>;
export type ValidationDetail = { errors: FieldErrors; scope: HTMLElement | null; path: string };

export const fieldLabels: Record<string, string> = {
  name: 'Nume complet', first_name: 'Prenume', last_name: 'Nume de familie', email: 'Email', password: 'Parolă', password_confirmation: 'Confirmă parola', current_password: 'Parola actuală', phone: 'Telefon',
  bio: 'Descriere / spectru de probleme', service_catalog: 'Servicii oferite (unul pe linie)', specialty_id: 'Specializare', license_number: 'Număr licență', experience_years: 'Experiență (ani)', consultation_price: 'Preț consultație (MDL)', video_price: 'Preț video (MDL)', video_duration_minutes: 'Durată video (min)', google_meet_account: 'Cont Gmail / Meet', clinic_name: 'Denumirea clinicii', clinic_details: 'Date clinică pentru antet',
  investigation_recommendations: 'Investigații recomandate', logo: 'Imagine sigla clinicii',
  symptoms: 'Acuzele pacientului', current_illness_history: 'Istoricul bolii actuale', diagnosis: 'Diagnostic', recommendations: 'Recomandări', treatment_plan: 'Plan de tratament', objective_exam: 'Examen obiectiv', prescription_notes: 'Indicații pentru rețetă', triage_notes: 'Observații pentru examinare', patient_profile_id: 'Pacient', doctor_id: 'Medic', operator_id: 'Operator', scheduled_at: 'Data și ora consultației', consultation_kind: 'Tip consultație',
  birth_date: 'Data nașterii', gender: 'Sex', country: 'Țară', region_id: 'Raion / municipiu', locality_id: 'Localitate', address: 'Adresă', emergency_contact: 'Contact de urgență', medical_summary: 'Istoricul vieții',
  amount: 'Sumă', title: 'Titlu', description: 'Descriere', body: 'Mesaj', content: 'Conținut', subject: 'Subiect', comment: 'Comentariu', reason: 'Motiv', notes: 'Observații', code: 'Cod de verificare', file: 'Fișier', signature: 'Imagine parafă și semnătură', starts_on: 'De la', ends_on: 'Până la', performed_at: 'Data efectuării',
};
export function fieldLabel(key: string) { return fieldLabels[key] || fieldLabels[key.split('.')[0]] || 'Câmp de completat'; }
export function normalizeField(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
export function controlLabel(control: HTMLElement): string {
  const labelledBy = control.getAttribute('aria-labelledby')?.split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ');
  const labels = (control as HTMLInputElement).labels;
  return control.getAttribute('aria-label') || labelledBy || (labels?.length ? Array.from(labels).map((label) => label.textContent).join(' ') : '') || control.closest('.space-y-2, label')?.querySelector('label')?.textContent || '';
}
export function findControl(scope: ParentNode, key: string): HTMLElement | null {
  const controls = Array.from(scope.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select, [role="combobox"], [role="checkbox"], [role="switch"]'));
  const direct = controls.find((control) => [control.getAttribute('name'), control.id, control.getAttribute('data-field')].includes(key));
  if (direct) return direct;
  const parts = key.split('.');
  const leaf = parts[parts.length - 1];
  const nested = controls.filter((control) => control.getAttribute('data-field') === leaf);
  if (nested.length) return nested[Number(parts.find((part) => /^\d+$/.test(part)) || 0)] || null;
  const label = normalizeField(fieldLabels[key] || '');
  return label ? controls.find((control) => normalizeField(controlLabel(control)) === label) || null : null;
}
export function nativeValidationMessage(control: HTMLInputElement): string {
  const label = controlLabel(control) || 'acest câmp';
  if (control.validity.valueMissing) return control.type === 'checkbox' ? `Bifează ${label} pentru a continua.` : `Completează ${label}.`;
  if (control.validity.typeMismatch) return control.type === 'email' ? 'Introdu o adresă de email validă.' : `Introdu o valoare validă pentru ${label}.`;
  if (control.validity.rangeUnderflow) return `${label} trebuie să fie cel puțin ${control.min}.`;
  if (control.validity.rangeOverflow) return `${label} poate fi cel mult ${control.max}.`;
  if (control.validity.tooShort) return `${label} trebuie să conțină cel puțin ${control.minLength} caractere.`;
  if (control.validity.tooLong) return `${label} poate conține cel mult ${control.maxLength} caractere.`;
  if (control.validity.stepMismatch || control.validity.badInput) return `Introdu un număr valid pentru ${label}.`;
  if (control.validity.patternMismatch) return `Verifică formatul pentru ${label}.`;
  return `Verifică valoarea din ${label}.`;
}
