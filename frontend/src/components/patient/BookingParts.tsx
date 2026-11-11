import { useEffect, useState } from 'react';
import { CheckCircle2, Wallet } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { Textarea } from '../ui/textarea';
import { cn } from '../ui/utils';
import { apiRequest } from '../../lib/api';

type SlotDay = { date: string; slots: Array<{ starts_at: string; time: string }> };
type SlotsResponse = { has_schedule: boolean; default_schedule?: boolean; is_available: boolean; days: SlotDay[] };

/** Câte zile cu ore libere arată selectorul (ca în design: o săptămână de lucru și încă o zi). */
const VISIBLE_DAYS = 6;

const WEEKDAY = new Intl.DateTimeFormat('ro-RO', { weekday: 'short', timeZone: 'Europe/Chisinau' });
const DAY_LONG = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Chisinau' });

/** Suma afișată fără zecimale inutile: 300, nu 300.00. */
export function mdl(value: unknown): string {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

/** Data în formă lungă, în fusul Chișinău: „luni, 9 noiembrie, 11:00”. */
export function longDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau' });
  return `${DAY_LONG.format(date)}, ${time}`;
}

/**
 * „Când îți convine?”: zilele cu ore libere ale medicului (programul lui sau,
 * fără program, luni–vineri 09:00–18:00) și orele lor. „Altă oră” lasă
 * pacientul să aleagă liber data și ora.
 */
