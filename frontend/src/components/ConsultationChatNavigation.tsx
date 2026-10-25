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
  const canCall = Boolean(active && context?.ready_for_doctor);
  const callReason = !context ? 'Se verifică disponibilitatea apelului.'
    : finished ? 'Consultația este finalizată. Pentru un apel nou este necesară o consultație nouă.'
    : ['cancelled', 'rejected', 'expired', 'no_operator_available'].includes(context.status) ? 'Această solicitare este închisă.'
    : !active ? 'Apelul devine disponibil după confirmarea consultației.'
    : !context.ready_for_doctor ? 'Apelul va fi disponibil după completarea examinării.' : '';

  return <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-2.5 sm:px-5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{finished ? <CircleCheck size={16} /> : <CalendarDays size={16} />}</span>
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate"><span className="font-semibold text-slate-900">Consultația #{requestId}</span> <span className={active ? 'text-emerald-700' : 'text-slate-500'}>· {context ? labels[context.status] || context.status : 'Se încarcă…'}</span></p>
          {context?.scheduled_at && <p className="mt-0.5 truncate text-xs text-slate-500">{dateTime(context.scheduled_at)}</p>}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {context?.can_accept && <Button size="sm" disabled={busy} onClick={() => act('accept')}><Check size={16} />Confirmă</Button>}
        {context?.can_start_early && <Button size="sm" variant="outline" disabled={busy} onClick={() => act('start', true)}><Play size={16} />Începe mai devreme</Button>}
        {context?.can_start && <Button size="sm" variant="outline" disabled={busy} onClick={() => act('start')}><Play size={16} />Începe</Button>}
        {role === 'patient' && context?.status === 'rescheduled' && context.proposed_scheduled_at && <Button size="sm" disabled={busy} onClick={() => act('accept-proposed-time')}><Clock3 size={16} />Acceptă {dateTime(context.proposed_scheduled_at)}</Button>}
        <Button size="sm" variant={canCall ? 'default' : 'outline'} disabled={busy || !canCall} title={callReason || 'Sună participantul consultației'} aria-describedby={!canCall ? `call-reason-${requestId}` : undefined} onClick={() => act('video/invite')}><Video size={16} /><span className="hidden sm:inline">{busy ? 'Se conectează…' : 'Apel video'}</span><span className="sm:hidden">{busy ? '…' : 'Apel'}</span></Button>
      </div>
    </div>
    {!canCall && context && <p id={`call-reason-${requestId}`} className="sr-only mt-1.5 pl-[42px] text-xs text-slate-500 sm:not-sr-only sm:block">{callReason}</p>}
    {showCallStatus && <OutgoingVideoCall requestId={requestId} />}
    {notice && <p role="status" className="mt-2 text-xs text-blue-700">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
