import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { money } from '../lib/format';

type Proposal = { id: string; status: string; investigations: string[]; notes?: string; expires_at: string; additional_minor?: number };
type Consultation = { id: string; consultation_kind: string; status: string; doctor?: { id: string }; higo_proposal?: Proposal | null };
type Investigation = { id: number; name: string };
type Quote = { proposal_id: string; additional_minor: number; cost: { total: number; travel_fee: number; investigations: Array<{ id: number; name: string; price: number }> } };

export function HigoConsultationProposal({ requestId }: { requestId: string | number }) {
  const { role, user } = useAuth();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [offered, setOffered] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await apiRequest<{ request: Consultation }>(`/requests/${requestId}/context`);
    setConsultation(response.request);
  }, [requestId]);
  useEffect(() => { load().catch(() => undefined); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load().catch(() => undefined); }, 15000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    if (role !== 'doctor') return;
    Promise.all([apiRequest<{ data: Investigation[] }>('/catalog/investigations'), apiRequest<{ profile: { required_investigation_ids: number[]; optional_investigation_ids: number[] } }>('/doctor/profile')]).then(([catalog, profile]) => { const ids = [...(profile.profile?.required_investigation_ids ?? []), ...(profile.profile?.optional_investigation_ids ?? [])]; setOffered(catalog.data.filter((item) => ids.includes(item.id))); }).catch(() => undefined);
  }, [role]);
  const execute = async (action: () => Promise<void>) => { setError(''); setBusy(true); try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Operațiunea nu a reușit.'); } finally { setBusy(false); } };
  const propose = () => execute(async () => { await apiRequest(`/requests/${requestId}/higo-proposal`, { method: 'POST', body: JSON.stringify({ investigation_ids: selected, notes }) }); setMessage('Propunerea a fost trimisă pacientului.'); await load(); });
  const review = () => execute(async () => { setQuote(await apiRequest<Quote>(`/requests/${requestId}/higo-quote`)); });
  const confirm = () => execute(async () => { if (!quote) return; await apiRequest(`/requests/${requestId}/higo-confirm`, { method: 'POST', body: JSON.stringify({ proposal_id: quote.proposal_id, additional_minor: quote.additional_minor }) }); setQuote(null); setMessage('Examinarea a fost confirmată. Operatorul va prelua solicitarea.'); await load(); window.dispatchEvent(new Event('consultation-updated')); });
  if (!consultation || !['new', 'accepted'].includes(consultation.status)) return null;
  const proposal = consultation.higo_proposal;
  const doctorCanPropose = role === 'doctor' && String(consultation.doctor?.id) === String(user?.id) && ['video', 'preliminary'].includes(consultation.consultation_kind);
  if (!doctorCanPropose && !proposal) return null;
  return <details className="rounded-xl border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{proposal?.status === 'accepted' ? 'Examinare HIGO confirmată' : doctorCanPropose && !proposal ? 'Recomandă examinare HIGO' : 'Examinare HIGO recomandată'}</summary><div className="mt-3 space-y-3 text-sm">
    {proposal && <div><p className="font-medium">{proposal.investigations.join(', ')}</p>{proposal.notes && <p className="whitespace-pre-wrap">{proposal.notes}</p>}<p className="text-xs text-slate-500">{proposal.status === 'accepted' ? 'Confirmată de titularul contului' : `Propunere valabilă până la ${new Date(proposal.expires_at).toLocaleString('ro-RO')}`}</p></div>}
    {doctorCanPropose && <><p>Alege examinările din serviciile configurate în profil. Titularul contului verifică și confirmă costul înainte de rezervare.</p>{offered.map((item) => <label key={item.id} className="flex gap-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}{!offered.length && <p>Configurează mai întâi investigațiile în profilul medicului.</p>}<Textarea aria-label="Explicații pentru examinarea HIGO" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /><Button disabled={busy || !selected.length} onClick={propose}>Trimite propunerea de examinare</Button></>}
    {role === 'patient' && proposal?.status === 'proposed' && <><Button variant="outline" disabled={busy} onClick={review}>Verifică operatorul și costul</Button>{quote && <div className="space-y-2 rounded-xl bg-blue-50 p-3">{quote.cost.investigations.map((item) => <p key={item.id}>{item.name}: {money(item.price)}</p>)}<p>Deplasare operator: {money(quote.cost.travel_fee)}</p><p className="font-semibold">Cost suplimentar de rezervat: {money(quote.additional_minor / 100)}</p><p className="text-xs">Costul deja rezervat este luat în calcul. Suplimentul se rezervă din portofelul de bază după confirmare.</p><Button disabled={busy} onClick={confirm}>Confirm examinarea și costul suplimentar</Button></div>}</>}
    {message && <p role="status" className="text-green-700">{message}</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
  </div></details>;
}
