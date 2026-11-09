import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { cn } from '../../ui/utils';
import { apiRequest } from '../../../lib/api';
import { patientAge, todayDate } from '../../../lib/medical-record';
import type { CatalogRegion } from '../PatientBasicsFields';
import { ChipGroup } from './SectionEditor';

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
  const locality = region?.localities.find((item) => String(item.id) === form.locality_id);
  const shortName = `${form.first_name || 'Pacient'} ${form.last_name ? `${form.last_name.charAt(0)}.` : ''}`.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">Date personale</h3>
        {saveState !== 'idle' && (
          <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', saveState === 'saved' ? 'bg-emerald-50 text-emerald-700' : saveState === 'error' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600')} aria-live="polite">
            {saveState === 'saved' ? <><Check className="h-3.5 w-3.5" />Salvat</> : saveState === 'error' ? 'Nesalvat' : 'Se salvează…'}
          </span>
        )}
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Block title="Identitate">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="pd-first" label="Prenume" value={form.first_name} onChange={(value) => update({ first_name: value })} />
          <TextField id="pd-last" label="Nume" value={form.last_name} onChange={(value) => update({ last_name: value })} />
          <div className="space-y-2">
            <Label htmlFor="pd-birth">Data nașterii</Label>
            <div className="flex items-center gap-3">
              <Input id="pd-birth" type="date" max={todayDate()} value={form.birth_date} onChange={(event) => update({ birth_date: event.target.value })} className="h-10 rounded-xl" />
              {form.birth_date && <span className="shrink-0 text-sm text-slate-500">{patientAge(form.birth_date)}</span>}
            </div>
          </div>
          <ChipGroup label="Sex" value={form.gender} options={[['M', 'M'], ['F', 'F']]} onChange={(value) => update({ gender: value }, true)} />
          <ChipGroup label="Mediul de trai" value={form.residential_environment} options={[['urban', 'Urban'], ['rural', 'Rural']]} onChange={(value) => update({ residential_environment: value }, true)} />
        </div>
      </Block>

      <Block title="Adresa">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Raion / municipiu</Label>
            <Select value={form.region_id} onValueChange={(value) => update({ region_id: value, locality_id: '' })}>
              <SelectTrigger className="h-10 rounded-xl">{region?.name ?? <span className="text-muted-foreground">Alege raionul</span>}</SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">{regions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Localitate</Label>
            <Select value={form.locality_id} onValueChange={(value) => update({ locality_id: value }, true)} disabled={!region}>
              <SelectTrigger className="h-10 rounded-xl">{locality?.name ?? <span className="text-muted-foreground">{region ? 'Alege localitatea' : 'Alege întâi raionul'}</span>}</SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">{(region?.localities ?? []).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><TextField id="pd-street" label="Strada și numărul" value={form.address} onChange={(value) => update({ address: value })} placeholder="str. Cartușa 12" /></div>
          <div className="grid grid-cols-4 gap-2 sm:col-span-2">
            <TextField id="pd-building" label="Bloc" value={form.building} onChange={(value) => update({ building: value })} />
            <TextField id="pd-entrance" label="Scară" value={form.entrance} onChange={(value) => update({ entrance: value })} />
            <TextField id="pd-apartment" label="Ap." value={form.apartment} onChange={(value) => update({ apartment: value })} />
            <TextField id="pd-floor" label="Etaj" value={form.floor} onChange={(value) => update({ floor: value })} />
          </div>
        </div>
      </Block>

      <Block title="Contact de urgență">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="pd-em-name" label="Nume" value={form.emergency_name} onChange={(value) => update({ emergency_name: value })} />
          <TextField id="pd-em-phone" label="Telefon" type="tel" value={form.emergency_phone} onChange={(value) => update({ emergency_phone: value })} placeholder="+373 69 …" />
        </div>
      </Block>

      <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
        <span>
          <span className="block text-sm font-medium text-slate-900">Folosește numele prescurtat în chat, liste și documente</span>
          <span className="block text-xs text-slate-500">Apare ca: {form.pseudonymized ? shortName : `${form.first_name} ${form.last_name}`.trim()}</span>
        </span>
        <Switch checked={form.pseudonymized} onCheckedChange={(checked: boolean) => update({ pseudonymized: checked }, true)} aria-label="Nume prescurtat" />
      </label>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h4>{children}</section>;
}

function TextField({ id, label, value, onChange, placeholder, type = 'text' }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={255} className="h-10 rounded-xl" />
    </div>
  );
}
