import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { SectionHeader } from './app/PageHeader';
import { apiRequest } from '../lib/api';
import { dateTime } from '../lib/format';
import type { InstitutionTransfer } from '../lib/institution';

const LABELS: Record<string, string> = { pending: 'În așteptare', approved: 'Aprobat', rejected: 'Respins', cancelled: 'Anulat' };

export function InstitutionTransfersPanel({ defaultShare, onChanged }: { defaultShare: number; onChanged?: () => void }) {
  const [data, setData] = useState<{ data: InstitutionTransfer[]; current_page: number; last_page: number; total: number } | null>(null);
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<{ item: InstitutionTransfer; approve: boolean } | null>(null);
  const [share, setShare] = useState(String(defaultShare));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    setLoading(true); setError('');
    apiRequest<NonNullable<typeof data>>(`/institution/transfers?${params}`).then((response) => { if (!cancelled) setData(response); }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Nu am putut încărca transferurile.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, revision, status]);
  const openDecision = (item: InstitutionTransfer, approve: boolean) => { setDecision({ item, approve }); setShare(String(defaultShare)); setNote(''); setDecisionError(''); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!decision || busy) return;
    setBusy(true); setDecisionError('');
    try {
      const response = await apiRequest<{ message: string }>(`/institution/transfers/${decision.item.id}/decision`, { method: 'POST', body: JSON.stringify({ status: decision.approve ? 'approved' : 'rejected', ...(decision.approve ? { doctor_share_percent: Number(share) } : {}), decision_note: note.trim() || null }) });
      toast.success(response.message); onChanged?.(); setDecision(null); setPage(1); setRevision((value) => value + 1);
    } catch (err) { setDecisionError(err instanceof Error ? err.message : 'Nu am putut procesa cererea.'); }
    finally { setBusy(false); }
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <SectionHeader title="Afilieri și transferuri" description="Aprobi cererile către instituția ta. Cererile de plecare sunt decise de instituția nouă." actions={<select aria-label="Starea transferurilor" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Toate stările</option>{Object.entries(LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>} />
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Se încarcă cererile…</p> : data?.data.length === 0 ? <p className="text-sm text-slate-500">Nu sunt cereri în această stare.</p> : <ul className="divide-y divide-slate-100">{data?.data.map((item) => <li key={item.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center"><div className="min-w-0 flex-1 space-y-1"><p className="font-semibold text-slate-900">{item.doctor_name} · {LABELS[item.status]}</p><p className="text-sm text-slate-600">{item.from_institution?.name ?? 'Fără instituție'} → {item.to_institution.name}</p><p className="text-xs text-slate-500">{dateTime(item.created_at)}{item.doctor_share_percent != null ? ` · Procent medic: ${item.doctor_share_percent}%` : ''}</p>{item.note && <p className="text-sm text-slate-600">{item.note}</p>}{item.decision_note && <p className="text-sm text-slate-600">Răspuns: {item.decision_note}</p>}</div>{item.status === 'pending' && item.direction === 'incoming' ? <div className="flex gap-2"><Button variant="outline" onClick={() => openDecision(item, false)}>Respinge</Button><Button onClick={() => openDecision(item, true)}>Aprobă afilierea</Button></div> : item.status === 'pending' ? <span className="text-xs text-slate-500">În așteptarea instituției noi</span> : null}</li>)}</ul>}
    {data && data.last_page > 1 && <div className="flex items-center justify-between gap-2 text-sm"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Înapoi</Button><span>{page} / {data.last_page}</span><Button variant="outline" disabled={loading || page >= data.last_page} onClick={() => setPage((value) => value + 1)}>Înainte</Button></div>}
    <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open && !busy) setDecision(null); }}><DialogContent className="rounded-2xl sm:max-w-lg"><DialogTitle>{decision?.approve ? 'Aprobă afilierea' : 'Respinge cererea'} · {decision?.item.doctor_name}</DialogTitle><DialogDescription>{decision?.approve ? 'Afilierea se schimbă după aprobare. Programările deja create și datoriile instituției vechi rămân păstrate.' : 'Medicul rămâne afiliat instituției actuale. Motivul este vizibil medicului.'}</DialogDescription><form onSubmit={submit} className="space-y-4">
      {decision?.approve && <div className="space-y-1.5"><Label htmlFor="transfer-share">Procentul medicului din cei 85% ai instituției</Label><Input id="transfer-share" type="number" min="0" max="100" step="0.01" required value={share} onChange={(event) => setShare(event.target.value)} disabled={busy} /><p className="text-xs text-slate-500">Se aplică programărilor noi după aprobarea afilierii.</p></div>}
      <div className="space-y-1.5"><Label htmlFor="transfer-decision-note">{decision?.approve ? 'Notă (opțional)' : 'Motivul respingerii'}</Label><Input id="transfer-decision-note" minLength={decision?.approve ? undefined : 3} required={!decision?.approve} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></div>
      {decisionError && <p role="alert" className="text-sm text-red-700">{decisionError}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>Renunță</Button><Button type="submit" disabled={busy || (decision?.approve ? share === '' || Number(share) < 0 || Number(share) > 100 : note.trim().length < 3)}>{busy ? 'Se salvează…' : decision?.approve ? 'Confirmă afilierea' : 'Respinge cererea'}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </section>;
}
