import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { cn } from '../../ui/utils';
import { apiRequest } from '../../../lib/api';
import { patientAge, todayDate } from '../../../lib/medical-record';
import type { CatalogRegion } from '../PatientBasicsFields';

export interface PersonalProfile {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  residential_environment?: string | null;
  region_id?: number | null;
  locality_id?: number | null;
  address?: string | null;
  address_details?: Record<string, string | null> | null;
  emergency_contact?: string | null;
  pseudonymized?: boolean;
}

type FormState = {
  first_name: string; last_name: string; birth_date: string; gender: string; residential_environment: string;
  region_id: string; locality_id: string; address: string;
  building: string; entrance: string; apartment: string; floor: string;
  emergency_name: string; emergency_phone: string; pseudonymized: boolean;
};

const CONTACT_SEPARATOR = ' · ';

function initialState(profile: PersonalProfile): FormState {
  const [emergencyName = '', emergencyPhone = ''] = (profile.emergency_contact ?? '').split(CONTACT_SEPARATOR);
  const details = profile.address_details ?? {};
  return {
    first_name: profile.first_name ?? '', last_name: profile.last_name ?? '', birth_date: (profile.birth_date ?? '').slice(0, 10),
    gender: profile.gender ?? '', residential_environment: profile.residential_environment ?? '',
    region_id: profile.region_id ? String(profile.region_id) : '', locality_id: profile.locality_id ? String(profile.locality_id) : '',
    address: profile.address ?? '', building: details.building ?? '', entrance: details.entrance ?? '', apartment: details.apartment ?? '', floor: details.floor ?? '',
    emergency_name: emergencyName, emergency_phone: emergencyPhone, pseudonymized: Boolean(profile.pseudonymized)
  };
}

