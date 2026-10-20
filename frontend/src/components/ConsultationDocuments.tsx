import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { dateTime } from '../lib/format';

export type ConsultationDocument = { id: number; title: string; type: string; parent_document_id?: number | null; published_at?: string; url?: string | null; prescription_url?: string | null; status: string; prescription_instructions?: string };
type Response = { documents: ConsultationDocument[]; can_addendum: boolean; addendum_until?: string | null; prescription_instructions?: string };

export function ConsultationDocuments({ requestId }: { requestId: string | number }) {
  const [data, setData] = useState<Response | null>(null);
  const [recommendations, setRecommendations] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => apiRequest<Response>(`/requests/${requestId}/documents`).then(setData).catch((err) => setError(err.message)), [requestId]);
  useEffect(() => { setData(null); setError(''); load(); }, [load]);
  const addendum = async () => {
    setSaving(true); setError('');
    try { await apiRequest(`/requests/${requestId}/documents/addendum`, { method: 'POST', body: JSON.stringify({ recommendations }) }); setRecommendations(''); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Completarea nu a putut fi publicată.'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3 py-3">
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {data?.documents.map((document) => <div key={document.id} className="rounded-xl border bg-white p-3 text-sm">
      <p className="font-semibold">{document.title}{document.parent_document_id && ` · completare la documentul #${document.parent_document_id}`}</p>
      <p className="text-xs text-slate-500">{document.published_at ? dateTime(document.published_at) : 'Document în pregătire'}</p>
      <div className="mt-2 flex flex-wrap gap-3">{document.url && <a className="font-medium text-blue-700" href={document.url} target="_blank" rel="noreferrer">Deschide / descarcă PDF</a>}{document.prescription_url && <a className="font-medium text-blue-700" href={document.prescription_url} target="_blank" rel="noreferrer">Deschide rețeta</a>}</div>
      {document.prescription_url && <p className="mt-2 text-xs text-slate-600">{document.prescription_instructions || data.prescription_instructions}</p>}
    </div>)}
    {data && !data.documents.length && <p className="text-sm text-slate-500">Concluzia medicală finală va fi publicată aici de medic. Chatul este pentru clarificări.</p>}
    {data?.addendum_until && !data.can_addendum && new Date(data.addendum_until).getTime() <= Date.now() && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Au trecut 14 zile de la consultația inițială. Pentru recomandări noi este necesară o consultație nouă.</p>}
    {data?.can_addendum && <div className="space-y-2 rounded-xl bg-blue-50 p-3"><label className="block text-sm font-semibold" htmlFor={`addendum-${requestId}`}>Completare la consultația inițială</label><p className="text-xs text-slate-500">Completările se referă la consultația inițială și sunt permise timp de 14 zile. Disponibilă până la {data.addendum_until && dateTime(data.addendum_until)}. Documentul inițial se păstrează.</p><Textarea id={`addendum-${requestId}`} maxLength={8000} value={recommendations} onChange={(event) => setRecommendations(event.target.value)} /><Button onClick={addendum} disabled={saving || !recommendations.trim()}>{saving ? 'Se publică…' : 'Publică completarea PDF'}</Button></div>}
  </div>;
}
