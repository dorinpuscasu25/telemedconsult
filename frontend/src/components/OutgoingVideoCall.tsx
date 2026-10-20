import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Volume2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useRingtone } from '../lib/use-ringtone';
import { CALL_UPDATED_EVENT, inviteVideoCall, type CallInvitation } from '../lib/video-calls';
import { Button } from './ui/button';

export function OutgoingVideoCall({ requestId }: { requestId: string | number }) {
  const { user } = useAuth();
  const [call, setCall] = useState<CallInvitation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ringing = call?.status === 'ringing' && Number(call.caller_id) === Number(user?.id);
  const { enabled, enable } = useRingtone(ringing, true);
  useEffect(() => {
    let alive = true; let fetching = false;
    const refresh = async () => {
      if (fetching) return; fetching = true;
      try { const result = await apiRequest<{ call: CallInvitation | null }>(`/requests/${requestId}/video/call`); if (alive) setCall(result.call); } catch { /* Retry without interrupting an active room. */ } finally { fetching = false; }
    };
    void refresh(); const timer = window.setInterval(refresh, 2000); window.addEventListener(CALL_UPDATED_EVENT, refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener(CALL_UPDATED_EVENT, refresh); };
  }, [requestId]);
  useEffect(() => {
    if (!ringing || !call) return;
    const timer = window.setTimeout(() => setCall((current) => current?.id === call.id && current.status === 'ringing' ? { ...current, status: 'missed' } : current), Math.max(0, new Date(call.expires_at).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [call, ringing]);
  if (!call || Number(call.caller_id) !== Number(user?.id)) return null;
  const act = async (cancel: boolean) => {
    setBusy(true); setError('');
    try { if (cancel) { const result = await apiRequest<{ call: CallInvitation }>(`/video-calls/${call.id}/respond`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }); setCall(result.call); } else { setCall((await inviteVideoCall(requestId)).call); } }
    catch (err) { setError(err instanceof Error ? err.message : 'Acțiunea nu a reușit.'); } finally { setBusy(false); }
  };
  return <div role="status" className={`rounded-2xl border p-4 ${ringing ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Phone className={`h-6 w-6 text-emerald-600 ${ringing ? 'motion-safe:animate-pulse' : ''}`} /><div><p className="font-semibold">{ringing ? `Sună ${call.recipient_name}…` : call.status === 'accepted' ? 'Celălalt participant a răspuns' : call.status === 'declined' ? 'Apel refuzat' : call.status === 'missed' ? 'Niciun răspuns la apel' : 'Apel oprit'}</p><p className="text-sm text-slate-600">{ringing ? 'Așteptăm să răspundă. Poți opri apelarea.' : 'Starea apelului nu modifică consultația medicală.'}</p></div></div>{ringing ? <Button variant="outline" disabled={busy} onClick={() => void act(true)}><PhoneOff className="mr-2 h-4 w-4" />Oprește apelarea</Button> : call.status !== 'accepted' && <Button variant="outline" disabled={busy} onClick={() => void act(false)}>Sună din nou</Button>}</div>{ringing && !enabled && <Button variant="ghost" onClick={() => void enable()}><Volume2 className="mr-2 h-4 w-4" />Activează sunetul</Button>}{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}
