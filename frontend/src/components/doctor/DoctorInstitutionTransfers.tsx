import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { apiRequest } from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { InstitutionTransfer } from '../../lib/institution';

const STATUS: Record<string, string> = { pending: 'În așteptare', approved: 'Aprobată', rejected: 'Respinsă', cancelled: 'Anulată' };

export function DoctorInstitutionTransfers({ currentId, onAffiliationChanged }: { currentId?: number; onAffiliationChanged: () => void }) {
  const [transfers, setTransfers] = useState<InstitutionTransfer[]>([]);
  const [institutions, setInstitutions] = useState<Array<{ id: number; name: string }>>([]);
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previousPending = useRef<number | null>(null);
  const onChanged = useRef(onAffiliationChanged);
  onChanged.current = onAffiliationChanged;

  const load = useCallback(async () => {
    const response = await apiRequest<{ data: InstitutionTransfer[] }>('/doctor/institution-transfers');
    if (previousPending.current && response.data.find((item) => item.id === previousPending.current)?.status === 'approved') onChanged.current();
    previousPending.current = response.data.find((item) => item.status === 'pending')?.id ?? null;
    setTransfers(response.data);
  }, []);
  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca cererile.'));
    apiRequest<{ data: Array<{ id: number; name: string }> }>('/catalog/institutions', { auth: false }).then((response) => setInstitutions(response.data)).catch(() => setError('Nu am putut încărca instituțiile.'));
  }, [load]);
  const pending = transfers.find((item) => item.status === 'pending');
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 15000);
    return () => window.clearInterval(timer);
  }, [load, pending?.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await apiRequest<{ message: string }>('/doctor/institution-transfers', { method: 'POST', body: JSON.stringify({ institution_id: Number(targetId), note: note.trim() || null }) });
      toast.success(response.message); setNote(''); setTargetId(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Nu am putut trimite cererea.'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!pending || busy) return;
    setBusy(true); setError('');
    try { await apiRequest(`/doctor/institution-transfers/${pending.id}`, { method: 'DELETE' }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nu am putut anula cererea.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Alege instituția și trimite cererea managerului ei. Afilierea actuală se păstrează până la aprobare. Programările existente și sumele datorate de instituțiile anterioare își păstrează condițiile.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {pending ? <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="font-medium text-blue-950">Cerere în așteptare la {pending.to_institution.name}</p><p className="text-xs text-slate-500">Trimisă la {dateTime(pending.created_at)}</p><Button type="button" variant="outline" disabled={busy} onClick={() => void cancel()}>Anulează cererea</Button></div> : <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="space-y-1.5"><Label htmlFor="transfer-institution">Instituția nouă</Label><select id="transfer-institution" required value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={busy} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Alege instituția</option>{institutions.filter((item) => item.id !== currentId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="transfer-note">Mesaj pentru manager (opțional)</Label><Input id="transfer-note" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></div>
      <Button type="submit" disabled={busy || !targetId}>{busy ? 'Se trimite…' : 'Solicită afilierea'}</Button>
    </form>}
    {transfers.some((item) => item.status !== 'pending') && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Istoricul cererilor</summary><ul className="mt-3 divide-y divide-slate-100">{transfers.filter((item) => item.status !== 'pending').map((item) => <li key={item.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{item.to_institution.name} · {STATUS[item.status] ?? item.status}</p><p className="text-xs text-slate-500">{dateTime(item.decided_at ?? item.created_at)}{item.doctor_share_percent != null ? ` · Procent medic: ${item.doctor_share_percent}% din partea instituției` : ''}</p>{item.decision_note && <p className="text-slate-600">{item.decision_note}</p>}</li>)}</ul></details>}
  </div>;
}
