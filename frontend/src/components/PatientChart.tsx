import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ChevronLeft, ChevronRight, ClipboardList, Cpu, Download, Images, PenLine, Stethoscope, User, X } from 'lucide-react';
import { dateTime } from '../lib/format';

export interface ObjectiveValue {
  key: string;
  label: string;
  unit?: string | null;
  value: unknown;
  known?: boolean;
}

export interface ObjectiveDataEntry {
  id: string;
  source?: string | null;
  from_device?: boolean;
  operator?: string | null;
  completed_at?: string | null;
  payload: Record<string, unknown>;
  /** Aceleași măsurători, etichetate de server din vocabularul canonic. */
  values?: ObjectiveValue[];
}

export interface ExamMediaItem {
  id: string;
  exam_type?: string | null;
  kind: 'image' | 'audio' | 'video';
  content_type?: string | null;
  sequence?: number | null;
  size_bytes?: number | null;
  url: string;
}

export interface PatientProfileSummary {
  id: string;
  name: string;
  patient_code?: string | null;
  birth_date?: string | null;
  age?: number | null;
  gender?: string | null;
  country?: string | null;
  region?: string | null;
  locality?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  medical_summary?: string | null;
  life_history?: Array<{ category: string; note: string; added_at?: string }>;
}

export interface InvestigationSummary {
  name?: string;
  requirement?: string;
  price?: number;
}

interface PatientChartProps {
  profile?: PatientProfileSummary | null;
  symptoms?: string | null;
  triageNotes?: string | null;
  objectiveData?: ObjectiveDataEntry[];
  examMedia?: ExamMediaItem[];
  investigations?: InvestigationSummary[];
  anamnesisCompletedAt?: string | null;
  objectiveDataCompletedAt?: string | null;
}

/**
 * Denumirile examinărilor așa cum le trimite aparatul lor. Cele necunoscute se
 * umanizează din cheie, deci o examinare nouă nu rămâne fără titlu.
 */
const EXAM_LABELS: Record<string, string> = {
  SKIN_EXAM: 'Tegumente (dermatoscop)',
  THROAT_EXAM: 'Gât',
  RIGHT_EAR_EXAM: 'Ureche dreaptă (otoscop)',
  LEFT_EAR_EXAM: 'Ureche stângă (otoscop)',
  EAR_EXAM: 'Otoscopie',
  HEART_AUSCULTATION_EXAM: 'Auscultație cardiacă',
  LUNGS_AUSCULTATION_EXAM: 'Auscultație pulmonară',
  ABDOMINAL_AUSCULTATION_EXAM: 'Auscultație abdominală',
  COUGH_EXAM: 'Tuse',
  HEART_RATE_WAV_EXAM: 'Puls (undă)',
  TEMPERATURE_EXAM: 'Temperatură'
};

function examLabel(type?: string | null) {
  if (!type) return 'Examinare';
  return EXAM_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^./, (char) => char.toUpperCase());
}

const GENDER_LABELS: Record<string, string> = { M: 'Masculin', F: 'Feminin', Altul: 'Altul' };

/** Etichete lizibile pentru măsurătorile uzuale; restul se umanizează din cheie. */
const MEASUREMENT_LABELS: Record<string, string> = {
  blood_pressure: 'Tensiune arterială',
  systolic: 'Sistolică',
  diastolic: 'Diastolică',
  spo2: 'SpO₂',
  heart_rate: 'Puls',
  temperature: 'Temperatură',
  respiratory_rate: 'Frecvență respiratorie',
  weight: 'Greutate',
  height: 'Înălțime',
  glucose: 'Glicemie',
  ecg: 'EKG',
  notes: 'Notițe'
};

function humanize(key: string) {
  return MEASUREMENT_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase());
}

/**
 * Serverul trimite măsurătorile deja etichetate, cu unitatea canonică. Lista
 * brută rămâne ca rezervă pentru fișele salvate înainte de asta.
 */
