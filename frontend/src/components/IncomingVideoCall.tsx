import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Video, Volume2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePatientCall } from '../contexts/PatientCallContext';
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
  const patientCall = usePatientCall();
  // Pacientul deja în apelul acestei consultații nu mai primește fereastra de apel.
  const visibleCall = call && !(role === 'patient' && patientCall.session?.requestId === String(call.request_id)) ? call : null;
  const { enabled, enable } = useRingtone(!!visibleCall);
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
  if (role === 'patient') {
    const name = visibleCall?.caller_name ?? '';
    // V2: dialog centrat pe desktop, ecran întreg închis la culoare pe telefon.
    return <Dialog open={!!visibleCall} onOpenChange={() => undefined}><DialogContent className="flex max-w-[340px] flex-col items-center gap-0 rounded-2xl p-5 text-center max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:bg-slate-900 max-sm:px-6 max-sm:pb-12 max-sm:pt-24 [&>button:last-child]:hidden" onOpenAutoFocus={(event) => { event.preventDefault(); answerButton.current?.focus(); }} onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
      <span className="grid place-items-center rounded-full bg-blue-50/70 p-2.5 max-sm:bg-blue-900/25 max-sm:p-4 motion-safe:animate-pulse">
        <span className="grid place-items-center rounded-full bg-blue-50 p-2 max-sm:bg-blue-900/40 max-sm:p-3">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-200 text-lg font-semibold text-slate-700 max-sm:h-24 max-sm:w-24 max-sm:bg-slate-700 max-sm:text-3xl max-sm:text-white">{initialsOf(name)}</span>
        </span>
      </span>
      <DialogHeader className="mt-3 items-center gap-1 sm:text-center max-sm:mt-6">
        <DialogTitle className="text-base font-bold text-slate-950 max-sm:text-[22px] max-sm:text-white">{name} te sună</DialogTitle>
        <DialogDescription className="text-[13px] text-slate-500 max-sm:text-sm max-sm:text-slate-400">Consultație video{visibleCall?.patient_name ? ` pentru ${visibleCall.patient_name.split(' ')[0]}` : ''}</DialogDescription>
      </DialogHeader>
      {!enabled && <button type="button" onClick={() => void enable()} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-600 max-sm:text-blue-300"><Volume2 className="h-4 w-4" />Activează sunetul apelului</button>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600 max-sm:text-red-300">{error}</p>}
      <div className="mt-4 flex w-full gap-2 max-sm:mt-auto max-sm:justify-between">
        <button type="button" disabled={busy} onClick={() => void respond(false)} className="flex h-9 flex-1 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50 max-sm:h-auto max-sm:flex-none max-sm:flex-col max-sm:gap-2 max-sm:border-0 max-sm:bg-transparent max-sm:text-[13px] max-sm:text-slate-300 max-sm:hover:bg-transparent">
          <span className="hidden h-16 w-16 place-items-center rounded-full bg-slate-700 text-white max-sm:grid"><X className="h-6 w-6" /></span>Respinge
        </button>
        <button ref={answerButton} type="button" disabled={busy} onClick={() => void respond(true)} className="flex h-9 flex-[1.4] items-center justify-center gap-1.5 rounded-[10px] bg-green-600 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 max-sm:h-auto max-sm:flex-none max-sm:flex-col max-sm:gap-2 max-sm:bg-transparent max-sm:text-[13px] max-sm:hover:bg-transparent">
          <span className="hidden h-16 w-16 place-items-center rounded-full bg-green-600 max-sm:grid"><Video className="h-6 w-6" /></span>
          <Video className="h-4 w-4 max-sm:hidden" />{busy ? 'Se preia…' : 'Răspunde'}
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-[1.4] text-slate-400 max-sm:hidden">Dacă respingi, medicul te poate suna din nou. Camera și microfonul pornesc oprite.</p>
    </DialogContent></Dialog>;
  }

  return <Dialog open={!!call} onOpenChange={() => undefined}><DialogContent className="max-w-sm rounded-3xl text-center [&>button:last-child]:hidden" onOpenAutoFocus={(event) => { event.preventDefault(); answerButton.current?.focus(); }} onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
    <DialogHeader className="items-center sm:text-center"><span className="my-3 grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700 motion-safe:animate-pulse"><Phone className="h-9 w-9" /></span><DialogTitle>Apel video primit</DialogTitle><DialogDescription><strong className="block text-lg text-slate-900">{call?.caller_name}</strong><span className="mt-1 block">{call?.patient_name ? `Pentru pacientul ${call.patient_name}` : 'Consultație medicală'}</span></DialogDescription></DialogHeader>
    <p className="text-sm text-slate-600">Apasă „Răspunde” pentru a intra. Camera și microfonul vor fi oprite; le poți porni din apel.</p>
    {!enabled && <Button variant="outline" onClick={() => void enable()}><Volume2 className="mr-2 h-4 w-4" />Activează sunetul apelului</Button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-3"><Button variant="outline" className="h-14 border-red-200 text-red-700" disabled={busy} onClick={() => void respond(false)}><PhoneOff className="mr-2 h-5 w-5" />Refuză</Button><Button ref={answerButton} className="h-14 bg-emerald-600 text-white hover:bg-emerald-700 motion-safe:animate-pulse" disabled={busy} onClick={() => void respond(true)}><Phone className="mr-2 h-5 w-5" />{busy ? 'Se preia…' : 'Răspunde'}</Button></div>
  </DialogContent></Dialog>;
}

function initialsOf(name: string): string {
  return name.replace(/^dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
