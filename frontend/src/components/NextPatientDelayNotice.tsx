import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { apiRequest } from '../lib/api';

type NextPatient = { id: number; patient_name: string; scheduled_at: string; messages: Record<string, string> };

export function NextPatientDelayNotice({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [next, setNext] = useState<NextPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(5);
  const [sent, setSent] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    apiRequest<{ next: NextPatient | null }>(`/requests/${requestId}/video/next-patient`)
      .then((data) => { if (alive) setNext(data.next); })
      .catch((err) => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [requestId]);
  const send = async () => {
    if (!next || sending) return;
    setSending(true); setError('');
    try { await apiRequest(`/requests/${requestId}/video/delay-notice`, { method: 'POST', body: JSON.stringify({ minutes, next_request_id: next.id }) }); setSent(minutes); }
    catch (err) { setError(err instanceof Error ? err.message : 'Anunțul nu a putut fi trimis.'); }
    finally { setSending(false); }
  };
  return <section aria-label="Anunță întârzierea" className="absolute right-6 top-5 z-10 flex w-[340px] max-w-[calc(100%-32px)] flex-col gap-3.5 rounded-2xl bg-white p-4 text-slate-900 shadow-[0_18px_40px_rgba(2,6,23,.4)] max-sm:right-4 max-sm:top-20">
    <div className="flex items-start justify-between gap-2"><div><h2 className="text-[15px] font-semibold">Anunță următorul pacient că întârzii</h2>{next && <p className="mt-0.5 text-[13px] text-slate-500">Următorul: {next.patient_name} · {new Date(next.scheduled_at).toLocaleTimeString('ro-MD', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit' })}</p>}</div><button type="button" onClick={onClose} aria-label="Închide anunțul de întârziere" className="-mr-1 -mt-1 rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
    {loading ? <p role="status" className="text-sm text-slate-500">Se verifică următoarea programare…</p> : next ? <>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Durata întârzierii">{[5, 10, 15].map((value) => <button key={value} type="button" disabled={sending} aria-pressed={minutes === value} onClick={() => setMinutes(value)} className={`h-[38px] rounded-[10px] border text-sm font-semibold ${minutes === value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>{value} min</button>)}</div>
      <p className="rounded-[10px] bg-slate-50 px-3 py-2.5 text-[13px] leading-[1.5] text-slate-700">„{next.messages[String(minutes)]}”</p>
      {sent === minutes ? <p role="status" className="flex items-center gap-1.5 text-[13px] font-medium text-green-600"><Check size={16} />Trimis în chatul lui {next.patient_name}</p> : <button type="button" disabled={sending} onClick={() => void send()} className="h-[42px] rounded-[10px] bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{sending ? 'Se trimite…' : `Trimite în chatul lui ${next.patient_name.split(' ')[0]}`}</button>}
    </> : !error && <p className="text-sm text-slate-500">Nu ai o altă programare confirmată în așteptare astăzi.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
