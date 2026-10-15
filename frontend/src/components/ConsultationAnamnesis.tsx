import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

type Context = { status: string; current_illness_history?: string; symptoms?: string; anamnesis_completed_at?: string };
export function ConsultationAnamnesis({ requestId }: { requestId: string | number }) {
  const { role } = useAuth();
  const [context, setContext] = useState<Context | null>(null);
  const [history, setHistory] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (role !== 'patient') return; apiRequest<{ request: Context }>(`/requests/${requestId}/context`).then((response) => { setContext(response.request); setHistory(response.request.current_illness_history || ''); setSymptoms(response.request.symptoms || ''); }).catch(() => undefined); }, [requestId, role]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await apiRequest(`/requests/${requestId}/anamnesis`, { method: 'POST', body: JSON.stringify({ symptoms, current_illness_history: history }) }); setMessage('Istoricul și acuzele au fost salvate pentru medic.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Salvarea nu a reușit.'); }
    finally { setBusy(false); }
  };
  if (role !== 'patient' || !context || !['new', 'accepted'].includes(context.status)) return null;
  return <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">Istoricul bolii și acuzele pentru această consultație</summary><form onSubmit={save} className="mt-3 space-y-3 text-sm"><label className="block space-y-2"><span>Istoricul bolii actuale</span><Textarea value={history} onChange={(event) => setHistory(event.target.value)} maxLength={4000} placeholder="De când a apărut problema și cum a evoluat?" /></label><label className="block space-y-2"><span>Acuze / simptome</span><Textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} maxLength={4000} required /></label><Button disabled={busy || !symptoms.trim()}>{busy ? 'Se salvează…' : 'Confirmă istoricul și acuzele'}</Button>{error && <p role="alert" className="text-red-600">{error}</p>}{message && <p role="status" className="text-green-700">{message}</p>}</form></details>;
}
