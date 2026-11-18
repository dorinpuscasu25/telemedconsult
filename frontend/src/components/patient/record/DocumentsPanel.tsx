import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Activity, Camera, Files, FlaskConical, Loader2, ScanLine, Trash2, Upload } from 'lucide-react';
import { cn } from '../../ui/utils';
import { useDialogs } from '../../app/DialogProvider';
import { apiRequest } from '../../../lib/api';
import { todayDate } from '../../../lib/medical-record';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { useSiteContent } from '../../../contexts/SiteContentContext';

export type RecordDocument = { id: number; title: string; type: string; performed_at?: string | null; created_at: string; url?: string | null; mime_type?: string | null; notes?: string | null };

type DocumentCategory = 'analysis' | 'functional' | 'imaging';
const TYPES: Array<[DocumentCategory, string]> = [['analysis', 'Analize de laborator'], ['functional', 'Investigații funcționale'], ['imaging', 'Investigații imagistice']];
const CATEGORY_ICONS: Record<string, typeof Files> = { analysis: FlaskConical, functional: Activity, imaging: ScanLine, investigation: Files };
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx';
const MAX_BYTES = 20 * 1024 * 1024;

/** Încărcare directă în categorie și documente afișate în listă, cu miniatură. */
export function DocumentsPanel({ profileId, documents, onChanged }: { profileId: number; documents: RecordDocument[]; onChanged: () => void }) {
  const dialogs = useDialogs();
  const { text } = useSiteContent();
  const examples: Record<string, string> = { analysis: text('patient_record.analysis_examples'), functional: text('patient_record.functional_examples'), imaging: text('patient_record.imaging_examples') };
  const [error, setError] = useState('');
  const [classifying, setClassifying] = useState<number | null>(null);

  const classify = async (item: RecordDocument, category: string) => {
    if (!category || classifying !== null) return;
    setClassifying(item.id);
    setError('');
    try {
      await apiRequest(`/patient/profiles/${profileId}/investigations/${item.id}/category`, { method: 'PATCH', body: JSON.stringify({ type: category }) });
      onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Nu am putut schimba categoria.'); }
    finally { setClassifying(null); }
  };

  const remove = async (item: RecordDocument) => {
    if (!(await dialogs.confirm({ title: `Ștergi „${item.title}”?`, description: 'Fișierul se șterge definitiv din fișa pacientului.', confirmLabel: 'Șterge', tone: 'danger' }))) return;
    setError('');
    try {
      await apiRequest(`/patient/profiles/${profileId}/investigations/${item.id}`, { method: 'DELETE' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge documentul.');
    }
  };

  const groups: Array<[string, string]> = [...TYPES, ...(documents.some((item) => item.type === 'investigation') ? [['investigation', 'Documente de încadrat']] as Array<[string, string]> : [])];

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start lg:gap-6">
        {groups.map(([key, label]) => {
          const items = documents.filter((item) => item.type === key);
          const CategoryIcon = CATEGORY_ICONS[key];
          const category = TYPES.find(([value]) => value === key)?.[0];
          return (
            <section key={key} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 lg:px-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600"><CategoryIcon aria-hidden="true" className="h-5 w-5" /></span>
                  <h3 className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{label}</h3>
                  <span aria-label={`${items.length} ${items.length === 1 ? 'document' : 'documente'}`} className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold tabular-nums text-slate-600">{items.length}</span>
                </div>
                {examples[key] && <p className="mt-3 text-xs leading-5 text-slate-500">{examples[key]}</p>}
              </div>
              <div className="flex flex-col gap-4 p-4 lg:p-5">
                {category && <CategoryUpload key={`${profileId}-${category}`} profileId={profileId} category={category} label={label} onChanged={onChanged} />}
                {items.length === 0 ? <p className="py-4 text-center text-sm leading-6 text-slate-500">Nu sunt documente în această categorie.</p> : (
                  <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {items.map((item) => (
                      <li key={item.id}>
                        <div className="flex items-center gap-2 p-3">
                          <a href={item.url ?? undefined} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600">
                            <DocumentThumbnail item={item} />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="break-words text-sm font-medium leading-5 text-slate-950">{item.title}</span>
                              <span className="text-xs text-slate-500">{item.performed_at ? shortDate(item.performed_at) : 'Dată neprecizată'}</span>
                            </span>
                          </a>
                          <button type="button" aria-label={`Șterge ${item.title}`} onClick={() => void remove(item)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-blue-600"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                        </div>
                        {key === 'investigation' && <div className="px-3 pb-3"><select aria-label={`Categoria pentru ${item.title}`} value="" disabled={classifying !== null} onChange={(event) => void classify(item, event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value="">Alege categoria</option>{TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CategoryUpload({ profileId, category, label, onChanged }: { profileId: number; category: DocumentCategory; label: string; onChanged: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Array<{ file: File; title: string; date: string }>>([]);

  const choose = (files: File[]) => {
    if (uploading.current) return;
    const failures: string[] = [];
    const valid = files.filter((file) => {
      if (file.size > MAX_BYTES) { failures.push(`${file.name}: fișierul depășește 20 MB.`); return false; }
      if (!/\.(jpe?g|png|webp|pdf|docx?)$/i.test(file.name)) { failures.push(`${file.name}: alege PDF, JPG, PNG, WEBP, DOC sau DOCX.`); return false; }
      return true;
    });
    setPending(valid.map((file) => ({ file, title: '', date: '' })));
    setErrors(failures);
    if (fileInput.current) fileInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending.length || uploading.current || pending.some((item) => !item.title.trim() || !item.date)) return;
    uploading.current = true; setSaving(true); setErrors([]);
    const failures: string[] = [];
    const remaining: typeof pending = [];
    let saved = false;
    try {
      for (const item of pending) {
        const form = new FormData();
        form.append('type', category); form.append('title', item.title.trim()); form.append('performed_at', item.date); form.append('file', item.file);
        try { await apiRequest(`/patient/profiles/${profileId}/investigations`, { method: 'POST', body: form }); saved = true; }
        catch (err) { remaining.push(item); failures.push(`${item.file.name}: ${err instanceof Error ? err.message : 'Nu am putut încărca documentul.'}`); }
      }
    } finally {
      uploading.current = false; setSaving(false); setErrors(failures); setPending(remaining);
      if (saved) onChanged();
    }
  };

  const onDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); choose(Array.from(event.dataTransfer.files)); };
  const update = (index: number, patch: { title?: string; date?: string }) => setPending((items) => items.map((item, current) => current === index ? { ...item, ...patch } : item));

  return <div className="flex flex-col gap-3">
    <input ref={fileInput} type="file" multiple accept={ACCEPT} aria-label={`Alege fișiere pentru ${label}`} className="hidden" disabled={saving} onChange={(event) => choose(Array.from(event.target.files ?? []))} />
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label={`Fotografiază pentru ${label}`} className="hidden" disabled={saving} onChange={(event) => choose(Array.from(event.target.files ?? []))} />
    <div onDragOver={(event) => { event.preventDefault(); if (!saving) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={onDrop} className={cn('flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors', dragging ? 'border-blue-600 bg-blue-100' : 'border-blue-200 bg-blue-50/50')}>
      <div className="flex w-full items-center gap-2">
        <button type="button" disabled={saving} aria-label={`Încarcă fișiere în ${label}`} onClick={() => fileInput.current?.click()} className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}<span role="status">{saving ? 'Se încarcă…' : 'Alege fișiere'}</span></button>
        <button type="button" disabled={saving} aria-label={`Fă o poză pentru ${label}`} onClick={() => cameraInput.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-blue-200 bg-white text-blue-700 lg:hidden"><Camera aria-hidden="true" className="h-5 w-5" /></button>
      </div>
      <p className="hidden text-xs text-blue-800 lg:block">sau trage fișierele aici</p>
      <p className="text-[11px] leading-4 text-slate-500">PDF, JPG, PNG, WEBP, DOC, DOCX · până la 20 MB / fișier</p>
    </div>
    {!pending.length && errors.length > 0 && <ul role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
    <Dialog open={pending.length > 0} onOpenChange={(open) => { if (!open && !saving) setPending([]); }}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={(event) => { if (saving) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} showCloseButton={!saving}>
        <form onSubmit={(event) => void upload(event)} className="space-y-5">
          <DialogHeader><DialogTitle>Detaliile investigațiilor</DialogTitle><DialogDescription>Completează denumirea și data efectuării pentru fiecare document din categoria „{label}”. Fișierele se salvează după confirmare.</DialogDescription></DialogHeader>
          {errors.length > 0 && <ul role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
          <fieldset disabled={saving} className="space-y-4">{pending.map((item, index) => <div key={`${index}-${item.file.name}`} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="break-all text-xs text-slate-500">{item.file.name}</p>
            <label className="block space-y-1.5 text-sm font-medium">Denumirea investigației<Input required maxLength={255} value={item.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="De exemplu: analiza generală de sânge" /></label>
            <label className="block space-y-1.5 text-sm font-medium">Data efectuării<Input required type="date" max={todayDate()} value={item.date} onChange={(event) => update(index, { date: event.target.value })} /></label>
          </div>)}</fieldset>
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setPending([])}>Renunță</Button><Button type="submit" disabled={saving || pending.some((item) => !item.title.trim() || !item.date)}>{saving ? 'Se salvează…' : 'Salvează documentele'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function DocumentThumbnail({ item }: { item: RecordDocument }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const kind = kindOf(item);
  const isImage = item.mime_type?.startsWith('image/') || /\.(jpe?g|png|webp)(?:[?#]|$)/i.test(item.url ?? '');
  return (
    <span aria-hidden="true" className={cn('relative grid h-14 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border text-[10px] font-bold', kind === 'PDF' ? 'border-red-100 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-100 text-slate-500')}>
      {kind}
      {isImage && item.url && failedUrl !== item.url && <img src={item.url} alt="" loading="lazy" onError={() => setFailedUrl(item.url ?? null)} className="absolute inset-0 h-full w-full bg-white object-cover" />}
    </span>
  );
}

function kindOf(item: RecordDocument): string {
  if (item.mime_type?.includes('pdf') || /\.pdf(?:[?#]|$)/i.test(item.url ?? '')) return 'PDF';
  if (item.mime_type?.startsWith('image/')) return (item.mime_type.split('/')[1] ?? 'IMG').replace('jpeg', 'jpg').toUpperCase();
  return 'DOC';
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Chisinau' }).replace('.', '');
}