function measurementsOf(entry: ObjectiveDataEntry): ObjectiveValue[] {
  if (entry.values && entry.values.length > 0) return entry.values;

  return Object.entries(entry.payload ?? {})
    .filter(([key]) => key !== 'recorded_at')
    .map(([key, value]) => ({ key, label: humanize(key), unit: null, value }));
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Section({
  title,
  icon: Icon,
  children,
  meta
}: {
  title: string;
  icon: typeof User;
  children: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="size-4 text-slate-400" />
          {title}
        </h3>
        {meta}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** Trece la imaginea următoare/anterioară, în buclă. */
function step(viewer: { items: ExamMediaItem[]; index: number }, delta: number) {
  const count = viewer.items.length;

  return { ...viewer, index: (viewer.index + delta + count) % count };
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

/**
 * Fișa clinică pe care medicul o are în față când formulează concluzia:
 * cine e pacientul, ce a declarat, și ce a măsurat operatorul cu aparatul.
 */
export function PatientChart({
  profile,
  symptoms,
  triageNotes,
  objectiveData = [],
  examMedia = [],
  investigations = [],
  anamnesisCompletedAt,
  objectiveDataCompletedAt
}: PatientChartProps) {
  // Otoscopia dă zeci de cadre aproape identice: medicul trebuie să le poată
  // mări și parcurge una după alta, nu să deschidă câte un tab pentru fiecare.
  const [viewer, setViewer] = useState<{ items: ExamMediaItem[]; index: number } | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewer(null);
      if (event.key === 'ArrowRight') setViewer((current) => (current ? step(current, 1) : current));
      if (event.key === 'ArrowLeft') setViewer((current) => (current ? step(current, -1) : current));
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewer]);

  // Fișierele vin deja ordonate de server; aici doar le grupăm pe examinare, ca
  // medicul să vadă „ureche dreaptă: 21 imagini”, nu o grămadă nediferențiată.
  const mediaByExam = examMedia.reduce<Record<string, ExamMediaItem[]>>((groups, item) => {
    const key = item.exam_type ?? 'ALTELE';
    (groups[key] ??= []).push(item);
    return groups;
  }, {});
  const identity = [
    profile?.age != null ? `${profile.age} ani` : null,
    profile?.gender ? GENDER_LABELS[profile.gender] ?? profile.gender : null,
    profile?.patient_code ? `Cod pacient ${profile.patient_code}` : null
  ].filter(Boolean);

  const location = [profile?.locality, profile?.region, profile?.country].filter(Boolean).join(', ');

  return (
    <div className="space-y-3">
      <Section title="Pacient" icon={User}>
        {profile ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-slate-900">{profile.name}</p>
            {identity.length > 0 && <p className="text-slate-600">{identity.join(' • ')}</p>}
            {(location || profile.address) && (
              <p className="text-slate-600">
                {[profile.address, location].filter(Boolean).join(' — ')}
              </p>
            )}
            {profile.emergency_contact && (
              <p className="text-slate-600">Contact de urgență: {profile.emergency_contact}</p>
            )}
            {profile.medical_summary && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                <p className="text-xs font-semibold uppercase tracking-wide">Antecedente</p>
                <p className="mt-0.5 whitespace-pre-wrap">{profile.medical_summary}</p>
              </div>
            )}
            {(profile.life_history ?? []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {(profile.life_history ?? []).map((entry, index) => (
                  <li key={index} className="text-slate-600">
                    <span className="font-medium text-slate-800">{entry.category}:</span> {entry.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Empty>Fără profil de pacient asociat.</Empty>
        )}
      </Section>

      <Section
        title="Acuze și anamneză"
        icon={ClipboardList}
        meta={
          anamnesisCompletedAt ? (
            <span className="text-xs text-emerald-600">Finalizată {dateTime(anamnesisCompletedAt)}</span>
          ) : (
            <span className="text-xs text-amber-600">În așteptare</span>
          )
        }>
        {symptoms ? (
          <p className="whitespace-pre-wrap text-sm text-slate-700">{symptoms}</p>
        ) : (
          <Empty>Pacientul nu a completat încă anamneza.</Empty>
        )}
        {triageNotes && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note operator</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{triageNotes}</p>
          </div>
        )}
      </Section>

      <Section
        title="Date obiective"
        icon={Activity}
        meta={
          objectiveDataCompletedAt && objectiveData.length > 0 ? (
            <span className="text-xs text-emerald-600">Încărcate {dateTime(objectiveDataCompletedAt)}</span>
          ) : objectiveDataCompletedAt ? (
            // Operatorul poate declara examinarea terminată înainte ca
            // măsurătorile din aparat să ajungă la noi: „încărcate” ar minți.
            <span className="text-xs text-amber-600">Examinare încheiată {dateTime(objectiveDataCompletedAt)}</span>
          ) : (
            <span className="text-xs text-amber-600">În așteptare</span>
          )
        }>
        {objectiveData.length === 0 ? (
          <Empty>
            {objectiveDataCompletedAt
              ? 'Operatorul a încheiat examinarea, dar măsurătorile din aparat încă nu au ajuns.'
              : 'Operatorul nu a încărcat încă datele examinării.'}
          </Empty>
        ) : (
          <div className="space-y-3">
            {objectiveData.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium ${
                      entry.from_device
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                    {entry.from_device ? <Cpu className="size-3" /> : <PenLine className="size-3" />}
                    {entry.from_device ? 'Aparat HIGO' : 'Notat manual'}
                  </span>
                  {entry.operator && <span className="text-slate-500">{entry.operator}</span>}
                  {entry.completed_at && <span className="text-slate-400">{dateTime(entry.completed_at)}</span>}
                </div>
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {measurementsOf(entry).map((item) => (
                    <div key={item.key} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1 last:border-0">
                      <dt className="text-xs text-slate-500">{item.label}</dt>
                      <dd className="text-sm font-medium text-slate-900">
                        {renderValue(item.value)}
                        {item.unit && item.value !== null && item.value !== '' && (
                          <span className="ml-1 text-xs font-normal text-slate-500">{item.unit}</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </Section>

      {examMedia.length > 0 && (
        <Section
          title="Imagini și înregistrări"
          icon={Images}
          meta={<span className="text-xs text-slate-500">{examMedia.length} fișiere</span>}>
          <div className="space-y-4">
            {Object.entries(mediaByExam).map(([type, items]) => {
              const images = items.filter((item) => item.kind === 'image');
              const sounds = items.filter((item) => item.kind === 'audio');
              const clips = items.filter((item) => item.kind === 'video');

              return (
                <div key={type} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {examLabel(type)} <span className="font-normal text-slate-400">({items.length})</span>
                  </p>

                  {images.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {images.map((image) => (
                        <button
                          key={image.id}
                          type="button"
                          onClick={() => setViewer({ items: images, index: images.indexOf(image) })}
                          title="Deschide mărit"
                          className="block overflow-hidden rounded-lg border border-slate-200 transition hover:border-sky-400">
                          <img
                            src={image.url}
                            alt={`${examLabel(type)} ${image.sequence ?? ''}`}
                            loading="lazy"
                            className="aspect-square w-full bg-slate-100 object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {clips.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {clips.map((clip) => (
                        <video
                          key={clip.id}
                          controls
                          preload="metadata"
                          src={clip.url}
                          className="w-full rounded-lg border border-slate-200 bg-black"
                        />
                      ))}
                    </div>
                  )}

                  {sounds.length > 0 && (
                    <div className="space-y-2">
                      {sounds.map((sound) => (
                        <div key={sound.id} className="flex items-center gap-3">
                          {sound.sequence != null && (
                            <span className="w-6 shrink-0 text-xs text-slate-400">#{sound.sequence}</span>
                          )}
                          <audio controls preload="none" src={sound.url} className="h-9 w-full max-w-md" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Prin portal: `z-50` singur nu urcă peste barele layout-ului, care sunt
          frați în alt context de stivuire. */}
      {viewer && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Imaginea examinării"
          className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 p-4"
          onClick={() => setViewer(null)}>
          <div className="flex items-center justify-between gap-3 text-sm text-white">
            <span>
              {examLabel(viewer.items[viewer.index]?.exam_type)}{' '}
              <span className="text-white/60">
                {viewer.index + 1} / {viewer.items.length}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <a
                href={viewer.items[viewer.index]?.url}
                download
                onClick={(event) => event.stopPropagation()}
                title="Descarcă"
                className="rounded-lg p-2 hover:bg-white/10">
                <Download className="size-5" />
              </a>
              <button type="button" title="Închide" className="rounded-lg p-2 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center gap-2">
            <button
              type="button"
              title="Anterioara"
              onClick={(event) => {
                event.stopPropagation();
                setViewer(step(viewer, -1));
              }}
              className="rounded-full p-2 text-white hover:bg-white/10">
              <ChevronLeft className="size-7" />
            </button>
            <img
              src={viewer.items[viewer.index]?.url}
              alt={examLabel(viewer.items[viewer.index]?.exam_type)}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full min-h-0 max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              title="Următoarea"
              onClick={(event) => {
                event.stopPropagation();
                setViewer(step(viewer, 1));
              }}
              className="rounded-full p-2 text-white hover:bg-white/10">
              <ChevronRight className="size-7" />
            </button>
          </div>
        </div>,
        document.body
      )}

      {investigations.length > 0 && (
        <Section title="Investigații cerute" icon={Stethoscope}>
          <ul className="space-y-1 text-sm">
            {investigations.map((investigation, index) => (
              <li key={index} className="flex items-center justify-between gap-3">
                <span className="text-slate-700">{investigation.name ?? '—'}</span>
                <span className="text-xs text-slate-400">
                  {investigation.requirement === 'required' ? 'Obligatorie' : 'Opțională'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