/** Date personale în trei blocuri (identitate, adresă, contact de urgență), salvate automat. */
export function PersonalDataForm({ profile, regions, onSaved }: { profile: PersonalProfile; regions: CatalogRegion[]; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(() => initialState(profile));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const save = async (next: FormState) => {
    if (!next.first_name.trim() || !next.last_name.trim()) { setSaveState('error'); setError('Prenumele și numele sunt obligatorii.'); return; }
    setSaveState('saving');
    setError('');
    try {
      await apiRequest(`/patient/profiles/${profile.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          first_name: next.first_name.trim(), last_name: next.last_name.trim(),
          birth_date: next.birth_date || null, gender: next.gender || null, residential_environment: next.residential_environment || null,
          region_id: next.region_id ? Number(next.region_id) : null, locality_id: next.locality_id ? Number(next.locality_id) : null,
          address: next.address.trim() || null,
          address_details: { building: next.building || null, entrance: next.entrance || null, apartment: next.apartment || null, floor: next.floor || null },
          emergency_contact: [next.emergency_name.trim(), next.emergency_phone.trim()].filter(Boolean).join(CONTACT_SEPARATOR) || null,
          pseudonymized: next.pseudonymized
        })
      });
      setSaveState('saved');
      onSaved();
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Nu am putut salva.');
    }
  };

  const update = (patch: Partial<FormState>, immediate = false) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (timer.current) window.clearTimeout(timer.current);
    setSaveState('saving');
    timer.current = window.setTimeout(() => { void save(next); }, immediate ? 0 : 800);
  };

  const region = regions.find((item) => String(item.id) === form.region_id);
  const shortName = `${form.first_name || 'Pacient'} ${form.last_name ? `${form.last_name.charAt(0)}.` : ''}`.trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[17px] font-semibold text-slate-950">Date personale</h3>
        <span className={cn('text-xs', saveState === 'saved' ? 'text-green-600' : saveState === 'error' ? 'text-red-600' : 'text-slate-500')} aria-live="polite">
          {saveState === 'saved' ? '✓ Salvat' : saveState === 'error' ? 'Nesalvat' : saveState === 'saving' ? 'Se salvează…' : ''}
        </span>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-2.5">
        <TextField id="pd-first" label="Prenume" value={form.first_name} onChange={(value) => update({ first_name: value })} />
        <TextField id="pd-last" label="Nume" value={form.last_name} onChange={(value) => update({ last_name: value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="pd-birth">Data nașterii</FieldLabel>
        <label className="flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-white pl-3 pr-3 focus-within:border-blue-600 focus-within:ring-[3px] focus-within:ring-blue-600/15">
          <input id="pd-birth" type="date" max={todayDate()} value={form.birth_date} onChange={(event) => update({ birth_date: event.target.value })} className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          {form.birth_date && <span className="shrink-0 text-[13px] text-slate-500">{patientAge(form.birth_date)}</span>}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1.5"><FieldLabel>Sex</FieldLabel><Segmented value={form.gender} options={[['M', 'M'], ['F', 'F']]} onChange={(value) => update({ gender: value }, true)} /></div>
        <div className="flex flex-col gap-1.5"><FieldLabel>Mediul de trai</FieldLabel><Segmented value={form.residential_environment} options={[['urban', 'Urban'], ['rural', 'Rural']]} onChange={(value) => update({ residential_environment: value }, true)} /></div>
      </div>

      <div className="my-1 h-px bg-slate-100" />
      <span className="text-[15px] font-semibold text-slate-950">Adresa</span>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Raion / municipiu</FieldLabel>
        <SearchSelect value={form.region_id} options={regions.map((item) => [String(item.id), item.name])} placeholder="Alege raionul" onChange={(value) => update({ region_id: value, locality_id: '' })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Localitate</FieldLabel>
        <SearchSelect value={form.locality_id} options={(region?.localities ?? []).map((item) => [String(item.id), item.name])} placeholder={region ? 'Alege localitatea' : 'Alege întâi raionul'} disabled={!region} onChange={(value) => update({ locality_id: value }, true)} />
      </div>
      <TextField id="pd-street" label="Strada și numărul" value={form.address} onChange={(value) => update({ address: value })} placeholder="str. Cartușa 12" />
      <div className="grid grid-cols-4 gap-2">
        <SmallField id="pd-building" label="Bloc" value={form.building} onChange={(value) => update({ building: value })} />
        <SmallField id="pd-entrance" label="Scară" value={form.entrance} onChange={(value) => update({ entrance: value })} />
        <SmallField id="pd-apartment" label="Ap." value={form.apartment} onChange={(value) => update({ apartment: value })} />
        <SmallField id="pd-floor" label="Etaj" value={form.floor} onChange={(value) => update({ floor: value })} />
      </div>

      <div className="my-1 h-px bg-slate-100" />
      <span className="text-[15px] font-semibold text-slate-950">Contact de urgență</span>
      <div className="grid grid-cols-2 gap-2.5">
        <TextField id="pd-em-name" label="Nume" value={form.emergency_name} onChange={(value) => update({ emergency_name: value })} />
        <TextField id="pd-em-phone" label="Telefon" type="tel" value={form.emergency_phone} onChange={(value) => update({ emergency_phone: value })} placeholder="+373 69 …" />
      </div>

      <label className="mt-1 flex cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium leading-[1.35] text-slate-950">Folosește numele prescurtat în chat, liste și documente</span>
          <span className="text-[13px] text-slate-500">Apare ca: <b className="text-slate-950">{form.pseudonymized ? shortName : `${form.first_name} ${form.last_name}`.trim()}</b></span>
        </span>
        <Switch checked={form.pseudonymized} onCheckedChange={(checked: boolean) => update({ pseudonymized: checked }, true)} aria-label="Nume prescurtat" />
      </label>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return <Label htmlFor={htmlFor} className="text-[13px] font-medium text-slate-950">{children}</Label>;
}

function Segmented({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-[10px] bg-slate-100 p-[3px]" role="radiogroup">
      {options.map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={cn('h-[38px] rounded-lg text-[13px]', value === key ? 'bg-white font-medium text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>{label}</button>
      ))}
    </div>
  );
}

/** Listă cu căutare: scrii câteva litere, alegi din rezultate (raion, localitate). */
function SearchSelect({ value, options, placeholder, onChange, disabled = false }: { value: string; options: Array<[string, string]>; placeholder: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(([key]) => key === value)?.[1] ?? '';
  const needle = query.trim().toLocaleLowerCase('ro');
  const results = options.filter(([, label]) => label.toLocaleLowerCase('ro').includes(needle)).slice(0, 8);
  const pick = (key: string) => { onChange(key); setOpen(false); setQuery(''); };

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="flex h-11 items-center justify-between rounded-[10px] border border-slate-200 bg-white px-3 text-left text-[15px] disabled:opacity-50">
        {selected ? <span className="text-slate-950">{selected}</span> : <span className="text-slate-400">{placeholder}</span>}
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
    );
  }
  return (
    <div className="overflow-hidden rounded-[10px] border-2 border-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,.15)]" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
      <label className="flex h-[42px] items-center gap-2 border-b border-slate-100 px-[11px]">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'Enter' && results[0]) { event.preventDefault(); pick(results[0][0]); } }} placeholder="Caută" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
      </label>
      <ul className="max-h-56 overflow-y-auto">
        {results.map(([key, label]) => {
          const index = needle ? label.toLocaleLowerCase('ro').indexOf(needle) : -1;
          return (
            <li key={key}>
              <button type="button" onClick={() => pick(key)} className={cn('w-full px-3 py-2.5 text-left text-sm', key === value || (index === 0 && results[0][0] === key) ? 'bg-blue-50 text-slate-950' : 'text-slate-600 hover:bg-slate-50')}>
                {index >= 0 ? <>{label.slice(0, index)}<b>{label.slice(index, index + needle.length)}</b>{label.slice(index + needle.length)}</> : label}
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="px-3 py-2.5 text-sm text-slate-500">Nimic găsit</li>}
      </ul>
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, type = 'text' }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={255} className="h-11 rounded-[10px] text-[15px]" />
    </div>
  );
}

function SmallField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-slate-600">{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={20} className="h-11 rounded-[10px] text-center text-[15px]" />
    </div>
  );
}
