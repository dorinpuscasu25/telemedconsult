import { OutgoingVideoCall } from './OutgoingVideoCall';
import { inviteVideoCall } from '../lib/video-calls';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';

type Context = { status: string; scheduled_at: string | null; proposed_scheduled_at: string | null; doctor_started_at: string | null; ready_for_doctor: boolean; can_accept: boolean; can_start: boolean; can_start_early: boolean };
const labels: Record<string, string> = { new: 'În așteptarea confirmării', accepted: 'Confirmată', rescheduled: 'Oră nouă propusă', completed: 'Finalizată', cancelled: 'Anulată', rejected: 'Refuzată', expired: 'Expirată', no_operator_available: 'Fără operator disponibil' };

export function ConsultationChatNavigation({ requestId, onRefresh, showVideoLink = true, showCallStatus = true }: { requestId: string | number; onRefresh?: () => void; showVideoLink?: boolean; showCallStatus?: boolean }) {
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { role } = useAuth();
  const location = useLocation();
  const refresh = useCallback(async () => {
    const result = await apiRequest<{ request: Context }>(`/requests/${requestId}/context`);
    setContext(result.request); setError('');
  }, [requestId]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const result = await apiRequest<{ request: Context }>(`/requests/${requestId}/context`); if (active) { setContext(result.request); setError(''); } }
      catch (err) { if (active) setError(err instanceof Error ? err.message : 'Consultația nu a putut fi încărcată.'); }
    };
    void load();
    const timer = window.setInterval(load, 10000);
    window.addEventListener('focus', load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', load); };
  }, [requestId]);
  const act = async (action: string, startEarly = false) => {
    setBusy(true); setError('');
    try { if (action === 'video/invite') { if (role === 'doctor' && !context?.doctor_started_at) await apiRequest(`/requests/${requestId}/start`, { method: 'POST', body: JSON.stringify({ start_early: true }) }); const result = await inviteVideoCall(requestId); setNotice(result.message); await refresh(); onRefresh?.(); return; } const result = await apiRequest<{ message?: string }>(`/requests/${requestId}/${action}`, { method: 'POST', ...(startEarly ? { body: JSON.stringify({ start_early: true }) } : {}) }); await refresh(); setNotice(result.message || 'Acțiune efectuată.'); onRefresh?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Acțiunea nu a reușit.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2 border-b bg-blue-50/50 px-4 py-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><strong>Consultație #{requestId}</strong><span>{context ? labels[context.status] || context.status : 'Se încarcă…'}</span>
      {context?.scheduled_at && <span>· {new Date(context.scheduled_at).toLocaleString('ro-RO')}</span>}
    </div>
    {context?.status === 'accepted' && !context.doctor_started_at && <p className="text-slate-600">Medicul deschide consultația la ora confirmată sau mai devreme dacă v-ați înțeles în chat. Poți trimite o invitație și aștepta în pagina video.</p>}
    <div className="flex flex-wrap gap-2">
      {context?.can_accept && <Button size="sm" disabled={busy} onClick={() => act('accept')}>Confirmă consultația</Button>}
      {context?.can_start_early && <Button size="sm" disabled={busy} onClick={() => act('start', true)}>Începe acum, mai devreme</Button>}
      {context?.can_start && <Button size="sm" disabled={busy} onClick={() => act('start')}>Deschide consultația</Button>}
      {role === 'patient' && context?.status === 'rescheduled' && context.proposed_scheduled_at && <Button size="sm" disabled={busy} onClick={() => act('accept-proposed-time')}>Acceptă ora: {new Date(context.proposed_scheduled_at).toLocaleString('ro-RO')}</Button>}
      {context?.status === 'accepted' && context.ready_for_doctor && <Button size="sm" variant="outline" disabled={busy} onClick={() => act('video/invite')}>Sună prin video</Button>}
      {showVideoLink && <Button asChild size="sm" variant="outline"><Link to={`/consultations/${requestId}/video`} state={{ returnTo: location.pathname + location.search }}>Treci la videocall</Link></Button>}
    </div>
    {showCallStatus && <OutgoingVideoCall requestId={requestId} />}
    {notice && <p role="status" className="text-blue-700">{notice}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </div>;
}
