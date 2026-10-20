import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Volume2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useRingtone } from '../lib/use-ringtone';
import { CALL_UPDATED_EVENT, type CallInvitation } from '../lib/video-calls';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export function IncomingVideoCall() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const [call, setCall] = useState<CallInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answerButton = useRef<HTMLButtonElement>(null);
  const dismissed = useRef(new Set<number>());
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled, enable } = useRingtone(!!call);
  useEffect(() => {
    setCall(null); dismissed.current.clear();
    if (!userId || !['patient', 'doctor', 'operator'].includes(role || '')) { setCall(null); return; }
    let alive = true; let fetching = false;
    const refresh = async () => {
      if (fetching) return; fetching = true;
      try {
        const result = await apiRequest<{ calls: CallInvitation[] }>('/video-calls/incoming');
        if (alive) setCall(result.calls.find((item) => !dismissed.current.has(item.id)) || null);
      } catch { /* Keep the current ring only until its known expiry. */ }
      finally { fetching = false; }
    };
    void refresh(); const timer = window.setInterval(refresh, 2000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [userId, role]);
  useEffect(() => {
    if (!call) return;
    const timer = window.setTimeout(() => setCall((current) => current?.id === call.id ? null : current), Math.max(0, new Date(call.expires_at).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [call]);
  const respond = async (accept: boolean) => {
    if (!call || busy) return;
    const current = call; setBusy(true); setError('');
    try {
      if (accept && role === 'doctor') {
        const context = await apiRequest<{ request: { doctor_started_at: string | null } }>(`/requests/${current.request_id}/context`);
        if (!context.request.doctor_started_at) await apiRequest(`/requests/${current.request_id}/start`, { method: 'POST', body: JSON.stringify({ start_early: true }) });
      }
      await apiRequest(`/video-calls/${current.id}/respond`, { method: 'POST', body: JSON.stringify({ action: accept ? 'accept' : 'decline' }) });
      dismissed.current.add(current.id); setCall(null); window.dispatchEvent(new Event(CALL_UPDATED_EVENT));
      if (accept) navigate(`/consultations/${current.request_id}/video`, { state: { answerCallId: current.id, returnTo: location.pathname === `/consultations/${current.request_id}/video` ? `/${role}/chat?request=${current.request_id}` : location.pathname + location.search } });
    } catch (err) { setError(err instanceof Error ? err.message : 'Apelul nu a putut fi preluat.'); }
    finally { setBusy(false); }
  };
  return <Dialog open={!!call} onOpenChange={() => undefined}><DialogContent className="max-w-sm rounded-3xl text-center [&>button:last-child]:hidden" onOpenAutoFocus={(event) => { event.preventDefault(); answerButton.current?.focus(); }} onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
    <DialogHeader className="items-center sm:text-center"><span className="my-3 grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700 motion-safe:animate-pulse"><Phone className="h-9 w-9" /></span><DialogTitle>Apel video primit</DialogTitle><DialogDescription><strong className="block text-lg text-slate-900">{call?.caller_name}</strong><span className="mt-1 block">{call?.patient_name ? `Pentru pacientul ${call.patient_name}` : 'Consultație medicală'}</span></DialogDescription></DialogHeader>
    <p className="text-sm text-slate-600">Apasă „Răspunde” pentru a intra. Camera și microfonul vor fi oprite; le poți porni din apel.</p>
    {!enabled && <Button variant="outline" onClick={() => void enable()}><Volume2 className="mr-2 h-4 w-4" />Activează sunetul apelului</Button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-14 border-red-200 text-red-700" disabled={busy} onClick={() => void respond(false)}><PhoneOff className="mr-2 h-5 w-5" />Refuză</Button><Button ref={answerButton} className="h-14 bg-emerald-600 text-white hover:bg-emerald-700 motion-safe:animate-pulse" disabled={busy} onClick={() => void respond(true)}><Phone className="mr-2 h-5 w-5" />{busy ? 'Se preia…' : 'Răspunde'}</Button></div>
  </DialogContent></Dialog>;
}
