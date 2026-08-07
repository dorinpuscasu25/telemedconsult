import { useEffect, useMemo, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { apiRequest } from '../lib/api';

export interface ObjectiveField {
  key: string;
  label: string;
  unit: string | null;
  type: 'number' | 'text';
  min: number | null;
  max: number | null;
  group: string;
  group_label: string;
}

interface ObjectiveDataFormProps {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
}

/**
 * Formularul structurat al operatorului. Câmpurile vin din backend
 * (`/catalog/objective-fields`), aceeași sursă care validează valorile și care
 * definește ținta mapării pentru payload-urile din aparatul HIGO — deci o
 * măsurătoare notată manual ajunge în exact același câmp ca una măsurată.
 */
export function ObjectiveDataForm({ value, onChange }: ObjectiveDataFormProps) {
  const [fields, setFields] = useState<ObjectiveField[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ data: ObjectiveField[] }>('/catalog/objective-fields', { auth: false })
      .then((response) => setFields(response.data ?? []))
      .catch(() => setError('Nu am putut încărca lista de măsurători.'));
  }, []);

  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; fields: ObjectiveField[] }>();

    fields.forEach((field) => {
      const entry = grouped.get(field.group) ?? { label: field.group_label, fields: [] };
      entry.fields.push(field);
      grouped.set(field.group, entry);
    });

    return Array.from(grouped.values());
  }, [fields]);

  const setField = (key: string, next: string) => onChange({ ...value, [key]: next });

  const outOfRange = (field: ObjectiveField) => {
    const raw = value[field.key];
    if (field.type !== 'number' || !raw) return false;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return true;
    return (field.min != null && parsed < field.min) || (field.max != null && parsed > field.max);
  };

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.fields.map((field) =>
              field.type === 'number' ? (
                <div key={field.key}>
                  <Label className="text-xs text-slate-600">
                    {field.label}
                    {field.unit && <span className="text-slate-400"> ({field.unit})</span>}
                  </Label>
                  <Input
                    inputMode="decimal"
                    value={value[field.key] ?? ''}
                    onChange={(event) => setField(field.key, event.target.value)}
                    className={`rounded-xl ${outOfRange(field) ? 'border-red-300 bg-red-50' : ''}`}
                    placeholder={field.min != null ? `${field.min}–${field.max}` : ''}
                  />
                  {outOfRange(field) && (
                    <p className="mt-0.5 text-xs text-red-600">
                      Valoare în afara intervalului {field.min}–{field.max}.
                    </p>
                  )}
                </div>
              ) : (
                <div key={field.key} className="sm:col-span-2">
                  <Label className="text-xs text-slate-600">{field.label}</Label>
                  <Textarea
                    value={value[field.key] ?? ''}
                    onChange={(event) => setField(field.key, event.target.value)}
                    className="min-h-[64px] rounded-xl"
                  />
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Elimină câmpurile goale și trimite numerele ca numere. Intervalele rămân în
 * sarcina backendului, care le validează din aceeași schemă.
 */
export function toObjectivePayload(value: Record<string, string>) {
  const payload: Record<string, string | number> = {};

  Object.entries(value).forEach(([key, raw]) => {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') return;

    const asNumber = Number(trimmed);
    payload[key] = trimmed !== '' && !Number.isNaN(asNumber) ? asNumber : trimmed;
  });

  return payload;
}
