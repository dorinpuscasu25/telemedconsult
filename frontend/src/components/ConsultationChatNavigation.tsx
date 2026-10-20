import { OutgoingVideoCall } from './OutgoingVideoCall';
import { inviteVideoCall } from '../lib/video-calls';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Video, CalendarDays, Check, Play, Clock3, CircleCheck } from 'lucide-react';
import { dateTime } from '../lib/format';
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
  const navigate = useNavigate();
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
    try { if (action === 'video/invite') { if (role === 'doctor' && !context?.doctor_started_at) await apiRequest(`/requests/${requestId}/start`, { method: 'POST', body: JSON.stringify({ start_early: true }) }); const result = await inviteVideoCall(requestId); setNotice(result.message); await refresh(); onRefresh?.(); if (showVideoLink) navigate(`/consultations/${requestId}/video`, { state: { returnTo: location.pathname + location.search } }); return; } const result = await apiRequest<{ message?: string }>(`/requests/${requestId}/${action}`, { method: 'POST', ...(startEarly ? { body: JSON.stringify({ start_early: true }) } : {}) }); await refresh(); setNotice(result.message || 'Acțiune efectuată.'); onRefresh?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Acțiunea nu a reușit.'); }
    finally { setBusy(false); }
  };
  const active = context?.status === 'accepted';
  const finished = context?.status === 'completed';
  return <div className="shrink-0 border-b border-slate-200/60 bg-slate-50/70 px-4 py-3 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400'}`}>{finished ? <CircleCheck size={18} /> : <CalendarDays size={18} />}</span>
        <div className="min-w-0 text-sm"><div className="flex flex-wrap items-center gap-x-2"><strong className="font-semibold text-slate-800">Consultație #{requestId}</strong><span className={active ? 'text-emerald-700' : 'text-slate-500'}>{context ? labels[context.status] || context.status : 'Se încarcă…'}</span></div>
          {context?.scheduled_at && <p className="mt-0.5 text-xs text-slate-500">{dateTime(context.scheduled_at)}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {context?.can_accept && <Button size="sm" className="gap-2 rounded-xl" disabled={busy} onClick={() => act('accept')}><Check size={16} />Confirmă consultația</Button>}
        {context?.can_start_early && <Button size="sm" variant="outline" className="gap-2 rounded-xl" disabled={busy} onClick={() => act('start', true)}><Play size={16} />Începe acum, mai devreme</Button>}
        {context?.can_start && <Button size="sm" variant="outline" className="gap-2 rounded-xl" disabled={busy} onClick={() => act('start')}><Play size={16} />Deschide consultația</Button>}
        {role === 'patient' && context?.status === 'rescheduled' && context.proposed_scheduled_at && <Button size="sm" className="gap-2 rounded-xl" disabled={busy} onClick={() => act('accept-proposed-time')}><Clock3 size={16} />Acceptă ora: {dateTime(context.proposed_scheduled_at)}</Button>}
        {active && context.ready_for_doctor && <Button size="sm" className="gap-2 rounded-xl bg-primary px-4 shadow-sm shadow-primary/20 hover:bg-primary/90" disabled={busy} onClick={() => act('video/invite')}><Video size={18} />{busy ? 'Se conectează…' : 'Apel video'}</Button>}
      </div>
    </div>
    {showCallStatus && <OutgoingVideoCall requestId={requestId} />}
    {notice && <p role="status" className="mt-2 text-xs text-blue-700">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
