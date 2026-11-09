import { useRef, useState, type DragEvent } from 'react';
import { Camera, FileText, FileUp, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';
import { useDialogs } from '../../app/DialogProvider';
import { apiRequest } from '../../../lib/api';
import { dateOnly } from '../../../lib/format';
import { todayDate } from '../../../lib/medical-record';
import { ChipGroup } from './SectionEditor';

export type RecordDocument = { id: number; title: string; type: string; performed_at?: string | null; created_at: string; url?: string | null; mime_type?: string | null; notes?: string | null };

const TYPES: Array<[string, string]> = [['analysis', 'Analize de laborator'], ['imaging', 'Investigații imagistice'], ['functional', 'Investigații funcționale'], ['investigation', 'Alte investigații']];
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx';
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Documentele pacientului: încărcare din cameră sau din fișier. Denumirea vine din
 * numele fișierului și data e implicit azi, deci de obicei rămâne doar „Salvează”.
 */
export function DocumentsPanel({ profileId, documents, onChanged }: { profileId: number; documents: RecordDocument[]; onChanged: () => void }) {
  const dialogs = useDialogs();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('analysis');
  const [title, setTitle] = useState('');
  const [performedAt, setPerformedAt] = useState(todayDate());
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const pick = (picked?: File | null) => {
    if (!picked) return;
    if (picked.size > MAX_BYTES) { setError('Fișierul depășește 20 MB.'); return; }
    setError('');
    setFile(picked);
    setTitle(picked.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 255) || 'Document');
    setPerformedAt(todayDate());
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    if (fileInput.current) fileInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    setError('');
    const form = new FormData();
    form.append('type', type);
    form.append('title', title.trim() || 'Document');
    form.append('performed_at', performedAt);
    form.append('file', file);
    try {
      await apiRequest(`/patient/profiles/${profileId}/investigations`, { method: 'POST', body: form });
      reset();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca documentul.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: RecordDocument) => {
    if (!(await dialogs.confirm({ title: `Ștergi „${item.title}”?`, description: 'Fișierul se șterge definitiv din fișa pacientului.', confirmLabel: 'Șterge', tone: 'danger' }))) return;
    try {
      await apiRequest(`/patient/profiles/${profileId}/investigations/${item.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge documentul.');
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files?.[0]);
  };

  const groups = TYPES.map(([key, label]) => [label, documents.filter((item) => item.type === key)] as const).filter(([, items]) => items.length > 0);

  return (
    <div className="space-y-5">
      <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(event) => pick(event.target.files?.[0])} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => pick(event.target.files?.[0])} />

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!file ? (
        <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={cn('rounded-2xl border-2 border-dashed p-6 text-center transition', dragging ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50')}>
          <FileUp className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 hidden text-sm font-medium text-slate-700 sm:block">Trage fișierele aici</p>
          <p className="text-xs text-slate-500">PDF, JPG, PNG, DOC · până la 20 MB</p>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <Button type="button" className="sm:hidden" onClick={() => cameraInput.current?.click()}><Camera className="h-4 w-4" />Fă o poză</Button>
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>Alege fișier</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500">{file.type.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB · {file.type.startsWith('image/') ? 'imagine' : 'document'}</p>
            </div>
          </div>
          <ChipGroup label="Ce fel de document e?" value={type} options={TYPES} onChange={setType} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="doc-title">Denumire</Label><Input id="doc-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} className="h-10 rounded-xl" /></div>
            <div className="space-y-2"><Label htmlFor="doc-date">Data efectuării</Label><Input id="doc-date" type="date" max={todayDate()} value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} className="h-10 rounded-xl" /></div>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={saving || !title.trim() || !performedAt} onClick={() => void save()}>{saving ? 'Se încarcă…' : 'Salvează documentul'}</Button>
            <Button type="button" variant="ghost" onClick={reset}>Renunță</Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? <p className="text-center text-sm text-slate-500">Nu sunt documente încă.</p> : groups.map(([label, items]) => (
        <section key={label} className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">{label} · {items.length}</h4>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-[10px] font-semibold uppercase text-slate-500">{item.mime_type?.includes('pdf') ? 'PDF' : item.mime_type?.startsWith('image/') ? 'foto' : 'doc'}</span>
                <div className="min-w-0 flex-1">
                  {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-slate-900 hover:text-primary hover:underline">{item.title}</a> : <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>}
                  <p className="text-xs text-slate-500">{item.performed_at ? dateOnly(item.performed_at) : 'Dată neprecizată'}</p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Șterge ${item.title}`} onClick={() => void remove(item)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
