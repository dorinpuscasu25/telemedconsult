import type { ReactNode } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';
import { cn } from '../ui/utils';

export type CatalogLocality = { id: number; name: string; type: string };
export type CatalogRegion = { id: number; name: string; type: string; country?: string; localities: CatalogLocality[] };

export type PatientBasics = {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  region_id: string;
  locality_id: string;
};

export const emptyPatientBasics: PatientBasics = {
  first_name: '',
  last_name: '',
  birth_date: '',
  gender: '',
  region_id: '',
  locality_id: ''
};

/** Cele 6 date cerute la adăugarea unui pacient. Adresa (strada) se cere doar la programarea cu examinare. */
export function isPatientBasicsComplete(value: PatientBasics): boolean {
  return Boolean(value.first_name.trim() && value.last_name.trim() && value.birth_date && value.gender && value.region_id && value.locality_id);
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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Prenume" htmlFor="pb-first-name">
        <Input id="pb-first-name" autoComplete="given-name" required value={value.first_name} onChange={(event) => set({ first_name: event.target.value })} className="h-11 rounded-xl" />
      </Field>
      <Field label="Nume" htmlFor="pb-last-name">
        <Input id="pb-last-name" autoComplete="family-name" required value={value.last_name} onChange={(event) => set({ last_name: event.target.value })} className="h-11 rounded-xl" />
      </Field>
      <Field label="Data nașterii" htmlFor="pb-birth-date">
        <Input id="pb-birth-date" type="date" required max={new Date().toISOString().slice(0, 10)} value={value.birth_date} onChange={(event) => set({ birth_date: event.target.value })} className="h-11 rounded-xl" />
      </Field>
      <div className="space-y-2">
        <Label id="pb-gender">Sex</Label>
        <div role="radiogroup" aria-labelledby="pb-gender" className="grid grid-cols-2 gap-2">
          {[{ id: 'M', label: 'Masculin' }, { id: 'F', label: 'Feminin' }].map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value.gender === option.id}
              onClick={() => set({ gender: option.id })}
              className={cn('h-11 rounded-xl border text-sm font-medium transition', value.gender === option.id ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-input bg-white text-slate-700 hover:border-slate-300')}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Raion / municipiu">
        <Select value={value.region_id} onValueChange={(regionId) => set({ region_id: regionId, locality_id: '' })}>
          <SelectTrigger className="h-11 rounded-xl">
            {region?.name || <span className="text-muted-foreground">Alege raionul</span>}
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {regions.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Localitate">
        <Select value={value.locality_id} onValueChange={(localityId) => set({ locality_id: localityId })} disabled={!region}>
          <SelectTrigger className="h-11 rounded-xl">
            {localityName || <span className="text-muted-foreground">{region ? 'Alege localitatea' : 'Alege întâi raionul'}</span>}
          </SelectTrigger>
          <SelectContent className="max-h-64 overflow-y-auto">
            {localities.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

/** Corpul cererii `POST /patient/profiles` din cele 6 câmpuri. */
export function patientBasicsPayload(value: PatientBasics) {
  return {
    first_name: value.first_name.trim(),
    last_name: value.last_name.trim(),
    birth_date: value.birth_date,
    gender: value.gender,
    region_id: Number(value.region_id),
    locality_id: Number(value.locality_id)
  };
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