export function SlotPicker({ doctorId, value, onChange }: { doctorId: string; value: string; onChange: (value: string) => void }) {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    apiRequest<SlotsResponse>(`/catalog/doctors/${doctorId}/slots?days=14`, { auth: false })
      .then((response) => {
        if (cancelled) return;
        // Doar zilele în care chiar sunt ore libere: weekendul și concediul dispar.
        const days = response.days.filter((day) => day.slots.length > 0).slice(0, VISIBLE_DAYS);
        setData({ ...response, days });
        const selectedDay = days.findIndex((day) => day.slots.some((slot) => slot.starts_at === value));
        setDayIndex(Math.max(0, selectedDay));
        if (value && selectedDay < 0) setCustom(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // `value` se citește doar la încărcare, ca să redeschidă ziua aleasă.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  const freeChoice = failed || (data && data.days.length === 0);
  const day = data?.days[dayIndex];

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-1 text-sm font-medium text-slate-900">Când îți convine?</legend>
      {!data && !failed && <Skeleton className="h-24 w-full rounded-xl" />}
      {data && !freeChoice && (
        <>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Ziua">
            {data.days.map((item, index) => {
              const date = new Date(`${item.date}T12:00:00Z`);
              const on = index === dayIndex;
              return (
                <button key={item.date} type="button" role="radio" aria-checked={on} onClick={() => { setDayIndex(index); setCustom(false); }}
                  className={cn('flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-xl transition', index === VISIBLE_DAYS - 1 && 'max-sm:hidden', on ? 'border-[1.5px] border-blue-600 bg-blue-50' : 'border border-slate-200 bg-white hover:border-slate-300')}>
                  <span className={cn('text-[13px] capitalize', on ? 'text-blue-600' : 'text-slate-500')}>{WEEKDAY.format(date).replace('.', '')}</span>
                  <span className={cn('text-lg font-semibold leading-none', on ? 'text-blue-700' : 'text-slate-950')}>{date.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
          {day && (
            <>
              <p className="text-[13px] text-slate-500 sm:hidden">Ore libere {DAY_LONG.format(new Date(`${day.date}T12:00:00Z`))}</p>
              <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap" role="radiogroup" aria-label="Ora">
                {day.slots.map((slot) => (
                  <button key={slot.starts_at} type="button" role="radio" aria-checked={!custom && value === slot.starts_at} onClick={() => { setCustom(false); onChange(slot.starts_at); }}
                    className={cn('h-11 rounded-[10px] text-sm tabular-nums transition sm:w-[72px]', !custom && value === slot.starts_at ? 'bg-blue-600 font-semibold text-white' : 'border border-slate-200 bg-white font-medium text-slate-900 hover:border-slate-300')}>
                    {slot.time}
                  </button>
                ))}
                <button type="button" aria-pressed={custom} onClick={() => { setCustom(true); onChange(''); }}
                  className={cn('h-11 rounded-[10px] border border-dashed text-[13px] font-medium transition sm:px-4', custom ? 'border-blue-600 text-blue-700' : 'border-slate-300 text-slate-600 hover:border-slate-400')}>
                  Altă oră
                </button>
              </div>
            </>
          )}
        </>
      )}
      {(freeChoice || custom) && (
        <div className="space-y-2">
          <Label htmlFor="booking-custom-time">Data și ora dorită</Label>
          <Input id="booking-custom-time" type="datetime-local" value={value && !value.endsWith('Z') && !value.includes('+') ? value : ''} onChange={(event) => onChange(event.target.value)} />
          <p className="text-xs text-slate-500">Medicul confirmă ora sau îți propune alta.</p>
        </div>
      )}
    </fieldset>
  );
}

/**
 * „Cum plătești” (W4): câte bonusuri folosești, în MDL, de la 0 la maximul permis.
 * Maximul e cea mai mică dintre limita de bonusuri a medicului și soldul de bonusuri.
 */
export function BonusSlider({ total, realAmount, maxPercent, pointsBalance, percent, onPercentChange, doctorName }: {
  total: number;
  realAmount: number;
  maxPercent: number;
  pointsBalance: number;
  percent: number;
  onPercentChange: (percent: number) => void;
  doctorName: string;
}) {
  if (total <= 0 || pointsBalance <= 0) return null;
  const capByPercent = Math.floor((total * maxPercent) / 100);
  const maxBonus = Math.max(0, Math.min(capByPercent, Math.floor(pointsBalance)));
  if (maxBonus <= 0) return null;
  const bonus = Math.min(maxBonus, Math.round((total * percent) / 100));
  const setBonus = (value: number) => onPercentChange(Math.min(maxPercent, Math.floor((Math.max(0, Math.min(maxBonus, value)) / total) * 100)));

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between"><span className="text-[15px] font-semibold text-slate-950">Cum plătești</span><span className="text-[13px] text-slate-500">bonusuri folosite</span></div>
      <div className="flex items-baseline gap-1.5"><span className="text-[32px] font-bold tracking-tight tabular-nums text-slate-950">{bonus}</span><span className="text-sm text-slate-500">din max. {maxBonus}</span></div>
      <input type="range" min={0} max={maxBonus} step={1} value={bonus} onChange={(event) => setBonus(Number(event.target.value))} aria-label="Bonusuri folosite" className="h-7 w-full accent-blue-600" />
      <div className="-mt-2 flex justify-between text-xs text-slate-400"><span>0</span><span>{maxBonus}</span></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Din bani</span><span className="text-[17px] font-semibold tabular-nums text-slate-950">{mdl(realAmount)} MDL</span></div>
        <div className="flex flex-col gap-0.5 rounded-xl bg-amber-50 p-3"><span className="text-xs text-amber-800">Din bonusuri</span><span className="text-[17px] font-semibold tabular-nums text-amber-900">{bonus}</span></div>
      </div>
      <span className="text-xs leading-[1.45] text-slate-500">{doctorName} acceptă bonusuri până la {maxPercent}% din preț, adică {capByPercent}. Ai {mdl(pointsBalance)} bonusuri.</span>
    </section>
  );
}

/** Banii lipsă se alimentează din butonul de trimitere, fără să ieși din programare (6d). */
export function ShortfallNotice({ shortfall }: { shortfall: number }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-[1.45] text-amber-900">
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div className="flex flex-col gap-0.5"><span className="font-semibold">Îți lipsesc {mdl(shortfall)} MDL</span><span className="text-[13px] text-amber-800">Alimentezi cu cardul și cererea pleacă imediat după plată. Datele completate rămân salvate.</span></div>
    </div>
  );
}

type PrepAnswer = { has: boolean | null; text: string };
const PREP_QUESTIONS = [
  { key: 'allergies', label: 'Are alergii cunoscute?', placeholder: 'Ex.: penicilină, polen' },
  { key: 'chronic', label: 'Are boli cronice?', placeholder: 'Ex.: hipertensiune, diabet' },
  { key: 'medication', label: 'Ia medicamente des?', placeholder: 'Ex.: ibuprofen, vitamine' }
] as const;
type PrepKey = (typeof PREP_QUESTIONS)[number]['key'];

/**
 * „Ajută medicul să se pregătească”: trei întrebări Nu / Da + text, salvate în
 * secțiunile existente ale fișei (alergii, boli cronice, stil de viață).
 */
export function PrepareDoctorCard({ patientProfileId }: { patientProfileId: string }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<PrepKey, PrepAnswer>>({ allergies: { has: null, text: '' }, chronic: { has: null, text: '' }, medication: { has: null, text: '' } });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (key: PrepKey, patch: Partial<PrepAnswer>) => setAnswers((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const answeredYes = (key: PrepKey) => answers[key].has === true && answers[key].text.trim() !== '';

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { medical_record: record = {} } = await apiRequest<{ medical_record?: Record<string, unknown> }>(`/patient/profiles/${patientProfileId}/medical-record`);
      const patch = async (section: string, data: unknown) => apiRequest(`/patient/profiles/${patientProfileId}/medical-record`, { method: 'PATCH', body: JSON.stringify({ section, data }) });
      const rows = (value: unknown) => (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
      const items = (text: string) => text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).map((name) => name.slice(0, 255));

      if (answeredYes('allergies')) await patch('drug_allergies', [...rows(record.drug_allergies), ...items(answers.allergies.text).map((name) => ({ name }))]);
      if (answeredYes('chronic')) await patch('chronic_conditions', [...rows(record.chronic_conditions), ...items(answers.chronic.text).map((name) => ({ name }))]);
      if (answeredYes('medication')) {
        const lifestyle = (record.lifestyle && typeof record.lifestyle === 'object' ? record.lifestyle : {}) as Record<string, unknown>;
        const previous = typeof lifestyle.long_term_medication === 'string' ? lifestyle.long_term_medication.trim() : '';
        await patch('lifestyle', { ...lifestyle, long_term_medication: [previous, answers.medication.text.trim()].filter(Boolean).join('; ') });
      }
      setSaved(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva răspunsurile.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-5 w-5" />Mulțumim! Medicul vede răspunsurile în fișa pacientului.</p>;
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
      <div className="flex flex-col gap-1"><p className="text-[15px] font-semibold text-slate-950">Ajută medicul să se pregătească</p><p className="text-[13px] leading-[1.45] text-slate-500">3 întrebări despre alergii, boli cronice și medicamente. Un minut.</p></div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50">Răspunde acum</button>
      ) : (
        <div className="space-y-3">
          {PREP_QUESTIONS.map((question) => (
            <div key={question.key} className="space-y-2 rounded-xl bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900">{question.label}</span>
                <span className="flex gap-1" role="radiogroup" aria-label={question.label}>
                  {[{ value: false, label: 'Nu' }, { value: true, label: 'Da' }].map((option) => (
                    <button key={option.label} type="button" role="radio" aria-checked={answers[question.key].has === option.value} onClick={() => set(question.key, { has: option.value })}
                      className={cn('h-8 rounded-lg border px-3 text-xs font-semibold transition', answers[question.key].has === option.value ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
                      {option.label}
                    </button>
                  ))}
                </span>
              </div>
              {answers[question.key].has === true && (
                <Textarea value={answers[question.key].text} onChange={(event) => set(question.key, { text: event.target.value })} placeholder={question.placeholder} maxLength={1000} className="min-h-[60px]" />
              )}
            </div>
          ))}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>{saving ? 'Se salvează…' : 'Salvează'}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Mai târziu</Button>
          </div>
        </div>
      )}
    </section>
  );
}
