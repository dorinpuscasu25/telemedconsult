/**
 * Ce au în comun ecranele medicului: serviciul ales de pacient, prețul și
 * etapa cererii, scrise la fel peste tot (Acasă, Consultații, Mesaje).
 */

export type ServiceType = 'video' | 'chat' | 'home';

export interface ServiceInvestigation {
  id: number;
  name: string | null;
  code?: string | null;
  price: number;
  requirement: 'required' | 'optional';
}

export interface DoctorServiceItem {
  id: string;
  name: string;
  type: ServiceType;
  price: number;
  duration: number;
  is_active: boolean;
  position?: number;
  investigations: ServiceInvestigation[];
}

export interface RequestService {
  id: number | null;
  name: string;
  type: ServiceType;
  price: number;
  duration: number | null;
  investigations: Array<{ id: number; name?: string | null; requirement: string; price: number }>;
}

export type Stage = 'new' | 'prop' | 'ask' | 'conf' | 'live' | 'done' | 'cancel' | 'expired';

export interface Proposal {
  slots: string[];
  note?: string | null;
  expires_at?: string | null;
  is_reschedule: boolean;
  patient_asked_at?: string | null;
  patient_note?: string | null;
}

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = { video: 'Video', chat: 'Chat', home: 'La domiciliu' };

/** „2 000 MDL” — separatorul de mii e un spațiu, ca în design. */
export function mdl(value: unknown): string {
  const numeric = Math.round(Number(value) || 0);
  return `${String(numeric).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} MDL`;
}

/** „Video · 30 min”, „Chat · răspuns în 24 h”, „La domiciliu · 60 min”. */
export function serviceMeta(service: { type: ServiceType; duration?: number | null }): string {
  if (service.type === 'chat') return service.duration ? `Chat · răspuns în ${service.duration} h` : 'Chat';
  return service.duration ? `${SERVICE_TYPE_LABEL[service.type]} · ${service.duration} min` : SERVICE_TYPE_LABEL[service.type];
}

/** „Include ECG, tensiune · opțional pulsoximetrie”. */
export function investigationsText(items: ServiceInvestigation[]): string {
  const short = (item: ServiceInvestigation) => (item.code && item.code.length <= 4 ? item.code.toUpperCase() : (item.name ?? '').toLocaleLowerCase('ro'));
  const required = items.filter((item) => item.requirement === 'required').map(short);
  const optional = items.filter((item) => item.requirement === 'optional').map(short);
  if (!required.length && !optional.length) return 'Fără investigații';
  return [required.length ? `Include ${required.join(', ')}` : '', optional.length ? `opțional ${optional.join(', ')}` : ''].filter(Boolean).join(' · ');
}

const DOW = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function hm(value: string | number | Date): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dayDiff(date: Date, now = new Date()): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(date) - start(now)) / 86400000);
}

/** „azi, 10:30”, „mâine, 10:30”, „joi 12 nov, 16:00”. */
export function whenLabel(value?: string | null, capitalize = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = dayDiff(date);
  const day = diff === 0 ? 'azi' : diff === 1 ? 'mâine' : diff === -1 ? 'ieri' : `${DOW[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const text = `${day}, ${hm(date)}`;
  return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** „acum 12 min”, „acum 1 h”, „ieri”. */
export function agoLabel(value?: string | null, now = Date.now()): string {
  if (!value) return '';
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'acum';
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ieri' : `acum ${days} zile`;
}

/** „1 h 48 min” până la termen; null dacă a trecut. */
export function leftLabel(value?: string | null, now = Date.now()): string | null {
  if (!value) return null;
  const minutes = Math.round((new Date(value).getTime() - now) / 60000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export const initialsOf = (name: string) => name.split(' ').filter(Boolean).map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';

export function ageLabel(age?: number | null): string | null {
  if (age === null || age === undefined) return null;
  return age === 1 ? '1 an' : `${age} ani`;
}

/** Cererile vechi, din API fără `stage`, primesc etapa din status. */
export function stageOf(request: { stage?: Stage | null; status: string; doctor_started_at?: string | null; proposal?: Proposal | null }): Stage {
  if (request.stage) return request.stage;
  switch (request.status) {
    case 'new': return 'new';
    case 'rescheduled': return request.proposal?.patient_asked_at ? 'ask' : 'prop';
    case 'accepted': return request.doctor_started_at ? 'live' : 'conf';
    case 'completed': return 'done';
    case 'expired': return 'expired';
    default: return 'cancel';
  }
}

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Cerere nouă',
  prop: 'Oră nouă propusă',
  ask: 'Pacientul cere alte ore',
  conf: 'Confirmată',
  live: 'În curs',
  done: 'Finalizată',
  cancel: 'Anulată',
  expired: 'Expirată'
};

/** Fundal și text pentru eticheta etapei. */
export const STAGE_TONE: Record<Stage, string> = {
  new: 'bg-amber-100 text-amber-800',
  prop: 'bg-blue-50 text-blue-700',
  ask: 'bg-amber-100 text-amber-800',
  conf: 'bg-blue-50 text-blue-700',
  live: 'bg-blue-50 text-blue-700',
  done: 'bg-slate-100 text-slate-700',
  cancel: 'bg-slate-100 text-slate-700',
  expired: 'bg-slate-100 text-slate-700'
};

/** Cererile care așteaptă răspunsul medicului. */
export const needsDoctor = (stage: Stage) => stage === 'new' || stage === 'ask';
