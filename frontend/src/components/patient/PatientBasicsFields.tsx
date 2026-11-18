import type { ReactNode } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';
import { cn } from '../ui/utils';
import { CountrySelect } from './CountrySelect';

export type CatalogLocality = { id: number; name: string; type: string };
export type CatalogRegion = { id: number; name: string; type: string; country?: string; localities: CatalogLocality[] };

export type PatientBasics = {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  region_id: string;
  locality_id: string;
  country_code: string;
  country: string;
  region: string;
  city: string;
  locality: string;
};

export const emptyPatientBasics: PatientBasics = {
  first_name: '',
  last_name: '',
  birth_date: '',
  gender: '',
  region_id: '',
  locality_id: '', country_code: 'MD', country: 'Republica Moldova', region: '', city: '', locality: ''
};

/** Adresa stradală se cere doar la programarea cu examinare. */
export function isPatientBasicsComplete(value: PatientBasics): boolean {
  return Boolean(value.first_name.trim() && value.last_name.trim() && value.birth_date && value.gender && value.country_code && (value.country_code === 'MD' ? value.region_id && value.locality_id : value.locality.trim()));
}

export function PatientBasicsFields({ value, onChange, regions }: {
  value: PatientBasics;
  onChange: (next: PatientBasics) => void;
  regions: CatalogRegion[];
}) {
  const region = regions.find((item) => String(item.id) === value.region_id);
  const localities = region?.localities ?? [];
  const localityName = localities.find((item) => String(item.id) === value.locality_id)?.name;
  const set = (patch: Partial<PatientBasics>) => onChange({ ...value, ...patch });

  const input = 'h-11 rounded-[10px] border-slate-200 bg-white px-3 text-[15px] lg:h-[42px] lg:text-sm';
  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-[22px] lg:gap-4">
      <Field label="Prenume" htmlFor="pb-first-name">
        <Input id="pb-first-name" autoComplete="given-name" required placeholder="Prenume" value={value.first_name} onChange={(event) => set({ first_name: event.target.value })} className={input} />
      </Field>
      <Field label="Nume" htmlFor="pb-last-name">
        <Input id="pb-last-name" autoComplete="family-name" required placeholder="Nume" value={value.last_name} onChange={(event) => set({ last_name: event.target.value })} className={input} />
      </Field>
      <Field label="Data nașterii" htmlFor="pb-birth-date" wide>
        <Input id="pb-birth-date" type="date" required max={new Date().toISOString().slice(0, 10)} value={value.birth_date} onChange={(event) => set({ birth_date: event.target.value })} className={cn(input, !value.birth_date && 'text-slate-400')} />
      </Field>
      <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
        <span id="pb-gender" className="text-sm font-medium text-slate-950">Sex</span>
        <div role="radiogroup" aria-labelledby="pb-gender" className="grid grid-cols-2 gap-2">
          {[{ id: 'M', label: 'Masculin' }, { id: 'F', label: 'Feminin' }].map((option) => {
            const on = value.gender === option.id;
            return (
              <button key={option.id} type="button" role="radio" aria-checked={on} onClick={() => set({ gender: option.id })}
                className={cn('flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-left text-[15px] text-slate-950 lg:h-[42px] lg:text-sm', on ? 'border-[1.5px] border-blue-600 bg-blue-50' : 'border border-slate-200 bg-white hover:border-slate-300')}>
                <span className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] lg:h-4 lg:w-4', on ? 'border-blue-600' : 'border-slate-300')}>{on && <span className="h-2 w-2 rounded-full bg-blue-600 lg:h-[7px] lg:w-[7px]" />}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Țara de trai" wide>
        <CountrySelect value={value.country_code} label={value.country} onChange={(country_code, country) => set({ country_code, country, region_id: '', locality_id: '', region: '', city: '', locality: '' })} className={input} />
      </Field>
      {value.country_code === 'MD' ? <><Field label="Raion / municipiu" wide>
        <Select value={value.region_id} onValueChange={(regionId) => set({ region_id: regionId, locality_id: '' })}>
          <SelectTrigger className={input}>
            {region?.name || <span className="text-slate-400">Alege raionul</span>}
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {regions.filter((item) => !item.country || ['Republica Moldova', 'Moldova', 'MD'].includes(item.country)).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Localitate" wide>
        <Select value={value.locality_id} onValueChange={(localityId) => set({ locality_id: localityId })} disabled={!region}>
          <SelectTrigger className={input}>
            {localityName || <span className="text-slate-400">{region ? 'Alege localitatea' : 'Alege întâi raionul'}</span>}
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {localities.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      </> : <>
        <Field label="Regiune / district (opțional)" wide><Input value={value.region} onChange={(event) => set({ region: event.target.value })} maxLength={120} className={input} /></Field>
        <Field label="Oraș (opțional)" wide><Input value={value.city} onChange={(event) => set({ city: event.target.value })} maxLength={120} className={input} /></Field>
        <Field label="Localitate" wide><Input required value={value.locality} onChange={(event) => set({ locality: event.target.value })} maxLength={120} className={input} /></Field>
      </>}
    </div>
  );
}

/** Corpul cererii `POST /patient/profiles`. */
export function patientBasicsPayload(value: PatientBasics) {
  return {
    first_name: value.first_name.trim(),
    last_name: value.last_name.trim(),
    birth_date: value.birth_date,
    gender: value.gender,
    country_code: value.country_code,
    ...(value.country_code === 'MD' ? { region_id: Number(value.region_id), locality_id: Number(value.locality_id) }
      : { region: value.region.trim() || null, city: value.city.trim() || null, locality: value.locality.trim() })
  };
}

function Field({ label, htmlFor, wide = false, children }: { label: string; htmlFor?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', wide ? 'col-span-2 lg:col-span-1' : 'col-span-1')}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-slate-950">{label}</Label>
      {children}
    </div>
  );
}
