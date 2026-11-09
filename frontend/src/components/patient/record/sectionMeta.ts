import { MEDICAL_SECTIONS, type MedicalRecord, type MedicalSection, type RecordEntry } from '../../../lib/medical-record';

/** Starea unei secțiuni în lista fișei. */
export type SectionState = 'done' | 'nothing' | 'empty';

/** Întrebarea cu care începe o secțiune-listă și răspunsurile rapide propuse. */
export const LIST_PROMPTS: Record<string, { question: string; chips: string[]; noText: (name: string) => string }> = {
  drug_allergies: { question: 'Are alergii cunoscute?', chips: ['Penicilină', 'Aspirină', 'Ibuprofen', 'Polen', 'Praf', 'Păr de animale', 'Arahide', 'Lactoză'], noText: (name) => `Medicul vede că ${name} nu are alergii cunoscute.` },
  chronic_conditions: { question: 'Are boli cronice active?', chips: ['Hipertensiune arterială', 'Diabet zaharat', 'Astm bronșic', 'Hipotiroidism', 'Gastrită cronică'], noText: (name) => `Medicul vede că ${name} nu are boli cronice active.` },
  surgeries: { question: 'A avut intervenții chirurgicale?', chips: ['Apendicectomie', 'Amigdalectomie', 'Cezariană', 'Colecistectomie', 'Hernie'], noText: (name) => `Medicul vede că ${name} nu a avut intervenții chirurgicale.` },
  disease_history: { question: 'A avut boli grave, accidente sau traumatisme?', chips: ['Pneumonie', 'Fractură', 'Comoție cerebrală', 'Hepatită'], noText: (name) => `Medicul vede că ${name} nu a avut boli grave sau traumatisme.` },
  family_history: { question: 'Există boli cronice sau genetice în familie?', chips: ['Hipertensiune', 'Diabet', 'Infarct', 'AVC', 'Cancer', 'Astm'], noText: () => 'Medicul vede că nu sunt boli cunoscute în familie.' },
  vaccinations: { question: 'Ce vaccinuri a făcut?', chips: ['BCG', 'Hepatita B', 'DTP', 'Polio', 'ROR', 'Gripă', 'COVID-19'], noText: () => '' }
};

export const RELATIVES = ['Mamă', 'Tată', 'Bunică maternă', 'Bunic matern', 'Bunică paternă', 'Bunic patern', 'Frate / soră'];
export const MEDICATION_CHIPS = ['Ibuprofen', 'Paracetamol', 'Antihipertensive', 'Vitamine'];

export function sectionByKey(key: string): MedicalSection | undefined {
  return MEDICAL_SECTIONS.find((section) => section.key === key);
}

export function nothingFlags(record: MedicalRecord): Record<string, boolean> {
  const value = (record as Record<string, unknown>).nothing_to_report;
  return value && typeof value === 'object' ? (value as Record<string, boolean>) : {};
}

export function listEntries(record: MedicalRecord, key: string): RecordEntry[] {
  const value = record[key];
  if (key === 'vaccinations') return ((value as { items?: RecordEntry[] } | undefined)?.items ?? []);
  return Array.isArray(value) ? value : [];
}

export function objectValues(record: MedicalRecord, key: string): RecordEntry {
  const value = record[key];
  return value && !Array.isArray(value) && typeof value === 'object' ? (value as RecordEntry) : {};
}

export function sectionState(record: MedicalRecord, key: string): SectionState {
  if (nothingFlags(record)[key]) return 'nothing';
  const section = sectionByKey(key);
  if (section?.repeated) {
    const vaccination = record.vaccinations as { refusal?: string | null } | undefined;
    if (key === 'vaccinations' && vaccination?.refusal && vaccination.refusal !== 'unknown') return 'done';
    return listEntries(record, key).length > 0 ? 'done' : 'empty';
  }
  return Object.values(objectValues(record, key)).some((value) => value !== null && value !== '' && value !== undefined) ? 'done' : 'empty';
}

/** O frază scurtă sub numele secțiunii: ce conține sau ce lipsește. */
export function sectionSummary(record: MedicalRecord, key: string): string {
  const state = sectionState(record, key);
  if (state === 'nothing') return 'Nimic de raportat';
  if (state === 'empty') return 'Necompletată';
  const section = sectionByKey(key);
  if (section?.repeated) {
    const names = listEntries(record, key).map((entry) => String(entry.name ?? '')).filter(Boolean);
    return names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : 'Completată';
  }
  const values = objectValues(record, key);
  const filled = section?.fields.filter((field) => values[field.key] !== null && values[field.key] !== '' && values[field.key] !== undefined).length ?? 0;
  return `${filled} ${filled === 1 ? 'câmp completat' : 'câmpuri completate'}`;
}

export function countDone(record: MedicalRecord): number {
  return MEDICAL_SECTIONS.filter((section) => sectionState(record, section.key) !== 'empty').length;
}

export function ageInYears(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1;
  return years;
}
