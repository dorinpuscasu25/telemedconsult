import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Minus, Plus, X } from 'lucide-react';
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
          <p className="truncate text-xs text-slate-500 lg:hidden">{patientName}</p>
        </div>
        <SaveIndicator state={saveState} />
        {onClose && <button type="button" onClick={onClose} aria-label="Închide" className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:grid"><X className="h-[18px] w-[18px]" /></button>}
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {section.description && !section.repeated && <p className="text-sm leading-6 text-slate-500">{section.description}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {section.repeated
          ? <ListEditor sectionKey={sectionKey} record={record} patientName={patientName} saveNow={send} saveSoon={saveSoon} />
          : <ObjectEditor sectionKey={sectionKey} record={record} birthDate={birthDate} saveNow={send} saveSoon={saveSoon} />}
      </div>
      {footer && <footer className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">{footer}</footer>}
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

function ListEditor({ sectionKey, record, patientName, saveNow, saveSoon }: { sectionKey: string; record: MedicalRecord; patientName: string; saveNow: Saver; saveSoon: Saver }) {
  const section = sectionByKey(sectionKey)!;
  const prompt = LIST_PROMPTS[sectionKey];
  const isVaccination = sectionKey === 'vaccinations';
  const vaccination = (record.vaccinations ?? {}) as { refusal?: string | null };
  const [entries, setEntries] = useState<RecordEntry[]>(() => listEntries(record, sectionKey));
  const [answer, setAnswer] = useState<Answer>(() => nothingFlags(record)[sectionKey] ? 'no' : listEntries(record, sectionKey).length ? 'yes' : 'unknown');
  const [refusal, setRefusal] = useState(vaccination.refusal ?? 'unknown');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [other, setOther] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [relative, setRelative] = useState(RELATIVES[0]);
  const firstName = patientName.split(' ')[0] || 'pacientul';

  const persist = (next: RecordEntry[], nextRefusal = refusal, immediate = false) => {
    setEntries(next);
    const valid = next.filter((entry) => String(entry.name ?? '').trim() && (sectionKey !== 'family_history' || String(entry.relationship ?? '').trim()));
    const data = isVaccination ? { refusal: nextRefusal, items: valid } : valid;
    (immediate ? saveNow : saveSoon)({ data });
  };

  const choose = (value: Answer) => {
    setAnswer(value);
    if (value === 'no') void saveNow({ nothing_to_report: true });
    else if (value === 'unknown') persist([], refusal, true);
  };

  const hasChip = (name: string) => entries.some((entry) => String(entry.name).toLowerCase() === name.toLowerCase() && (sectionKey !== 'family_history' || entry.relationship === relative));
  const toggleChip = (name: string) => {
    if (hasChip(name)) {
      persist(entries.filter((entry) => !(String(entry.name).toLowerCase() === name.toLowerCase() && (sectionKey !== 'family_history' || entry.relationship === relative))), refusal, true);
      return;
    }
    persist([...entries, sectionKey === 'family_history' ? { relationship: relative, name } : { name }], refusal, true);
  };
  const addOther = () => {
    const name = other.trim();
    if (!name) return;
    setOther('');
    setOtherOpen(false);
    toggleChip(name);
  };

  const showList = isVaccination || answer === 'yes';

  return (
    <div className="space-y-5">
      {isVaccination ? (
        <ChipGroup label="Opțiunea privind vaccinarea" value={refusal} options={[['unknown', 'Nu am precizat'], ['none', 'Fără refuz'], ['temporary', 'Refuz temporar'], ['categorical', 'Refuz categoric']]} onChange={(value) => { setRefusal(value); persist(entries, value, true); }} />
      ) : (
        <div className="flex flex-col gap-[18px] lg:gap-4">
          <span className="text-xl font-semibold tracking-tight text-slate-950 lg:text-[15px] lg:tracking-normal">{prompt?.question ?? section.title}</span>
          <div className="grid grid-cols-3 gap-2 lg:gap-1.5" role="radiogroup" aria-label={prompt?.question ?? section.title}>
            {([['no', 'Nu'], ['yes', 'Da'], ['unknown', 'Nu știu']] as const).map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={answer === key} onClick={() => choose(key)}
                className={cn('h-12 rounded-[10px] text-[15px] font-medium lg:h-[42px] lg:text-sm', answer === key ? 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {!isVaccination && answer === 'no' && <p className="flex items-center gap-2.5 rounded-xl bg-slate-100 p-3.5 text-sm leading-[1.45] text-slate-700 lg:px-3.5 lg:py-3 lg:text-[13px]"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-500 text-xs text-white lg:h-[22px] lg:w-[22px]">✓</span>Gata. {prompt?.noText(firstName)}</p>}
      {!isVaccination && answer === 'unknown' && <p className="rounded-xl bg-slate-50 p-3.5 text-sm leading-[1.45] text-slate-600">Rămâne necompletată. Poți reveni oricând, de exemplu după ce întrebi medicul de familie.</p>}

      {showList && (
        <>
          {sectionKey === 'family_history' && <ChipGroup label="1. Cine?" value={relative} options={RELATIVES.map((item) => [item, item])} onChange={setRelative} />}
          {prompt && (
            <div className="flex flex-col gap-2.5">
              <p className="text-sm text-slate-600">{sectionKey === 'family_history' ? '2. Ce boală?' : isVaccination ? prompt.question : 'Atinge ce se potrivește'}</p>
              <div className="flex flex-wrap gap-2 lg:gap-1.5">
                {prompt.chips.map((chip) => <Chip key={chip} selected={hasChip(chip)} onClick={() => toggleChip(chip)}>{hasChip(chip) ? '✓' : '+'} {chip}</Chip>)}
                {!otherOpen && <button type="button" onClick={() => setOtherOpen(true)} className="inline-flex h-10 items-center rounded-full border border-dashed border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-600 lg:h-[34px] lg:px-3 lg:text-[13px]">Altceva…</button>}
              </div>
              {otherOpen && (
                <div className="flex gap-2">
                  <Input autoFocus value={other} onChange={(event) => setOther(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addOther(); } if (event.key === 'Escape') setOtherOpen(false); }} placeholder="Scrie denumirea" maxLength={255} className="h-10 rounded-[10px]" />
                  <Button type="button" variant="outline" className="h-10 rounded-[10px]" onClick={addOther} disabled={!other.trim()}>Adaugă</Button>
                </div>
              )}
            </div>
          )}

          {entries.length > 0 && (
            <ul className="flex flex-col gap-2">
              {entries.map((entry, index) => {
                const detailFields = section.fields.filter((field) => !['name', 'relationship'].includes(field.key));
                const update = (patch: RecordEntry) => persist(entries.map((item, i) => (i === index ? { ...item, ...patch } : item)));
                const meta = [entry.relationship, typeLabel(section.fields, entry), entry.date || entry.period].filter(Boolean).join(' · ');
                return (
                  <li key={index} className="flex flex-col gap-1.5 rounded-xl border border-slate-200 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-slate-950">{String(entry.name ?? '')}</span>
                      {meta && <span className="shrink-0 text-xs text-slate-500">{meta}</span>}
                    </div>
                    <div className="flex gap-4 text-[13px] font-medium">
                      {detailFields.length > 0 && <button type="button" onClick={() => setOpenIndex(openIndex === index ? null : index)} className="text-blue-600 hover:underline">{openIndex === index ? 'Gata' : 'Adaugă detalii'}</button>}
                      <button type="button" onClick={() => persist(entries.filter((_, i) => i !== index), refusal, true)} className="text-slate-500 hover:text-red-600">Elimină</button>
                    </div>
                    {openIndex === index && <div className="mt-1.5 space-y-4 rounded-xl bg-slate-50 p-3"><DetailFields fields={detailFields} entry={entry} onChange={update} /></div>}
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

/** Câmpurile de detaliu ale unui element: liste ca butoane, data exactă sau aproximativă. */
function DetailFields({ fields, entry, onChange }: { fields: MedicalField[]; entry: RecordEntry; onChange: (patch: RecordEntry) => void }) {
  const hasDate = fields.some((field) => field.key === 'date');
  const hasPeriod = fields.some((field) => field.key === 'period');
  const [exact, setExact] = useState(Boolean(entry.date) || !hasPeriod);

  return (
    <>
      {hasDate && hasPeriod && (
        <div className="space-y-2">
          <ChipGroup label="Când a fost?" value={exact ? 'exact' : 'approx'} options={[['exact', 'Dată exactă'], ['approx', 'Aproximativ']]} onChange={(value) => setExact(value === 'exact')} />
          {exact
            ? <Input type="date" max={todayDate()} value={String(entry.date ?? '')} onChange={(event) => onChange({ date: event.target.value || null, period: null })} className="h-10 rounded-xl" />
            : <Input value={String(entry.period ?? '')} onChange={(event) => onChange({ period: event.target.value, date: null })} placeholder="Ex.: la 4 ani, în 2015" className="h-10 rounded-xl" />}
        </div>
      )}
      {fields.filter((field) => !(hasDate && hasPeriod && ['date', 'period'].includes(field.key))).map((field) => (
        <FieldInput key={field.key} field={field} value={entry[field.key]} onChange={(value) => onChange({ [field.key]: value })} />
      ))}
    </>
  );
}

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

  const markNothing = () => {
    setNothing(true);
    setValues({});
    void saveNow({ nothing_to_report: true });
  };

  const visible = section.fields.filter((field) => showAll || ['blood_group', 'rh'].includes(field.key));
  const medicationParts = String(values.long_term_medication ?? '').split(';').map((item) => item.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      {nothing && <p className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="h-4 w-4 shrink-0" />Secțiunea e marcată „Nimic de raportat”.</p>}
      {visible.map((field) => {
        if (sectionKey === 'lifestyle' && field.key === 'smoking') {
          return <ChipGroup key={field.key} label="Fumat" value={String(values.smoking ?? '')} options={[['Nu', 'Nu'], ['Am renunțat', 'Am renunțat'], ['Da', 'Da']]} onChange={(value) => update('smoking', value, true)} allowCustom />;
        }
        if (sectionKey === 'lifestyle' && field.key === 'alcohol') {
          return <ChipGroup key={field.key} label="Alcool" value={String(values.alcohol ?? '')} options={[['Nu', 'Nu'], ['Ocazional', 'Ocazional'], ['Regulat', 'Regulat']]} onChange={(value) => update('alcohol', value, true)} />;
        }
        if (sectionKey === 'lifestyle' && field.key === 'long_term_medication') {
          const toggle = (name: string) => update('long_term_medication', (medicationParts.includes(name) ? medicationParts.filter((item) => item !== name) : [...medicationParts, name]).join('; '), true);
          return (
            <div key={field.key} className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Medicamente luate des</p>
              <div className="flex flex-wrap gap-2">{MEDICATION_CHIPS.map((chip) => <Chip key={chip} selected={medicationParts.includes(chip)} onClick={() => toggle(chip)}>{chip}</Chip>)}</div>
              <Input value={medicationParts.filter((item) => !MEDICATION_CHIPS.includes(item)).join('; ')} onChange={(event) => update('long_term_medication', [...medicationParts.filter((item) => MEDICATION_CHIPS.includes(item)), event.target.value].filter(Boolean).join('; '))} placeholder="Altceva…" className="h-10 rounded-xl" />
            </div>
          );
        }
        if (field.type === 'number') {
          return <Stepper key={field.key} field={field} value={values[field.key]} onChange={(value) => update(field.key, value)} />;
        }
        return <FieldInput key={field.key} field={field} value={values[field.key]} onChange={(value) => update(field.key, value, field.type === 'select')} />;
      })}
      {adult && !showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="w-full rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600 hover:border-slate-400">
          <span className="font-semibold text-primary">Arată toate</span> (modul nașterii, termen, APGAR…)
          <span className="mt-1 block text-xs text-slate-500">La adulți, medicul are nevoie de obicei doar de grupa sangvină.</span>
        </button>
      )}
      {!nothing && <Button type="button" variant="ghost" className="text-slate-600" onClick={markNothing}>Nimic de raportat</Button>}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: MedicalField; value: unknown; onChange: (value: string | null) => void }) {
  const current = value === null || value === undefined ? '' : String(value);
  if (field.type === 'select' && field.options) {
    return field.options.length > 12
      ? (
        <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">{field.label}</span>
          <select value={current} onChange={(event) => onChange(event.target.value || null)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">
            <option value="">Necompletat</option>{field.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      )
      : <ChipGroup label={field.label} value={current} options={field.options} onChange={(next) => onChange(next === current ? null : next)} />;
  }
  if (field.type === 'textarea') {
    return <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">{field.label}</span><Textarea value={current} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} maxLength={4000} className="min-h-[72px] rounded-xl" /></label>;
  }
  return <label className="block space-y-2"><span className="text-sm font-medium text-slate-700">{field.label}</span><Input type={field.type === 'date' ? 'date' : 'text'} max={field.type === 'date' ? todayDate() : undefined} value={current} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} maxLength={255} className="h-10 rounded-xl" /></label>;
}

function Stepper({ field, value, onChange }: { field: MedicalField; value: unknown; onChange: (value: number | null) => void }) {
  const numeric = value === null || value === undefined || value === '' ? null : Number(value);
  const step = field.unit === 'g' ? 50 : 1;
  const clamp = (next: number) => Math.min(field.max ?? Infinity, Math.max(field.min ?? 0, next));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{field.label}</p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Mai puțin" onClick={() => onChange(clamp((numeric ?? field.min ?? 0) - step))}><Minus className="h-4 w-4" /></Button>
        <Input type="number" inputMode="decimal" value={numeric ?? ''} min={field.min} max={field.max} onChange={(event) => onChange(event.target.value === '' ? null : clamp(Number(event.target.value)))} className="h-10 w-28 rounded-xl text-center tabular-nums" />
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
      {allowCustom && (value === 'Da' || isCustom) && <Input value={value === 'Da' ? '' : value} onChange={(event) => onChange(event.target.value || 'Da')} placeholder="Câte pe zi, de câți ani" className="h-10 rounded-xl" />}
    </div>
  );
}

function Chip({ selected, onClick, children, role }: { selected: boolean; onClick: () => void; children: React.ReactNode; role?: string }) {
  return (
    <button type="button" role={role} aria-checked={role ? selected : undefined} aria-pressed={role ? undefined : selected} onClick={onClick}
      className={cn('inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-sm font-medium transition lg:h-[34px] lg:px-3 lg:text-[13px]', selected ? 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700' : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300')}>
      {children}
    </button>
  );
}

function typeLabel(fields: MedicalField[], entry: RecordEntry): string {
  const typeField = fields.find((field) => field.key === 'allergy_type');
  return typeField?.options?.find(([key]) => key === entry.allergy_type)?.[1] ?? '';
}
