import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Button } from './ui/button';
import { MedicalInput } from './PatientMedicalRecord';

type ClinicalParameter = { id: number; key: string; label: string; unit?: string | null; type: string; min?: number | null; max?: number | null; group: string; is_active: boolean };
const blank = { label: '', unit: '', type: 'number', min: '', max: '', group: 'exam' };
export function ClinicalParametersPanel() {
  const [items, setItems] = useState<ClinicalParameter[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<ClinicalParameter | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = () => apiRequest<{ data: ClinicalParameter[] }>('/admin/clinical-parameters').then((data) => setItems(data.data));
  useEffect(() => { load().catch(() => setError('Nu am putut încărca parametrii clinici.')); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const key = editing?.key ?? `custom_${form.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '')}`;
      await apiRequest(editing ? `/admin/clinical-parameters/${editing.id}` : '/admin/clinical-parameters', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, key, min: form.type === 'number' && form.min !== '' ? Number(form.min) : null, max: form.type === 'number' && form.max !== '' ? Number(form.max) : null, is_active: editing?.is_active ?? true }) });
      setOpen(false); setEditing(null); setForm(blank); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Nu am putut salva parametrul.'); }
    finally { setSaving(false); }
  };
  const toggle = async (item: ClinicalParameter) => {
    setSaving(true); setError('');
    try { await apiRequest(`/admin/clinical-parameters/${item.id}`, { method: 'PUT', body: JSON.stringify({ ...item, is_active: !item.is_active }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nu am putut actualiza parametrul.'); }
    finally { setSaving(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Parametri clinici suplimentari</h2><p className="mt-1 text-sm text-slate-500">Parametrii adăugați apar în formularele de date obiective ale pacientului și operatorului.</p></div><Button type="button" disabled={saving} onClick={() => { setEditing(null); setForm(blank); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Adaugă parametru clinic</Button></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {open && <form onSubmit={save} className="space-y-4 rounded-xl bg-slate-50 p-4"><fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
      <MedicalInput field={{ key: 'label', label: 'Denumirea parametrului', required: true }} value={form.label} onChange={(label) => setForm({ ...form, label })} />
      <MedicalInput field={{ key: 'type', label: 'Tipul valorii', required: true, type: 'select', options: [['number', 'Număr'], ['text', 'Text / observație']] }} value={form.type} onChange={(type) => setForm({ ...form, type })} />
      <MedicalInput field={{ key: 'unit', label: 'Unitatea de măsură', placeholder: 'De exemplu: cm, kg, mmHg' }} value={form.unit} onChange={(unit) => setForm({ ...form, unit })} />
      <MedicalInput field={{ key: 'group', label: 'Compartiment', required: true, type: 'select', options: [['vitals', 'Semne vitale'], ['anthropometry', 'Măsurători'], ['exam', 'Examinare']] }} value={form.group} onChange={(group) => setForm({ ...form, group })} />
      {form.type === 'number' && <><MedicalInput field={{ key: 'min', label: 'Valoarea minimă (opțional)', type: 'number' }} value={form.min} onChange={(min) => setForm({ ...form, min })} /><MedicalInput field={{ key: 'max', label: 'Valoarea maximă (opțional)', type: 'number' }} value={form.max} onChange={(max) => setForm({ ...form, max })} /></>}
      <div className="flex gap-2 sm:col-span-2"><Button disabled={saving}>Salvează parametrul</Button><Button variant="outline" type="button" onClick={() => setOpen(false)}>Anulare</Button></div>
    </fieldset></form>}
    {!items.length && !open && <p className="text-sm text-slate-500">Măsurătorile standard sunt disponibile deja. Poți adăuga aici alți parametri.</p>}
    {items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{item.label}{item.unit ? ` (${item.unit})` : ''}</p><p className="text-xs text-slate-500">{item.type === 'number' ? 'Numeric' : 'Text'} · {item.is_active ? 'Activ' : 'Inactiv'}</p></div><div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={() => { setEditing(item); setForm({ label: item.label, unit: item.unit ?? '', type: item.type, min: item.min == null ? '' : String(item.min), max: item.max == null ? '' : String(item.max), group: item.group }); setOpen(true); }}>Editează</Button><Button variant="outline" disabled={saving} onClick={() => void toggle(item)}>{item.is_active ? 'Dezactivează' : 'Activează'}</Button></div></div>)}
  </section>;
}
