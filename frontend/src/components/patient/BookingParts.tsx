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
type SlotsResponse = { has_schedule: boolean; is_available: boolean; days: SlotDay[] };

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
 * „Când îți convine?”: zilele și orele libere ale medicului, după programul lui.
 * Fără program configurat, sau cu „Altă oră”, pacientul alege liber data și ora.
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
    apiRequest<SlotsResponse>(`/catalog/doctors/${doctorId}/slots?days=7`, { auth: false })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        const selectedDay = response.days.findIndex((day) => day.slots.some((slot) => slot.starts_at === value));
        const firstWithSlots = response.days.findIndex((day) => day.slots.length > 0);
        setDayIndex(selectedDay >= 0 ? selectedDay : Math.max(0, firstWithSlots));
        if (value && selectedDay < 0) setCustom(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // `value` se citește doar la încărcare, ca să redeschidă ziua aleasă.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId]);

  const freeChoice = failed || (data && (!data.has_schedule || data.days.every((day) => day.slots.length === 0)));
  const day = data?.days[dayIndex];

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-semibold text-slate-900">Când îți convine?</legend>
      {!data && !failed && <Skeleton className="h-24 w-full rounded-xl" />}
      {data && !freeChoice && (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Ziua">
            {data.days.map((item, index) => {
              const date = new Date(`${item.date}T12:00:00Z`);
              const empty = item.slots.length === 0;
              return (
                <button key={item.date} type="button" role="radio" aria-checked={index === dayIndex} disabled={empty} onClick={() => { setDayIndex(index); setCustom(false); }}
                  className={cn('flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs transition disabled:opacity-40', index === dayIndex ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
                  <span className="capitalize">{WEEKDAY.format(date).replace('.', '')}</span>
                  <span className="text-base font-semibold">{date.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
          {day && (
            <>
              <p className="text-xs text-slate-500">Ore libere {DAY_LONG.format(new Date(`${day.date}T12:00:00Z`))}</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Ora">
                {day.slots.map((slot) => (
                  <button key={slot.starts_at} type="button" role="radio" aria-checked={!custom && value === slot.starts_at} onClick={() => { setCustom(false); onChange(slot.starts_at); }}
                    className={cn('h-10 rounded-xl border text-sm font-medium tabular-nums transition', !custom && value === slot.starts_at ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
                    {slot.time}
                  </button>
                ))}
                <button type="button" aria-pressed={custom} onClick={() => { setCustom(true); onChange(''); }}
                  className={cn('h-10 rounded-xl border border-dashed text-sm font-medium transition', custom ? 'border-primary text-primary' : 'border-slate-300 text-slate-600 hover:border-slate-400')}>
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
 * „Cum plătești”: câte bonusuri folosești, în MDL. Maximul e cea mai mică dintre
 * limita de bonusuri a platformei și soldul de bonusuri.
 */
export function BonusSlider({ total, maxPercent, pointsBalance, percent, onPercentChange }: {
  total: number;
  maxPercent: number;
  pointsBalance: number;
  percent: number;
  onPercentChange: (percent: number) => void;
}) {
  if (total <= 0 || pointsBalance <= 0) return null;
  const capByPercent = Math.floor((total * maxPercent) / 100);
  const maxBonus = Math.max(0, Math.min(capByPercent, Math.floor(pointsBalance)));
  if (maxBonus <= 0) return null;
  const bonus = Math.min(maxBonus, Math.round((total * percent) / 100));
  const setBonus = (value: number) => onPercentChange(Math.min(maxPercent, Math.floor((Math.max(0, Math.min(maxBonus, value)) / total) * 100)));
  const limitedByBalance = maxBonus < capByPercent;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-amber-950">Folosește bonusurile</span>
        <span className="tabular-nums text-amber-900"><span className="font-semibold">{bonus}</span> din max. {maxBonus}</span>
      </div>
      <input type="range" min={0} max={maxBonus} step={1} value={bonus} onChange={(event) => setBonus(Number(event.target.value))} aria-label="Bonusuri folosite" className="mt-3 w-full accent-[var(--primary)]" />
      <div className="flex justify-between text-xs text-amber-800"><span>0</span><span>{maxBonus}</span></div>
      <p className="mt-2 text-xs leading-5 text-amber-900">
        Bonusurile acoperă până la {maxPercent}% din preț, adică {capByPercent}. Ai {mdl(pointsBalance)} bonusuri.
        {limitedByBalance ? ' Maximul e limitat de soldul tău de bonusuri.' : ''}
      </p>
    </section>
  );
}

/** Banii lipsă se alimentează din butonul de trimitere, fără să ieși din programare. */
export function ShortfallNotice({ balance, shortfall }: { balance: number; shortfall: number }) {
  return (
    <section className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
      <p className="flex items-center justify-between text-slate-700"><span className="flex items-center gap-2"><Wallet className="h-4 w-4" />În portofel</span><span className="tabular-nums font-semibold">{mdl(balance)} MDL</span></p>
      <p className="font-semibold text-orange-900">Îți lipsesc {mdl(shortfall)} MDL</p>
      <p className="text-xs leading-5 text-orange-900">Alimentezi cu cardul și cererea pleacă imediat după plată. Datele completate rămân salvate.</p>
    </section>
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
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-left text-sm">
      <p className="font-semibold text-slate-950">Ajută medicul să se pregătească</p>
      <p className="mt-0.5 text-slate-600">3 întrebări despre alergii, boli cronice și medicamente. Un minut.</p>
      {!open ? (
        <Button type="button" size="sm" className="mt-3" onClick={() => setOpen(true)}>Răspunde acum</Button>
      ) : (
        <div className="mt-3 space-y-3">
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
