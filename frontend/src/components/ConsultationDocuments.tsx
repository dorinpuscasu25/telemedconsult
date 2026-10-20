import { useCallback, useEffect, useState } from 'react';
import { FileText, Download, FilePlus2, Paperclip, Archive, ChevronDown } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { dateTime } from '../lib/format';

export type ConsultationDocument = { id: number; title: string; type: string; parent_document_id?: number | null; published_at?: string; url?: string | null; prescription_url?: string | null; status: string; prescription_instructions?: string };
type Response = { documents: ConsultationDocument[]; can_addendum: boolean; addendum_until?: string | null; prescription_instructions?: string };

export function ConsultationDocuments({ requestId, compact = false }: { requestId: string | number; compact?: boolean }) {
  const [data, setData] = useState<Response | null>(null);
  const [recommendations, setRecommendations] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => apiRequest<Response>(`/requests/${requestId}/documents`).then(setData).catch((err) => setError(err.message)), [requestId]);
  useEffect(() => { setData(null); setError(''); setEditing(false); setRecommendations(''); void load(); }, [load]);
  const addendum = async () => {
    setSaving(true); setError('');
    try { await apiRequest(`/requests/${requestId}/documents/addendum`, { method: 'POST', body: JSON.stringify({ recommendations }) }); setRecommendations(''); setEditing(false); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Completarea nu a putut fi publicată.'); }
    finally { setSaving(false); }
  };
  return <div className={compact ? 'space-y-2' : 'space-y-3'}>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {data?.documents.map((document) => <div key={document.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white ${compact ? 'px-3 py-2.5' : 'p-4'}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${document.url ? 'bg-indigo-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>{document.url ? <FileText size={19} /> : <Archive size={19} />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{document.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {document.published_at && <span>{dateTime(document.published_at)}</span>}
          {!document.url && <span title="Pentru această înregistrare nu există un PDF publicat.">Fără PDF publicat</span>}
          {document.parent_document_id && <span>Completare la documentul #{document.parent_document_id}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {document.url && <Button asChild variant="outline" size="sm" className="gap-2 rounded-lg border-indigo-100 text-primary"><a href={document.url} target="_blank" rel="noreferrer"><Download size={15} />Deschide / descarcă PDF</a></Button>}
        {document.prescription_url && <Button asChild variant="ghost" size="sm" className="gap-2"><a href={document.prescription_url} target="_blank" rel="noreferrer"><Paperclip size={15} />Rețeta</a></Button>}
      </div>
      {document.prescription_url && !compact && <p className="w-full text-xs leading-relaxed text-slate-500">{document.prescription_instructions || data.prescription_instructions}</p>}
    </div>)}
    {!data && !error && <p role="status" className="text-xs text-slate-400">Se încarcă documentele…</p>}
    {data && !data.documents.length && <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Documentul PDF va fi disponibil după finalizarea consultației.</div>}
    {data?.can_addendum && <div>
      <Button variant="ghost" size="sm" className="gap-2 text-primary" onClick={() => setEditing(!editing)} aria-expanded={editing}><FilePlus2 size={16} />Adaugă o completare<ChevronDown size={14} className={editing ? 'rotate-180' : ''} /></Button>
      {editing && <div className="mt-2 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4"><label className="block text-sm font-semibold" htmlFor={`addendum-${requestId}`}>Completare la consultația inițială</label><p className="text-xs text-slate-500">Disponibilă până la {data.addendum_until && dateTime(data.addendum_until)}. După 14 zile este necesară o consultație nouă.</p><Textarea id={`addendum-${requestId}`} maxLength={8000} value={recommendations} onChange={(event) => setRecommendations(event.target.value)} /><Button className="gap-2" onClick={addendum} disabled={saving || !recommendations.trim()}><FilePlus2 size={16} />{saving ? 'Se publică…' : 'Publică completarea PDF'}</Button></div>}
    </div>}
  </div>;
}
