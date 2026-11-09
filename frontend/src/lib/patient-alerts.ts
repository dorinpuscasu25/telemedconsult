import { sectionState } from '../components/patient/record/sectionMeta';
import { MEDICAL_SECTIONS, type MedicalRecord } from './medical-record';
import type { PatientConsultation } from './patient-consultations';

/**
 * Alertele de pe Acasă, într-o singură listă ordonată pe trei niveluri:
 * 1 = acum, cu termen; 2 = blochează următoarea programare; 3 = informativ (se poate închide).
 * Prima ajunge în cardul „Acum”, următoarele trei în „De făcut”, restul sub „Vezi toate”.
 */
export type AlertLevel = 1 | 2 | 3;
export type AlertKind = 'setup' | 'live' | 'today' | 'proposal' | 'review' | 'waiting' | 'upcoming' | 'record';

export interface HomeAlert {
  id: string;
  kind: AlertKind;
  level: AlertLevel;
  title: string;
  sub: string;
  chip?: string;
  dismissable?: boolean;
  request?: PatientConsultation;
  /** Pentru evaluare: consultația de evaluat. */
  reviewId?: string;
  /** Pentru fișa incompletă: profilul și secțiunea sugerată. */
  profileId?: number;
  sectionKey?: string;
}

export interface HomeProfile {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  can_request_consultation?: boolean;
  medical_record?: Record<string, unknown> | null;
}

export interface ReviewableRequest {
  id: string;
  doctor_name?: string | null;
  operator_name?: string | null;
  completed_at?: string | null;
}

const ACTIVE = ['new', 'accepted', 'rescheduled'];
const SECTION_TITLES: Record<string, string> = Object.fromEntries(MEDICAL_SECTIONS.map((section) => [section.key, section.title]));
export const RECORD_SECTION_KEYS = MEDICAL_SECTIONS.map((section) => section.key);

export function recordProgress(profile: HomeProfile): { done: number; total: number; nextKey?: string } {
  const record = (profile.medical_record ?? {}) as MedicalRecord;
  const missing = RECORD_SECTION_KEYS.filter((key) => sectionState(record, key) === 'empty');
  return { done: RECORD_SECTION_KEYS.length - missing.length, total: RECORD_SECTION_KEYS.length, nextKey: missing[0] };
}

export function sectionTitle(key?: string): string {
  return (key && SECTION_TITLES[key]) || 'o secțiune';
}

function sameLocalDay(a: Date, b: Date): boolean {
  const format = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  return format(a) === format(b);
}

function providerName(request: PatientConsultation): string {
  return request.doctor?.name ?? request.operator?.name ?? (request.type === 'operator' ? 'Operatorul' : 'Medicul');
}

function forWhom(request: PatientConsultation): string {
  return request.patient_profile?.name ? ` · pentru ${request.patient_profile.name}` : '';
}

export function buildHomeAlerts({ requests, reviewable, profiles, needsPackage, now = new Date() }: {
  requests: PatientConsultation[];
  reviewable: ReviewableRequest[];
  profiles: HomeProfile[];
  needsPackage: boolean;
  now?: Date;
}): HomeAlert[] {
  const alerts: HomeAlert[] = [];
  const active = requests.filter((request) => ACTIVE.includes(request.status));
  const requestable = profiles.filter((profile) => profile.can_request_consultation);

  if (requestable.length === 0 && profiles.length === 0) {
    alerts.push(needsPackage
      ? { id: 'setup', kind: 'setup', level: 1, chip: 'Pasul 1 din 3', title: 'Alege pachetul', sub: 'Un profil este o persoană din familie, cu fișa ei medicală, activ un an. Apoi adaugi pacientul și alegi medicul.' }
      : { id: 'setup', kind: 'setup', level: 1, chip: 'Pasul 2 din 3', title: 'Adaugă pacientul', sub: 'Pachetul e activ. Spune-ne pentru cine e prima consultație, apoi alegi medicul.' });
  }

  for (const request of active) {
    const scheduled = request.scheduled_at ? new Date(request.scheduled_at) : null;
    if (request.status === 'accepted' && request.doctor_started_at) {
      alerts.push({ id: `live-${request.id}`, kind: 'live', level: 1, chip: 'Apel în curs', title: `${providerName(request)} te așteaptă`, sub: `Consultație video${forWhom(request)}`, request });
    } else if (request.status === 'rescheduled') {
      alerts.push({ id: `proposal-${request.id}`, kind: 'proposal', level: 1, chip: 'Ai de răspuns', title: `${providerName(request)} propune altă oră`, sub: `${request.proposed_scheduled_at ? formatWhen(request.proposed_scheduled_at) : 'Oră nouă'}${forWhom(request)}`, request });
    } else if (request.status === 'accepted' && scheduled && sameLocalDay(scheduled, now) && scheduled.getTime() > now.getTime() - 60 * 60 * 1000) {
      alerts.push({ id: `today-${request.id}`, kind: 'today', level: 1, chip: `Azi, ${formatTime(scheduled)}`, title: `Consultație cu ${providerName(request)}`, sub: `${request.consultation_kind === 'with_exam' ? 'Cu examinare' : 'Video'}${forWhom(request)}. Medicul te sună; poate întârzia 5–15 min.`, request });
    }
  }

  for (const review of reviewable) {
    alerts.push({ id: `review-${review.id}`, kind: 'review', level: 2, chip: 'Ai de evaluat', title: `Cum a fost consultația${review.doctor_name ? ` cu ${review.doctor_name}` : ''}?`, sub: 'Evaluarea e necesară înainte de următoarea programare.', reviewId: review.id });
  }

  for (const request of active) {
    if (request.status === 'new') {
      alerts.push({ id: `waiting-${request.id}`, kind: 'waiting', level: 3, chip: 'În așteptare', title: `Așteptăm confirmarea: ${providerName(request)}`, sub: `${request.scheduled_at ? formatWhen(request.scheduled_at) : 'Cât mai curând'}${forWhom(request)}`, request });
    } else if (request.status === 'accepted' && !request.doctor_started_at && !alerts.some((alert) => alert.request?.id === request.id)) {
      alerts.push({ id: `upcoming-${request.id}`, kind: 'upcoming', level: 3, chip: 'Confirmată', title: request.scheduled_at ? formatWhen(request.scheduled_at) : 'Consultație confirmată', sub: `${providerName(request)} · ${request.consultation_kind === 'with_exam' ? 'Cu examinare' : 'Video'}${forWhom(request)}`, request });
    }
  }

  for (const profile of requestable) {
    const progress = recordProgress(profile);
    if (progress.nextKey) {
      alerts.push({ id: `record-${profile.id}-${progress.nextKey}`, kind: 'record', level: 3, dismissable: true, title: `Fișa lui ${profile.first_name ?? 'pacientului'}: lipsește „${sectionTitle(progress.nextKey)}”`, sub: `${progress.done} din ${progress.total} secțiuni · un minut`, profileId: profile.id, sectionKey: progress.nextKey });
    }
  }

  return alerts.sort((a, b) => a.level - b.level);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau' });
}

export function formatWhen(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Chisinau' })} · ${formatTime(date)}`;
}

export function countdown(target: Date, now: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'acum';
  if (minutes < 60) return `peste ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `peste ${hours} h ${minutes % 60} min`;
}

const DISMISSED_KEY = 'home_dismissed_alerts';

export function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function writeDismissed(ids: string[]) {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-100))); } catch { /* fără stocare: alerta revine la reîncărcare */ }
}
