import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Minus, Plus, X } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { cn } from '../../ui/utils';
import { apiRequest } from '../../../lib/api';
import { todayDate, type MedicalField, type MedicalRecord, type RecordEntry } from '../../../lib/medical-record';
import { LIST_PROMPTS, MEDICATION_CHIPS, RELATIVES, ageInYears, listEntries, nothingFlags, objectValues, sectionByKey } from './sectionMeta';

type SaveState = 'saved' | 'saving' | 'error' | 'idle';
type Answer = 'yes' | 'no' | 'unknown';

/**
 * Editorul unei secțiuni din fișă: o singură secțiune, completată din butoane,
 * salvată automat la scurt timp după fiecare schimbare.
 */
export function SectionEditor({ profileId, sectionKey, record, patientName, birthDate, onRecordChange, footer, onClose }: {
  profileId: number;
  sectionKey: string;
  record: MedicalRecord;
  patientName: string;
  birthDate?: string | null;
  onRecordChange: (record: MedicalRecord) => void;
  /** Acțiunea de jos a panoului (ex. „Gata”), fixată sub conținut. */
  footer?: ReactNode;
  /** Închiderea: săgeată înapoi pe telefon (D3), × în panoul de pe desktop (D2b). */
  onClose?: () => void;
}) {
  const section = sectionByKey(sectionKey);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const timer = useRef<number | null>(null);

  const send = useCallback(async (body: Record<string, unknown>) => {
    setSaveState('saving');
    setError('');
    try {
      const response = await apiRequest<{ medical_record: MedicalRecord }>(`/patient/profiles/${profileId}/medical-record`, { method: 'PATCH', body: JSON.stringify({ section: sectionKey, ...body }) });
      onRecordChange(response.medical_record ?? {});
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Nu am putut salva.');
    }
  }, [profileId, sectionKey, onRecordChange]);

  /** Salvează după o scurtă pauză, ca să nu trimitem la fiecare tastă. */
  const saveSoon = useCallback((body: Record<string, unknown>) => {
    if (timer.current) window.clearTimeout(timer.current);
    setSaveState('saving');
    timer.current = window.setTimeout(() => { void send(body); }, 700);
  }, [send]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  if (!section) return null;

  // Panou: antet fix (secțiunea, pacientul, starea salvării), conținut care se derulează, acțiune jos.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-2 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] lg:h-[60px] lg:gap-3 lg:px-5 lg:py-0">
        {onClose && <button type="button" onClick={onClose} aria-label="Înapoi" className="grid h-10 w-10 shrink-0 place-items-center text-slate-700 lg:hidden"><ArrowLeft className="h-5 w-5" /></button>}
        <div className={cn('flex min-w-0 flex-1 flex-col', !onClose && 'pl-3 lg:pl-0')}>
          <h3 className="truncate text-[17px] font-semibold text-slate-950 lg:text-base">{section.title}</h3>
          <p className="truncate text-xs text-slate-500 lg:hidden">{patientName}{ageInYears(birthDate) !== null ? ` · ${ageInYears(birthDate)} ani` : ''}</p>
        </div>
        <SaveIndicator state={saveState} />
        {onClose && <button type="button" onClick={onClose} aria-label="Închide" className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:grid"><X className="h-[18px] w-[18px]" /></button>}
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {section.repeated
          ? <ListEditor sectionKey={sectionKey} record={record} patientName={patientName} saveNow={send} saveSoon={saveSoon} />
          : <ObjectEditor sectionKey={sectionKey} record={record} birthDate={birthDate} saveNow={send} saveSoon={saveSoon} />}
      </div>
      {footer && <footer className="shrink-0 bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">{footer}</footer>}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span className={cn('shrink-0 pr-3 text-xs lg:pr-0', state === 'saved' ? 'text-green-600' : state === 'error' ? 'text-red-600' : 'text-slate-500')} aria-live="polite">
      {state === 'saved' ? '✓ Salvat' : state === 'error' ? 'Nesalvat' : 'Se salvează…'}
    </span>
  );
}

type Saver = (body: Record<string, unknown>) => void | Promise<void>;

/* ——— Piesele de interfață din design (D3) ——— */

const PILL_ON = 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700';
const PILL_OFF = 'border border-slate-200 bg-white text-slate-950 hover:border-slate-300';

function Label({ children }: { children: ReactNode }) {
  return <span className="text-sm font-semibold text-slate-950">{children}</span>;
}

/** Control segmentat: fundal slate-100, segmentul activ alb cu umbră. */
function Segmented({ value, options, onChange, size = 'md' }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="grid gap-0.5 rounded-[10px] bg-slate-100 p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={cn('rounded-lg text-sm font-medium', size === 'sm' ? 'h-[38px]' : 'h-10 lg:h-[42px]', value === key ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Carduri de opțiune cu text la stânga (modul nașterii, refuzul vaccinării, activitatea). */
function OptionCards({ value, options, onChange, columns = 2 }: { value: string; options: Array<[string, string, string?]>; onChange: (value: string) => void; columns?: 1 | 2 }) {
  return (
    <div className={cn('grid gap-2', columns === 2 ? 'grid-cols-2' : 'grid-cols-1')} role="radiogroup">
      {options.map(([key, label, sub]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={cn('flex min-h-[52px] flex-col justify-center gap-0.5 rounded-xl px-3 py-2 text-left text-sm font-medium', sub && 'min-h-14 px-3.5 py-2.5', value === key ? PILL_ON : PILL_OFF)}>
          {sub ? <><span className="text-[15px] font-semibold text-slate-950">{label}</span><span className="text-xs font-normal text-slate-500">{sub}</span></> : label}
        </button>
      ))}
    </div>
  );
}

function AltChip({ onAdd, placeholder = 'Scrie denumirea' }: { onAdd: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const add = () => { const value = text.trim(); if (!value) return; onAdd(value); setText(''); setOpen(false); };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center rounded-full border border-dashed border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-600">Altceva…</button>;
  return (
    <span className="flex w-full gap-2">
      <Input autoFocus value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } if (event.key === 'Escape') setOpen(false); }} placeholder={placeholder} maxLength={255} className="h-10 rounded-[10px]" />
      <Button type="button" variant="outline" className="h-10 rounded-[10px]" onClick={add} disabled={!text.trim()}>Adaugă</Button>
    </span>
  );
}

