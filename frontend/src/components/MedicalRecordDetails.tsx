import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { dateOnly } from '../lib/format';
import { MEDICAL_SECTIONS, medicalFieldValue, type MedicalRecord, type RecordEntry } from '../lib/medical-record';

export interface MedicalDocumentSummary { id: number; title: string; type: string; performed_at?: string | null; url?: string | null; notes?: string | null }

export function MedicalRecordDetails({ record, documents = [] }: { record?: MedicalRecord | null; documents?: MedicalDocumentSummary[] }) {
  const sections = MEDICAL_SECTIONS.filter((section) => {
    const value = record?.[section.key];
    if (!value) return false;
    if (section.key === 'vaccinations') {
      const vaccination = value as { refusal?: string; items?: RecordEntry[] };
      return Boolean(vaccination.items?.length || (vaccination.refusal && vaccination.refusal !== 'unknown'));
    }
    return Array.isArray(value) ? value.length > 0 : Object.values(value).some((item) => item !== null && item !== '');
  });
  return <div className="space-y-3">
    {!sections.length && <p className="text-sm text-slate-400">Pacientul nu a completat încă antecedentele structurate.</p>}
    {sections.map((section) => {
      const vaccination = record?.vaccinations as { refusal?: string; items?: RecordEntry[] } | undefined;
      const data = record?.[section.key];
      const entries = section.key === 'vaccinations' ? vaccination?.items ?? [] : Array.isArray(data) ? data : [data as RecordEntry];
      const refusal = { categorical: 'Refuz categoric de vaccinare', temporary: 'Refuz temporar de vaccinare', none: 'Fără refuz declarat' }[vaccination?.refusal ?? ''];
      return <details key={section.key} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{section.title}{section.repeated ? ` (${entries.length})` : ''}</summary>
        <div className="mt-3 space-y-3">{section.key === 'vaccinations' && refusal && <p className="text-sm font-medium">{refusal}</p>}
          {entries.map((entry, index) => <dl key={index} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">{section.fields.map((field) => {
            const display = medicalFieldValue(field, entry?.[field.key]);
            return display ? <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}><dt className="text-xs text-slate-500">{field.label}</dt><dd className="whitespace-pre-wrap text-sm text-slate-800">{display}</dd></div> : null;
          })}</dl>)}
        </div>
      </details>;
    })}
    {(['investigation', 'analysis', 'imaging', 'functional', 'clinical'] as const).map((type) => {
      const items = documents.filter((doc) => type === 'clinical' ? !['investigation', 'analysis', 'imaging', 'functional'].includes(doc.type) : doc.type === type);
      if (!items.length) return null;
      return <details key={type} className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">{type === 'imaging' ? 'Investigații imagistice' : type === 'functional' ? 'Investigații funcționale' : type === 'analysis' ? 'Analize de laborator' : type === 'clinical' ? 'Fotografii clinice' : 'Investigații'} ({items.length})</summary><div className="mt-3 space-y-3">{items.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{item.title}</p><p className="text-xs text-slate-500">{item.performed_at ? dateOnly(item.performed_at) : 'Data efectuării neprecizată'}</p>{item.notes && <p className="mt-1 whitespace-pre-wrap">{item.notes}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-blue-700">Deschide documentul</a>}</div>)}</div></details>;
    })}
  </div>;
}

export function MedicalConsultationHistory({ profileId }: { profileId: string | number }) {
  const [items, setItems] = useState<Array<{ id: number; date: string; doctor?: string; diagnosis?: string; recommendations?: string; symptoms?: string }> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (loading || items) return;
    setLoading(true); setError('');
    try { const data = await apiRequest<{ consultations: NonNullable<typeof items> }>(`/patient/profiles/${profileId}/medical-record`); setItems(data.consultations); }
    catch (err) { setError(err instanceof Error ? err.message : 'Istoricul nu a putut fi încărcat.'); }
    finally { setLoading(false); }
  };
  return <details className="rounded-xl border p-3" onToggle={(event) => { if (event.currentTarget.open) void load(); }}><summary className="cursor-pointer text-sm font-semibold">Istoricul consultațiilor pacientului</summary><div className="mt-3 space-y-3">{loading && <p className="text-sm text-slate-500">Se încarcă...</p>}{error && <p className="text-sm text-red-600">{error}</p>}{items?.length === 0 && <p className="text-sm text-slate-500">Fără consultații.</p>}{items?.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{dateOnly(item.date)} · {item.doctor ?? 'Medic neatribuit'}</p>{item.symptoms && <p className="mt-2 whitespace-pre-wrap"><strong>Simptome: </strong>{item.symptoms}</p>}{item.diagnosis && <p className="mt-2 whitespace-pre-wrap"><strong>Diagnostic: </strong>{item.diagnosis}</p>}{item.recommendations && <p className="mt-2 whitespace-pre-wrap"><strong>Recomandări: </strong>{item.recommendations}</p>}</div>)}</div></details>;
}
