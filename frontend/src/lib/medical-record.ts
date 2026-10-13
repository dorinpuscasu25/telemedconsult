export type RecordEntry = Record<string, string | number | null>;
export type MedicalRecord = Record<string, RecordEntry | RecordEntry[] | { refusal?: string | null; items?: RecordEntry[] }>;
export type MedicalField = {
  key: string; label: string; type?: 'text' | 'textarea' | 'date' | 'number' | 'select';
  options?: Array<[string, string]>; min?: number; max?: number; unit?: string; required?: boolean; placeholder?: string;
};
export type MedicalSection = { key: string; title: string; description: string; repeated?: boolean; fields: MedicalField[] };
const name = (label: string): MedicalField => ({ key: 'name', label, required: true });
const date: MedicalField = { key: 'date', label: 'Data (dacă o cunoști)', type: 'date' };
const period: MedicalField = { key: 'period', label: 'Data aproximativă sau vârsta', placeholder: 'De exemplu: la 4 ani, decembrie 2020' };
const notes: MedicalField = { key: 'notes', label: 'Alte detalii', type: 'textarea' };
export const MEDICAL_SECTIONS: MedicalSection[] = [
  { key: 'birth', title: 'Date despre naștere', description: 'Completează doar informațiile cunoscute. Părintele poate descrie dezvoltarea copilului.', fields: [
    { key: 'birth_method', label: 'Modul nașterii', type: 'select', options: [['natural', 'Natural'], ['cesarean', 'Operație cezariană'], ['forceps', 'Natural cu forceps'], ['vacuum', 'Natural cu vacuum extracție']] },
    { key: 'gestational_weeks', label: 'Termenul nașterii', type: 'select', options: Array.from({ length: 19 }, (_, i) => [String(i + 24), `${i + 24} săptămâni`]) },
    { key: 'birth_weight', label: 'Masa la naștere', type: 'number', unit: 'g', min: 1, max: 10000 },
    { key: 'head_circumference', label: 'Circumferința craniană la naștere', type: 'number', unit: 'cm', min: 1, max: 100 },
    { key: 'apgar', label: 'Scor APGAR', type: 'select', options: Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)]) },
    { key: 'feeding', label: 'Alimentație', type: 'select', options: [['natural', 'Naturală'], ['artificial', 'Artificială'], ['mixed', 'Mixtă']] },
    { key: 'blood_group', label: 'Grupa sangvină ABO', type: 'select', options: ['A', 'B', 'AB', 'O'].map((v) => [v, v]) },
    { key: 'rh', label: 'Rh', type: 'select', options: [['positive', 'Pozitiv'], ['negative', 'Negativ']] },
    { key: 'congenital_conditions', label: 'Boli congenitale depistate la naștere', type: 'textarea' },
    { key: 'other_details', label: 'Alte date importante', type: 'textarea' },
    { key: 'development_age', label: 'Vârsta la care se referă descrierea dezvoltării', placeholder: 'De exemplu: 6 luni, 2 ani' },
    { key: 'development', label: 'Dezvoltare neuropsihică și motorie', type: 'textarea', placeholder: 'Descrie ce știe să facă copilul, cum se mișcă și comunică.' }
  ] },
  { key: 'vaccinations', title: 'Vaccinări', description: 'Adaugă vaccinurile din carnet. Dacă nu cunoști data, o poți lăsa necompletată.', repeated: true, fields: [name('Vaccin'), date, { key: 'dose', label: 'Doză / rapel' }, { key: 'reaction', label: 'Reacții după vaccinare', type: 'textarea' }, notes] },
  { key: 'surgeries', title: 'Intervenții chirurgicale', description: 'Include și intervențiile stomatologice.', repeated: true, fields: [name('Denumirea operației'), date, period, { key: 'complications', label: 'Complicații (dacă au existat)', type: 'textarea' }] },
  { key: 'drug_allergies', title: 'Alergii la medicamente', description: 'O înregistrare pentru fiecare medicament la care ai avut o reacție alergică.', repeated: true, fields: [name('Medicament'), period, { key: 'manifestation', label: 'Cum s-a manifestat alergia', type: 'textarea' }, { key: 'resolution', label: 'Cum a fost rezolvată', type: 'textarea' }] },
  { key: 'food_allergies', title: 'Alergii la alimente', description: 'Descrie alimentul, reacția și ce ai făcut atunci.', repeated: true, fields: [name('Aliment'), period, { key: 'manifestation', label: 'Cum s-a manifestat alergia', type: 'textarea' }, { key: 'resolution', label: 'Cum a fost rezolvată', type: 'textarea' }] },
  { key: 'chronic_conditions', title: 'Boli cronice active', description: 'Adaugă diagnosticele stabilite de un specialist.', repeated: true, fields: [name('Diagnostic'), date, { key: 'specialist', label: 'Specialistul care a stabilit diagnosticul' }, notes] },
  { key: 'family_history', title: 'Antecedente familiale', description: 'Precizează rudenia și linia maternă sau paternă, dacă este relevant.', repeated: true, fields: [{ key: 'relationship', label: 'Gradul de rudenie', required: true, placeholder: 'De exemplu: bunica după tata' }, name('Boală cronică / genetică'), notes] },
  { key: 'lifestyle', title: 'Stil de viață și factori de risc', description: 'Descrie activitatea, expunerile și obiceiurile care pot fi relevante pentru medic.', fields: [
    { key: 'activity', label: 'Nivel de activitate', type: 'select', options: [['sedentary', 'Sedentar'], ['active', 'Activ'], ['regular_sport', 'Sport regulat']] },
    { key: 'workplace', label: 'Activitate profesională', type: 'textarea', placeholder: 'De exemplu: muncă pe scaun, activitate fizică' },
    { key: 'exposures', label: 'Expunere la substanțe nocive / toxice', type: 'textarea' },
    { key: 'smoking', label: 'Fumat', placeholder: 'De exemplu: nu fumez / am renunțat / cantitate și durată' },
    { key: 'alcohol', label: 'Alcool', placeholder: 'Frecvență și cantitate, dacă este cazul' },
    { key: 'long_term_medication', label: 'Medicamente administrate îndelungat', type: 'textarea' }, notes
  ] },
  { key: 'disease_history', title: 'Cronologia bolilor suportate', description: 'Adaugă bolile și traumatismele pe care ți le amintești sau le ai în documente.', repeated: true, fields: [name('Boală / traumatism'), date, period, notes] }
];
export function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function patientAge(birth?: string | null, today = todayDate()): string {
  if (!birth) return 'Vârstă necompletată';
  const [year, month, day] = birth.slice(0, 10).split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  if (!year || !month || !day || birth.slice(0, 10) > today) return 'Data nașterii este invalidă';
  const months = (currentYear - year) * 12 + currentMonth - month - (currentDay < day ? 1 : 0);
  if (months < 12) return `${Math.max(0, months)} ${months === 1 ? 'lună' : 'luni'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'an' : 'ani'}`;
}
export function medicalFieldValue(field: MedicalField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value);
  return `${field.options?.find(([key]) => key === raw)?.[1] ?? raw}${field.unit ? ` ${field.unit}` : ''}`;
}