function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={cn('inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium', selected ? PILL_ON : PILL_OFF)}>{children}</button>;
}

function AnswerButtons({ question, value, onChange, large = true }: { question: string; value: Answer; onChange: (value: Answer) => void; large?: boolean }) {
  return (
    <div className={cn('flex flex-col', large ? 'gap-[18px] lg:gap-4' : 'gap-2.5')}>
      <span className={cn('font-semibold text-slate-950', large ? 'text-xl tracking-tight lg:text-[15px] lg:tracking-normal' : 'text-[17px] lg:text-[15px]')}>{question}</span>
      <div className="grid grid-cols-3 gap-2 lg:gap-1.5" role="radiogroup" aria-label={question}>
        {([['no', 'Nu'], ['yes', 'Da'], ['unknown', 'Nu știu']] as const).map(([key, label]) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
            className={cn('rounded-[10px] text-[15px] font-medium lg:h-[42px] lg:text-sm', large ? 'h-12' : 'h-11 text-sm', value === key ? PILL_ON : cn(PILL_OFF, 'text-slate-700'))}>{label}</button>
        ))}
      </div>
    </div>
  );
}

/* ——— Liste: alergii, boli, intervenții, antecedente, vaccinări ——— */

function ListEditor({ sectionKey, record, patientName, saveNow, saveSoon }: { sectionKey: string; record: MedicalRecord; patientName: string; saveNow: Saver; saveSoon: Saver }) {
  const section = sectionByKey(sectionKey)!;
  const prompt = LIST_PROMPTS[sectionKey];
  const isVaccination = sectionKey === 'vaccinations';
  const isFamily = sectionKey === 'family_history';
  const hasWhen = section.fields.some((field) => field.key === 'date') && section.fields.some((field) => field.key === 'period');
  const vaccination = (record.vaccinations ?? {}) as { refusal?: string | null };
  const [entries, setEntries] = useState<RecordEntry[]>(() => listEntries(record, sectionKey));
  const [answer, setAnswer] = useState<Answer>(() => nothingFlags(record)[sectionKey] ? 'no' : listEntries(record, sectionKey).length ? 'yes' : 'unknown');
  const [refusal, setRefusal] = useState(vaccination.refusal ?? 'unknown');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [dateIndex, setDateIndex] = useState<number | null>(null);
  const [relative, setRelative] = useState<string | null>(null);
  const [disease, setDisease] = useState<string | null>(null);
  const firstName = patientName.split(' ')[0] || 'pacientul';

  const persist = (next: RecordEntry[], nextRefusal = refusal, immediate = false) => {
    setEntries(next);
    const valid = next.filter((entry) => String(entry.name ?? '').trim() && (!isFamily || String(entry.relationship ?? '').trim()));
    const data = isVaccination ? { refusal: nextRefusal, items: valid } : valid;
    (immediate ? saveNow : saveSoon)({ data });
  };

  const choose = (value: Answer) => {
    setAnswer(value);
    if (value === 'no') void saveNow({ nothing_to_report: true });
    else if (value === 'unknown') persist([], refusal, true);
  };

  const hasChip = (name: string) => entries.some((entry) => String(entry.name).toLowerCase() === name.toLowerCase());
  const toggleChip = (name: string) => {
    if (hasChip(name)) { persist(entries.filter((entry) => String(entry.name).toLowerCase() !== name.toLowerCase()), refusal, true); return; }
    persist([...entries, { name }], refusal, true);
  };
  const addFamily = () => {
    if (!relative || !disease) return;
    persist([...entries, { relationship: relative, name: disease }], refusal, true);
    setRelative(null);
    setDisease(null);
  };
  const updateAt = (index: number, patch: RecordEntry, immediate = false) => persist(entries.map((item, i) => (i === index ? { ...item, ...patch } : item)), refusal, immediate);
  const removeAt = (index: number) => persist(entries.filter((_, i) => i !== index), refusal, true);

  const showList = isVaccination || answer === 'yes';
  const detailFieldsFor = (keys: string[]) => section.fields.filter((field) => !keys.includes(field.key));

  return (
    <div className="flex flex-col gap-5">
      {isVaccination ? (
        <div className="flex flex-col gap-2">
          <Label>Opțiunea privind vaccinarea</Label>
          <OptionCards value={refusal} options={[['unknown', 'Nu am precizat'], ['none', 'Fără refuz'], ['temporary', 'Refuz temporar'], ['categorical', 'Refuz categoric']]} onChange={(value) => { setRefusal(value); persist(entries, value, true); }} />
        </div>
      ) : (
        <AnswerButtons question={prompt?.question ?? section.title} value={answer} onChange={choose} large={!isFamily} />
      )}

      {!isVaccination && answer === 'no' && <p className="flex items-center gap-2.5 rounded-xl bg-slate-100 p-3.5 text-sm leading-[1.45] text-slate-700 lg:px-3.5 lg:py-3 lg:text-[13px]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-500 text-xs text-white lg:h-[22px] lg:w-[22px]">✓</span>Gata. {prompt?.noText(firstName)}</p>}
      {!isVaccination && answer === 'unknown' && <p className="rounded-xl bg-slate-50 p-3.5 text-sm leading-[1.45] text-slate-600">Rămâne necompletată. Poți reveni oricând, de exemplu după ce întrebi medicul de familie.</p>}

      {showList && isFamily && (
        <>
          {entries.map((entry, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-xl border border-slate-200 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-sm font-semibold text-slate-950">{String(entry.name ?? '')}</span><span className="text-xs text-slate-500">{String(entry.relationship ?? '')}</span></span>
                <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} className="text-[13px] font-medium text-blue-600">{openIndex === index ? 'Gata' : 'Detalii'}</button>
                <button type="button" onClick={() => removeAt(index)} className="text-[13px] font-medium text-slate-500 hover:text-red-600">Elimină</button>
              </div>
              {openIndex === index && <div className="space-y-4 rounded-xl bg-slate-50 p-3"><DetailFields fields={detailFieldsFor(['name', 'relationship'])} entry={entry} onChange={(patch) => updateAt(index, patch)} /></div>}
            </div>
          ))}
          <div className="flex flex-col gap-3.5 rounded-2xl bg-slate-50 p-3.5">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-slate-600">1. Cine?</span>
              <div className="flex flex-wrap gap-1.5">{RELATIVES.map((item) => <Pill key={item} selected={relative === item} onClick={() => setRelative(item)}>{item}</Pill>)}</div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-slate-600">2. Ce boală?</span>
              <div className="flex flex-wrap gap-1.5">
                {(prompt?.chips ?? []).map((item) => <Pill key={item} selected={disease === item} onClick={() => setDisease(item)}>{item}</Pill>)}
                {disease && !(prompt?.chips ?? []).includes(disease) && <Pill selected onClick={() => setDisease(null)}>{disease}</Pill>}
                <AltChip onAdd={setDisease} placeholder="Ce boală?" />
              </div>
            </div>
            <button type="button" onClick={addFamily} disabled={!relative || !disease} className={cn('h-[42px] rounded-[10px] border border-slate-200 bg-white text-sm font-semibold', relative && disease ? 'text-blue-600' : 'text-slate-400')}>
              {relative && disease ? `Adaugă: ${relative} · ${disease}` : 'Alege ruda și boala'}
            </button>
          </div>
        </>
      )}

      {showList && !isFamily && (
        <>
          {prompt && (
            <div className="flex flex-col gap-2.5">
              {isVaccination ? <Label>{prompt.question}</Label> : <p className="text-sm text-slate-600">Atinge ce se potrivește</p>}
              <div className="flex flex-wrap gap-2 lg:gap-1.5">
                {prompt.chips.map((chip) => isVaccination
                  ? <Pill key={chip} selected={hasChip(chip)} onClick={() => toggleChip(chip)}>{hasChip(chip) ? '✓ ' : ''}{chip}</Pill>
                  : <Chip key={chip} selected={hasChip(chip)} onClick={() => toggleChip(chip)}>{hasChip(chip) ? '✓ ' : '+ '}{chip}</Chip>)}
                {entries.filter((entry) => !prompt.chips.some((chip) => chip.toLowerCase() === String(entry.name).toLowerCase())).map((entry) => <Chip key={String(entry.name)} selected onClick={() => toggleChip(String(entry.name))}>✓ {String(entry.name)}</Chip>)}
                <AltChip onAdd={toggleChip} />
              </div>
            </div>
          )}

          {/* Vaccinări (D3f): un tabel simplu, data e opțională. */}
          {isVaccination && entries.length > 0 && (
            <div className="flex flex-col rounded-2xl border border-slate-200">
              {entries.map((entry, index) => (
                <div key={index} className={cn('flex flex-col gap-2 px-3.5 py-3', index > 0 && 'border-t border-slate-100')}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-950">{String(entry.name ?? '')}</span>
                    {entry.date && dateIndex !== index
                      ? <button type="button" onClick={() => setDateIndex(index)} className="text-[13px] text-slate-500">{formatDay(String(entry.date))}</button>
                      : dateIndex !== index && <button type="button" onClick={() => setDateIndex(index)} className="text-[13px] font-medium text-blue-600">+ Data (opțional)</button>}
                  </div>
                  {dateIndex === index && <Input type="date" autoFocus max={todayDate()} value={String(entry.date ?? '')} onChange={(event) => updateAt(index, { date: event.target.value || null }, true)} onBlur={() => setDateIndex(null)} className="h-11 rounded-[10px]" />}
                </div>
              ))}
            </div>
          )}

          {/* Intervenții și boli (D3g): când a fost, exact sau aproximativ. */}
          {!isVaccination && hasWhen && entries.map((entry, index) => {
            const others = detailFieldsFor(['name', 'date', 'period']);
            return (
              <div key={index} className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 p-3.5">
                <div className="flex items-center justify-between gap-3"><span className="text-[15px] font-semibold text-slate-950">{String(entry.name ?? '')}</span><button type="button" onClick={() => removeAt(index)} className="text-[13px] font-medium text-slate-500 hover:text-red-600">Elimină</button></div>
                <WhenField entry={entry} onChange={(patch) => updateAt(index, patch, true)} />
                {others.length > 0 && (openIndex === index
                  ? <div className="space-y-4 rounded-xl bg-slate-50 p-3"><DetailFields fields={others} entry={entry} onChange={(patch) => updateAt(index, patch)} /></div>
                  : <button type="button" onClick={() => setOpenIndex(index)} className="self-start text-sm font-medium text-blue-600">+ {others[0].label.replace(/ \(.*\)$/, '')} (opțional)</button>)}
              </div>
            );
          })}

          {/* Alergii, boli cronice: card cu numele, tipul și detaliile. */}
          {!isVaccination && !hasWhen && entries.length > 0 && (
            <ul className="flex flex-col gap-2">
              {entries.map((entry, index) => {
                const detailFields = detailFieldsFor(['name', 'relationship']);
                const meta = [typeLabel(section.fields, entry), entry.date || entry.period].filter(Boolean).join(' · ');
                return (
                  <li key={index} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-950">{String(entry.name ?? '')}</span>
                      {meta && <span className="shrink-0 text-xs text-slate-500">{meta}</span>}
                    </div>
                    <div className="flex gap-4 text-[13px] font-medium">
                      {detailFields.length > 0 && <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} className="text-blue-600 hover:underline">{openIndex === index ? 'Gata' : 'Adaugă detalii'}</button>}
                      <button type="button" onClick={() => removeAt(index)} className="text-slate-500 hover:text-red-600">Elimină</button>
                    </div>
                    {openIndex === index && <div className="mt-1.5 space-y-4 rounded-xl bg-slate-50 p-3"><DetailFields fields={detailFields} entry={entry} onChange={(patch) => updateAt(index, patch)} /></div>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** „Când a fost?”: dată exactă sau aproximativ (anul sau vârsta). Aproximativul se păstrează în `period`. */
function WhenField({ entry, onChange }: { entry: RecordEntry; onChange: (patch: RecordEntry) => void }) {
  const period = String(entry.period ?? '');
  const ageMatch = period.match(/^la (\d+) (ani|an)$/);
  const yearMatch = period.match(/^în (\d{4})$/);
  const [mode, setMode] = useState<'exact' | 'approx'>(entry.date || !period ? 'exact' : 'approx');
  const [unit, setUnit] = useState<'year' | 'age'>(yearMatch ? 'year' : 'age');
  const age = ageMatch ? Number(ageMatch[1]) : null;
  const setAge = (next: number) => onChange({ period: `la ${Math.max(0, next)} ani`, date: null });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-slate-950">Când a fost?</span>
      <Segmented size="sm" value={mode} options={[['exact', 'Dată exactă'], ['approx', 'Aproximativ']]} onChange={(value) => setMode(value as 'exact' | 'approx')} />
      {mode === 'exact' ? (
        <Input type="date" max={todayDate()} value={String(entry.date ?? '')} onChange={(event) => onChange({ date: event.target.value || null, period: null })} className="h-[46px] rounded-[10px] text-[15px]" />
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            {([['year', 'Anul'], ['age', 'Vârsta']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setUnit(key)} className={cn('h-10 rounded-[10px] text-sm', unit === key ? cn(PILL_ON, 'font-medium') : PILL_OFF)}>{label}</button>)}
          </div>
          {unit === 'age' ? (
            <div className="flex items-center gap-2.5 text-[15px] text-slate-950">
              la
              <span className="flex h-[46px] items-center rounded-[10px] border border-slate-200">
                <button type="button" aria-label="Mai puțin" onClick={() => setAge((age ?? 1) - 1)} className="h-11 w-11 text-lg">−</button>
                <span className="w-8 text-center text-base font-semibold">{age ?? '—'}</span>
                <button type="button" aria-label="Mai mult" onClick={() => setAge((age ?? 0) + 1)} className="h-11 w-11 text-lg">+</button>
              </span>
              ani
            </div>
          ) : (
            <Input inputMode="numeric" maxLength={4} placeholder="Ex.: 2015" value={yearMatch?.[1] ?? ''} onChange={(event) => { const year = event.target.value.replace(/\D/g, '').slice(0, 4); onChange({ period: year ? `în ${year}` : null, date: null }); }} className="h-[46px] w-40 rounded-[10px] text-[15px]" />
          )}
        </div>
      )}
    </div>
  );
}

/** Câmpurile de detaliu ale unui element. */
function DetailFields({ fields, entry, onChange }: { fields: MedicalField[]; entry: RecordEntry; onChange: (patch: RecordEntry) => void }) {
  const hasDate = fields.some((field) => field.key === 'date');
  const hasPeriod = fields.some((field) => field.key === 'period');
  return (
    <>
      {hasDate && hasPeriod && <WhenField entry={entry} onChange={onChange} />}
      {fields.filter((field) => !(hasDate && hasPeriod && ['date', 'period'].includes(field.key))).map((field) => (
        <FieldInput key={field.key} field={field} value={entry[field.key]} onChange={(value) => onChange({ [field.key]: value })} />
      ))}
    </>
  );
}

/* ——— Secțiuni-obiect: naștere și stil de viață ——— */

function ObjectEditor({ sectionKey, record, birthDate, saveNow, saveSoon }: { sectionKey: string; record: MedicalRecord; birthDate?: string | null; saveNow: Saver; saveSoon: Saver }) {
  const section = sectionByKey(sectionKey)!;
  const [values, setValues] = useState<RecordEntry>(() => objectValues(record, sectionKey));
  const [nothing, setNothing] = useState(Boolean(nothingFlags(record)[sectionKey]));
  const age = ageInYears(birthDate);
  const adult = sectionKey === 'birth' && age !== null && age >= 18;
  const [showAll, setShowAll] = useState(!adult);

  const update = (key: string, value: string | number | null, immediate = false) => {
    const next = { ...values, [key]: value === '' ? null : value };
    setValues(next);
    setNothing(false);
    const data = Object.fromEntries(section.fields.map((field) => [field.key, next[field.key] ?? null]));
    (immediate ? saveNow : saveSoon)({ data });
  };
  const markNothing = () => { setNothing(true); setValues({}); void saveNow({ nothing_to_report: true }); };
  const str = (key: string) => (values[key] === null || values[key] === undefined ? '' : String(values[key]));
  const options = (key: string) => section.fields.find((field) => field.key === key)?.options ?? [];

  const bloodGroup = (
    <div className="flex flex-col gap-2">
      <Label>Grupa sangvină și Rh</Label>
      <div className="flex gap-2">
        <div className="grid flex-[2] grid-cols-4 gap-1.5">
          {['A', 'B', 'AB', 'O'].map((group) => <button key={group} type="button" aria-pressed={str('blood_group') === group} onClick={() => update('blood_group', str('blood_group') === group ? null : group, true)} className={cn('h-12 rounded-[10px] text-base font-semibold', str('blood_group') === group ? PILL_ON : PILL_OFF)}>{group}</button>)}
        </div>
        <span className="w-px bg-slate-200" />
        <div className="grid flex-1 grid-cols-2 gap-1.5">
          {([['positive', '+'], ['negative', '−']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={str('rh') === key} aria-label={key === 'positive' ? 'Rh pozitiv' : 'Rh negativ'} onClick={() => update('rh', str('rh') === key ? null : key, true)} className={cn('h-12 rounded-[10px] text-lg font-semibold', str('rh') === key ? PILL_ON : PILL_OFF)}>{label}</button>)}
        </div>
      </div>
    </div>
  );

  const nothingNote = nothing && <p className="flex items-center gap-2.5 rounded-xl bg-slate-100 p-3.5 text-sm text-slate-700"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-500 text-xs text-white">✓</span>Secțiunea e marcată „Nimic de raportat”.</p>;
  const nothingButton = !nothing && <button type="button" onClick={markNothing} className="self-start text-sm font-medium text-slate-500 hover:text-slate-800">Nimic de raportat</button>;

  if (sectionKey === 'birth') {
    if (!showAll) {
      return (
        <div className="flex flex-col gap-[18px]">
          {nothingNote}
          {bloodGroup}
          <button type="button" onClick={() => setShowAll(true)} className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-700">Arată toate (modul nașterii, termen, APGAR…)<ChevronDown className="h-4 w-4" /></button>
          <span className="text-[13px] leading-[1.45] text-slate-500">La adulți, medicul are nevoie de obicei doar de grupa sangvină. Restul rămâne disponibil, dar ascuns.</span>
        </div>
      );
    }
    const weeks = str('gestational_weeks');
    const weight = values.birth_weight === null || values.birth_weight === undefined || values.birth_weight === '' ? null : Number(values.birth_weight);
    return (
      <div className="flex flex-col gap-[22px]">
        {nothingNote}
        <div className="flex flex-col gap-2"><Label>Modul nașterii</Label><OptionCards value={str('birth_method')} options={options('birth_method').map(([key, label]) => [key, label.replace('Operație cezariană', 'Cezariană').replace(' extracție', '')])} onChange={(value) => update('birth_method', str('birth_method') === value ? null : value, true)} /></div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between"><Label>Termenul nașterii</Label>{weeks && <span className="text-sm font-semibold text-blue-600">{weeks} săptămâni</span>}</div>
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {Array.from({ length: 20 }, (_, i) => String(i + 24)).map((week) => <button key={week} type="button" onClick={() => update('gestational_weeks', weeks === week ? null : week, true)} className={cn('h-11 w-11 shrink-0 rounded-[10px] text-sm font-semibold', weeks === week ? PILL_ON : PILL_OFF)}>{week}</button>)}
          </div>
          <span className="text-xs text-slate-500">Derulează: 24–43 săptămâni</span>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Masa la naștere</Label>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Mai puțin" onClick={() => update('birth_weight', Math.max(500, (weight ?? 3000) - 50))} className="h-12 w-12 rounded-[10px] border border-slate-200 bg-white text-xl">−</button>
            <label className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 text-lg font-semibold">
              <input inputMode="numeric" aria-label="Masa în grame" value={weight ?? ''} placeholder="—" onChange={(event) => update('birth_weight', event.target.value === '' ? null : Number(event.target.value.replace(/\D/g, '')))} className="w-20 bg-transparent text-right outline-none" />
              <span className="text-sm font-medium text-slate-500">g</span>
            </label>
            <button type="button" aria-label="Mai mult" onClick={() => update('birth_weight', (weight ?? 3000) + 50)} className="h-12 w-12 rounded-[10px] border border-slate-200 bg-white text-xl">+</button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Circumferința craniană</Label>
          <label className="flex h-12 w-[150px] items-center justify-between rounded-[10px] border border-slate-200 px-3.5 text-base">
            <input inputMode="decimal" aria-label="Circumferința în cm" value={str('head_circumference')} placeholder="—" onChange={(event) => update('head_circumference', event.target.value === '' ? null : Number(event.target.value.replace(',', '.')) || null)} className="w-16 bg-transparent outline-none" />
            <span className="text-sm text-slate-500">cm</span>
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Scor APGAR</Label>
          <div className="grid grid-cols-5 gap-1.5">{Array.from({ length: 10 }, (_, i) => String(i + 1)).map((score) => <button key={score} type="button" onClick={() => update('apgar', str('apgar') === score ? null : score, true)} className={cn('h-11 rounded-[10px] text-[15px] font-semibold', str('apgar') === score ? PILL_ON : PILL_OFF)}>{score}</button>)}</div>
        </div>
        <div className="flex flex-col gap-2"><Label>Alimentație</Label><Segmented value={str('feeding')} options={options('feeding')} onChange={(value) => update('feeding', value, true)} /></div>
        {bloodGroup}
        <div className="flex flex-col gap-2">
          <Label>Dezvoltare neuropsihică și motorie</Label>
          <div className="flex flex-wrap gap-1.5">{['la 6 luni', 'la 1 an', 'la 2 ani', 'la 3 ani'].map((item) => <Pill key={item} selected={str('development_age') === item} onClick={() => update('development_age', str('development_age') === item ? null : item, true)}>{item}</Pill>)}</div>
          <Textarea value={str('development')} onChange={(event) => update('development', event.target.value)} placeholder="Ex.: a mers singură la 11 luni, primele cuvinte la 1 an" maxLength={4000} className="min-h-16 rounded-[10px] text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Boli congenitale și alte date <span className="font-normal text-slate-500">(opțional)</span></Label>
          <Textarea value={str('congenital_conditions')} onChange={(event) => update('congenital_conditions', event.target.value)} placeholder="Scrie dacă e ceva de știut" maxLength={4000} className="min-h-12 rounded-[10px] text-sm" />
          {str('other_details') && <Textarea value={str('other_details')} onChange={(event) => update('other_details', event.target.value)} maxLength={4000} className="min-h-12 rounded-[10px] text-sm" />}
        </div>
        {nothingButton}
      </div>
    );
  }

  if (sectionKey === 'lifestyle') {
    const smoking = str('smoking');
    const smokeKey = /^nu$/i.test(smoking) ? 'nu' : /renun/i.test(smoking) ? 'renuntat' : smoking ? 'da' : '';
    const perDay = Number(smoking.match(/(\d+) pe zi/)?.[1] ?? 0) || null;
    const years = Number(smoking.match(/(\d+) ani/)?.[1] ?? 0) || null;
    const smokeText = (day: number | null, yrs: number | null) => ['Da', day ? `${day} pe zi` : null, yrs ? `de ${yrs} ani` : null].filter(Boolean).join(' · ');
    const alcohol = str('alcohol');
    const medication = str('long_term_medication').split(';').map((item) => item.trim()).filter(Boolean);
    const hasMedication = (name: string) => medication.some((item) => item.toLowerCase() === name.toLowerCase());
    const toggleMedication = (name: string) => update('long_term_medication', (hasMedication(name) ? medication.filter((item) => item.toLowerCase() !== name.toLowerCase()) : [...medication, name]).join('; '), true);
    const counter = (label: string, value: number | null, onChange: (next: number) => void) => (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-slate-600">{label}</span>
        <span className="flex h-11 items-center justify-between rounded-[10px] border border-slate-200 bg-white px-1">
          <button type="button" aria-label="Mai puțin" onClick={() => onChange(Math.max(0, (value ?? 1) - 1))} className="h-9 w-9 text-slate-600">−</button>
          <span className="font-semibold">{value ?? '—'}</span>
          <button type="button" aria-label="Mai mult" onClick={() => onChange((value ?? 0) + 1)} className="h-9 w-9 text-slate-600">+</button>
        </span>
      </div>
    );
    return (
      <div className="flex flex-col gap-[22px]">
        {nothingNote}
        <div className="flex flex-col gap-2"><Label>Nivel de activitate</Label><OptionCards columns={1} value={str('activity')} options={[['sedentary', 'Sedentar', 'Mai mult stând, puțină mișcare'], ['active', 'Activ', 'Mers zilnic, mișcare la muncă'], ['regular_sport', 'Sport regulat', 'Antrenament de 2+ ori pe săptămână']]} onChange={(value) => update('activity', value, true)} /></div>
        <div className="flex flex-col gap-2">
          <Label>Fumat</Label>
          <Segmented value={smokeKey} options={[['nu', 'Nu'], ['renuntat', 'Am renunțat'], ['da', 'Da']]} onChange={(value) => update('smoking', value === 'nu' ? 'Nu' : value === 'renuntat' ? 'Am renunțat' : smokeText(perDay, years), true)} />
          {smokeKey === 'da' && (
            <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3">
              {counter('Câte pe zi', perDay, (next) => update('smoking', smokeText(next, years)))}
              {counter('De câți ani', years, (next) => update('smoking', smokeText(perDay, next)))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2"><Label>Alcool</Label><Segmented value={alcohol} options={[['Nu', 'Nu'], ['Ocazional', 'Ocazional'], ['Regulat', 'Regulat']]} onChange={(value) => update('alcohol', value, true)} /></div>
        <div className="flex flex-col gap-2">
          <Label>Medicamente luate des</Label>
          <div className="flex flex-wrap gap-1.5">
            {MEDICATION_CHIPS.map((chip) => <Pill key={chip} selected={hasMedication(chip)} onClick={() => toggleMedication(chip)}>{chip}</Pill>)}
            {medication.filter((item) => !MEDICATION_CHIPS.some((chip) => chip.toLowerCase() === item.toLowerCase())).map((item) => <Pill key={item} selected onClick={() => toggleMedication(item)}>{item}</Pill>)}
            <AltChip onAdd={toggleMedication} placeholder="Ce medicament?" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Activitate profesională <span className="font-normal text-slate-500">(opțional)</span></Label>
          <Input value={str('workplace')} onChange={(event) => update('workplace', event.target.value)} placeholder="Ex.: lucru la birou, șofer, construcții" maxLength={4000} className="h-11 rounded-[10px]" />
        </div>
        {str('exposures') && <FieldInput field={section.fields.find((field) => field.key === 'exposures')!} value={values.exposures} onChange={(value) => update('exposures', value)} />}
        {str('notes') && <FieldInput field={section.fields.find((field) => field.key === 'notes')!} value={values.notes} onChange={(value) => update('notes', value)} />}
        {nothingButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {nothingNote}
      {section.fields.map((field) => field.type === 'number'
        ? <Stepper key={field.key} field={field} value={values[field.key]} onChange={(value) => update(field.key, value)} />
        : <FieldInput key={field.key} field={field} value={values[field.key]} onChange={(value) => update(field.key, value, field.type === 'select')} />)}
      {nothingButton}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: MedicalField; value: unknown; onChange: (value: string | null) => void }) {
  const current = value === null || value === undefined ? '' : String(value);
  if (field.type === 'select' && field.options) {
    return field.options.length > 12
      ? (
        <label className="flex flex-col gap-2"><Label>{field.label}</Label>
          <select value={current} onChange={(event) => onChange(event.target.value || null)} className="h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm">
            <option value="">Necompletat</option>{field.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      )
      : <ChipGroup label={field.label} value={current} options={field.options} onChange={(next) => onChange(next === current ? null : next)} />;
  }
  if (field.type === 'textarea') {
    return <label className="flex flex-col gap-2"><Label>{field.label}</Label><Textarea value={current} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} maxLength={4000} className="min-h-[72px] rounded-[10px] text-sm" /></label>;
  }
  return <label className="flex flex-col gap-2"><Label>{field.label}</Label><Input type={field.type === 'date' ? 'date' : 'text'} max={field.type === 'date' ? todayDate() : undefined} value={current} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} maxLength={255} className="h-11 rounded-[10px]" /></label>;
}

function Stepper({ field, value, onChange }: { field: MedicalField; value: unknown; onChange: (value: number | null) => void }) {
  const numeric = value === null || value === undefined || value === '' ? null : Number(value);
  const step = field.unit === 'g' ? 50 : 1;
  const clamp = (next: number) => Math.min(field.max ?? Infinity, Math.max(field.min ?? 0, next));
  return (
    <div className="flex flex-col gap-2">
      <Label>{field.label}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Mai puțin" onClick={() => onChange(clamp((numeric ?? field.min ?? 0) - step))}><Minus className="h-4 w-4" /></Button>
        <Input type="number" inputMode="decimal" value={numeric ?? ''} min={field.min} max={field.max} onChange={(event) => onChange(event.target.value === '' ? null : clamp(Number(event.target.value)))} className="h-10 w-28 rounded-[10px] text-center tabular-nums" />
        <Button type="button" variant="outline" size="icon" aria-label="Mai mult" onClick={() => onChange(clamp((numeric ?? field.min ?? 0) + step))}><Plus className="h-4 w-4" /></Button>
        {field.unit && <span className="text-sm text-slate-500">{field.unit}</span>}
      </div>
    </div>
  );
}

export function ChipGroup({ label, value, options, onChange, allowCustom = false }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; allowCustom?: boolean }) {
  const isCustom = allowCustom && value !== '' && !options.some(([key]) => key === value);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-950">{label}</p>
      <div className="flex flex-wrap gap-2 lg:gap-1.5" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => <Chip key={key} role="radio" selected={value === key} onClick={() => onChange(key)}>{text}</Chip>)}
      </div>
      {allowCustom && (value === 'Da' || isCustom) && <Input value={value === 'Da' ? '' : value} onChange={(event) => onChange(event.target.value || 'Da')} placeholder="Câte pe zi, de câți ani" className="h-10 rounded-[10px]" />}
    </div>
  );
}

function Chip({ selected, onClick, children, role }: { selected: boolean; onClick: () => void; children: ReactNode; role?: string }) {
  return (
    <button type="button" role={role} aria-checked={role ? selected : undefined} aria-pressed={role ? undefined : selected} onClick={onClick}
      className={cn('inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm font-medium transition lg:h-[34px] lg:px-3 lg:text-[13px]', selected ? PILL_ON : cn(PILL_OFF, 'text-slate-700'))}>
      {children}
    </button>
  );
}

function typeLabel(fields: MedicalField[], entry: RecordEntry): string {
  const typeField = fields.find((field) => field.key === 'allergy_type');
  return typeField?.options?.find(([key]) => key === entry.allergy_type)?.[1] ?? '';
}

function formatDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}.${month}.${year}` : value;
}
