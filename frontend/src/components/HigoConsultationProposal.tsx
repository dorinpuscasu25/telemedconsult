import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { money } from '../lib/format';
import { ChevronDown, Stethoscope } from 'lucide-react';

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
  const title = proposal?.status === 'accepted' ? 'Examinare HIGO confirmată' : doctorCanPropose && !proposal ? 'Recomandă o examinare la domiciliu' : 'Medicul recomandă o examinare la domiciliu';
  return <details className="group rounded-xl border border-slate-200 bg-white" open={role === 'patient' && proposal?.status === 'proposed' ? true : undefined}>
    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${proposal?.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' : 'bg-primary/10 text-primary'}`}><Stethoscope className="h-4 w-4" /></span>
      <span className="flex-1 text-sm font-semibold text-slate-900">{title}</span>
      <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
    </summary>
    <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
    {proposal && <div><p className="font-medium text-slate-900">{proposal.investigations.join(', ')}</p>{proposal.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{proposal.notes}</p>}<p className="mt-1 text-xs text-slate-500">{proposal.status === 'accepted' ? 'Confirmată de titularul contului' : `Propunere valabilă până la ${new Date(proposal.expires_at).toLocaleString('ro-RO')}`}</p></div>}
    {doctorCanPropose && <><p className="text-slate-600">Alege examinările din serviciile configurate în profil. Titularul contului vede costul și confirmă înainte de rezervare.</p>{offered.length > 0 && <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">{offered.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5"><input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</div>}{!offered.length && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Configurează mai întâi investigațiile în profilul tău de medic.</p>}<Textarea aria-label="Explicații pentru examinarea HIGO" placeholder="De ce recomanzi examinarea (opțional)" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} /><Button size="sm" disabled={busy || !selected.length} onClick={propose}>Trimite propunerea</Button></>}
    {role === 'patient' && proposal?.status === 'proposed' && <><Button size="sm" variant="outline" disabled={busy} onClick={review}>Vezi operatorul și costul</Button>{quote && <div className="space-y-1.5 rounded-xl bg-blue-50 p-3 text-blue-950">{quote.cost.investigations.map((item) => <p key={item.id} className="flex justify-between"><span>{item.name}</span><span className="tabular">{money(item.price)} MDL</span></p>)}<p className="flex justify-between"><span>Deplasare operator</span><span className="tabular">{money(quote.cost.travel_fee)} MDL</span></p><p className="flex justify-between border-t border-blue-200 pt-1.5 font-semibold"><span>De rezervat acum</span><span className="tabular">{money(quote.additional_minor / 100)} MDL</span></p><p className="text-xs text-blue-800">Suma deja rezervată e luată în calcul. Diferența se rezervă din portofelul de bază după confirmare.</p><Button size="sm" disabled={busy} onClick={confirm}>Confirm examinarea</Button></div>}</>}
    {message && <p role="status" className="text-emerald-700">{message}</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
  </div></details>;
}
