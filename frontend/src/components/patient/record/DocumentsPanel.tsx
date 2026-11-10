import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Camera, Trash2, Upload } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { cn } from '../../ui/utils';
import { useDialogs } from '../../app/DialogProvider';
import { apiRequest } from '../../../lib/api';
import { todayDate } from '../../../lib/medical-record';

export type RecordDocument = { id: number; title: string; type: string; performed_at?: string | null; created_at: string; url?: string | null; mime_type?: string | null; notes?: string | null };

const TYPES: Array<[string, string]> = [['analysis', 'Analize de laborator'], ['imaging', 'Imagistică'], ['functional', 'Funcționale'], ['investigation', 'Altele']];
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
  const countLabel = (count: number) => `${count} ${count === 1 ? 'document' : 'documente'}`;
  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(event) => pick(event.target.files?.[0])} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => pick(event.target.files?.[0])} />

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* D5a: două butoane pe telefon. D5c: zona de tragere pe desktop. */}
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        <button type="button" onClick={() => cameraInput.current?.click()} className="flex h-[52px] items-center justify-center gap-2 rounded-xl bg-blue-600 text-[15px] font-semibold text-white"><Camera className="h-5 w-5" />Fă o poză</button>
        <button type="button" onClick={() => fileInput.current?.click()} className="flex h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[15px] font-medium text-slate-950"><Upload className="h-5 w-5" />Alege fișier</button>
      </div>
      <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        className={cn('hidden items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-7 lg:flex', dragging ? 'border-blue-600 bg-blue-100' : 'border-blue-300 bg-blue-50')}>
        <Upload className="h-7 w-7 text-blue-600" />
        <span className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold text-blue-900">Trage fișierele aici</span><span className="text-[13px] text-slate-600">PDF, JPG, PNG, DOC · până la 20 MB</span></span>
        <button type="button" onClick={() => fileInput.current?.click()} className="ml-3 h-10 rounded-[10px] border border-blue-200 bg-white px-4 text-sm font-medium text-blue-700 hover:bg-blue-50">Alege fișier</button>
      </div>

      {groups.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nu sunt documente încă.</p> : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start">
          {groups.map(([label, items]) => (
            <section key={label} className="flex flex-col gap-2 lg:gap-2.5">
              <div className="flex justify-between px-1 lg:px-0">
                <span className="text-[13px] font-semibold text-slate-600">{label}<span className="hidden lg:inline"> · {countLabel(items.length)}</span></span>
                <span className="text-xs text-slate-400 lg:hidden">{countLabel(items.length)}</span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:contents">
                {items.map((item, index) => {
                  const kind = kindOf(item);
                  const thumb = kind === 'PDF' ? 'bg-red-50 text-red-700' : 'bg-[repeating-linear-gradient(135deg,#F1F5F9_0_8px,#E2E8F0_8px_16px)] text-slate-500';
                  const body = (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-sm font-medium text-slate-950">{item.title}</span><span className="text-xs text-slate-500">{item.performed_at ? shortDate(item.performed_at) : 'Dată neprecizată'}</span></span>
                      <button type="button" aria-label={`Șterge ${item.title}`} onClick={(event) => { event.preventDefault(); void remove(item); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </>
                  );
                  return (
                    <li key={item.id} className={cn('lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white', index > 0 && 'border-t border-slate-100 lg:border-t')}>
                      <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5 lg:hidden">
                        <span className={cn('grid h-[52px] w-11 shrink-0 place-items-center rounded-lg text-[10px] font-bold', thumb)}>{kind}</span>
                        {body}
                      </a>
                      <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="hidden lg:block">
                        <span className={cn('grid h-[110px] place-items-center font-mono text-xs font-semibold', thumb)}>{kind}</span>
                        <span className="flex items-center gap-2 px-3 py-2.5">{body}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* D5b: după alegerea fișierului, o foaie de jos (pe desktop, o fereastră). */}
      {file && (
        <div className="fixed inset-0 z-[60] flex items-end lg:items-center lg:justify-center" role="dialog" aria-label="Salvează documentul">
          <button type="button" aria-label="Renunță" onClick={reset} className="absolute inset-0 bg-slate-900/45" />
          <div className="relative flex w-full flex-col gap-[18px] rounded-t-[20px] bg-white px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-2.5 lg:w-[480px] lg:rounded-2xl lg:p-6">
            <span className="h-1 w-10 self-center rounded-sm bg-slate-200 lg:hidden" />
            <div className="flex items-center gap-3">
              {preview
                ? <img src={preview} alt="" className="h-20 w-16 shrink-0 rounded-[10px] object-cover" />
                : <span className="grid h-20 w-16 shrink-0 place-items-center rounded-[10px] bg-red-50 text-[11px] font-bold text-red-700">{file.name.split('.').pop()?.toUpperCase().slice(0, 4)}</span>}
              <span className="flex min-w-0 flex-col gap-0.5"><span className="truncate text-[15px] font-semibold text-slate-950">{file.name}</span><span className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB · {file.type.startsWith('image/') ? 'imagine' : 'document'}</span></span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate-950">Ce fel de document e?</span>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map(([key, label]) => <button key={key} type="button" aria-pressed={type === key} onClick={() => setType(key)} className={cn('h-[38px] rounded-full px-3.5 text-sm font-medium', type === key ? 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700' : 'border border-slate-200 bg-white text-slate-950')}>{label}</button>)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="doc-title" className="text-[13px] font-medium text-slate-950">Denumire</Label><Input id="doc-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} className="h-11 rounded-[10px] text-[15px]" /></div>
            <div className="flex flex-col gap-1.5"><Label htmlFor="doc-date" className="text-[13px] font-medium text-slate-950">Data efectuării</Label><Input id="doc-date" type="date" max={todayDate()} value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} className="h-11 rounded-[10px] text-[15px]" /></div>
            <button type="button" disabled={saving || !title.trim() || !performedAt} onClick={() => void save()} className="h-12 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Se încarcă…' : 'Salvează documentul'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function kindOf(item: RecordDocument): string {
  if (item.mime_type?.includes('pdf') || /\.pdf$/i.test(item.url ?? '')) return 'PDF';
  if (item.mime_type?.startsWith('image/')) return (item.mime_type.split('/')[1] ?? 'IMG').replace('jpeg', 'jpg').toUpperCase();
  return 'DOC';
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Chisinau' }).replace('.', '');
}
