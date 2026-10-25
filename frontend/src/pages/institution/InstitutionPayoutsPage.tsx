import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Banknote, Building2, CheckCircle2, HandCoins, Send, Users, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ListSkeleton } from '../../components/ui/skeleton';
import { PageHeader } from '../../components/app/PageHeader';
import { StatCard } from '../../components/app/StatCard';
import { EmptyState } from '../../components/app/EmptyState';
import { ToneBadge } from '../../components/app/StatusBadge';
import { useDialogs } from '../../components/app/DialogProvider';
import { apiRequest } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import type { InstitutionSummary, InstitutionWithdrawal } from '../../lib/institution';

interface WithdrawalsResponse {
  summary: InstitutionSummary;
  doctor_requests: InstitutionWithdrawal[];
  platform_payouts: InstitutionWithdrawal[];
}

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'În așteptare', tone: 'warning' },
  approved: { label: 'Plătită', tone: 'success' },
  rejected: { label: 'Respinsă', tone: 'danger' }
};

/**
 * Banii instituției în ambele direcții: cererile medicilor (instituția le
 * plătește și le marchează aici) și transferurile cerute de la platformă.
 */
export function InstitutionPayoutsPage() {
  const dialogs = useDialogs();
  const [data, setData] = useState<WithdrawalsResponse | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    apiRequest<WithdrawalsResponse>('/institution/withdrawals')
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Nu am putut încărca plățile.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const available = Math.max(0, (summary?.platform_balance ?? 0) - (summary?.platform_pending ?? 0));
  const pendingDoctor = (data?.doctor_requests ?? []).filter((item) => item.status === 'pending');

  const approve = async (withdrawal: InstitutionWithdrawal) => {
    const values = await dialogs.form({
      title: `Plătești ${withdrawal.doctor}?`,
      description: <p>Confirmă după ce ai transferat banii. Instituția îi datorează în total <strong>{money(withdrawal.doctor_balance)} MDL</strong>.</p>,
      confirmLabel: 'Marchează ca plătită',
      fields: [
        { name: 'amount', label: 'Suma plătită (MDL)', type: 'number', required: true, defaultValue: String(withdrawal.amount), min: '0' },
        { name: 'reference', label: 'Referința plății', placeholder: 'Ex: OP nr. 123 din 21.10' },
        { name: 'note', label: 'Notă pentru medic', type: 'textarea' }
      ]
    });
    if (!values) return;
    await process(withdrawal, { status: 'approved', approved_amount: Number(values.amount), payout_reference: values.reference || null, note: values.note || null });
  };

  const reject = async (withdrawal: InstitutionWithdrawal) => {
    const values = await dialogs.form({
      title: 'Respingi cererea?',
      description: 'Medicul vede motivul și poate trimite o cerere nouă.',
      confirmLabel: 'Respinge cererea',
      tone: 'danger',
      fields: [{ name: 'note', label: 'Motivul', type: 'textarea', required: true }]
    });
    if (!values) return;
    await process(withdrawal, { status: 'rejected', note: values.note });
  };

  const process = async (withdrawal: InstitutionWithdrawal, body: Record<string, unknown>) => {
    setBusyId(withdrawal.id);
    try {
      const response = await apiRequest<{ message: string }>(`/institution/withdrawals/${withdrawal.id}`, { method: 'PUT', body: JSON.stringify(body) });
      toast.success(response.message);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut procesa cererea.');
    } finally {
      setBusyId(null);
    }
  };

  const requestPayout = async () => {
    const values = await dialogs.form({
      title: 'Cere transferul de la platformă',
      description: `Disponibil: ${money(available)} MDL. Banii ajung în contul IBAN al instituției după aprobarea administratorului.`,
      confirmLabel: 'Trimite cererea',
      fields: [{ name: 'amount', label: 'Suma (MDL)', type: 'number', required: true, defaultValue: String(available), min: '1' }]
    });
    if (!values) return;
    try {
      const response = await apiRequest<{ message: string }>('/institution/payouts', { method: 'POST', body: JSON.stringify({ amount: Number(values.amount) }) });
      toast.success(response.message);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut trimite cererea.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plăți"
        description="Cererile de plată ale medicilor și transferurile de la platformă către instituție."
        actions={<Button onClick={() => void requestPayout()} disabled={!data || available <= 0}><Send className="h-4 w-4" />Cere transfer de la platformă</Button>}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Sold la platformă" value={`${money(summary?.platform_balance)} MDL`} detail="Tot ce s-a câștigat prin instituție, netransferat încă" icon={Banknote} loading={!data} />
        <StatCard label="Transfer în procesare" value={`${money(summary?.platform_pending)} MDL`} detail="Cerut de la platformă" icon={Building2} loading={!data} />
        <StatCard label="Datorat medicilor" value={`${money(summary?.owed_to_doctors)} MDL`} detail="Partea medicilor, încă neplătită" icon={Users} loading={!data} />
        <StatCard label="Cereri de la medici" value={pendingDoctor.length} detail={pendingDoctor.length ? `${money(pendingDoctor.reduce((sum, item) => sum + item.amount, 0))} MDL de plătit` : 'Nicio cerere în așteptare'} icon={HandCoins} loading={!data} />
      </div>

      <Tabs defaultValue="doctors">
        <TabsList>
          <TabsTrigger value="doctors">Cereri de la medici{pendingDoctor.length > 0 && <span className="tabular rounded-full bg-primary px-1.5 text-xs text-white">{pendingDoctor.length}</span>}</TabsTrigger>
          <TabsTrigger value="platform">Transferuri de la platformă</TabsTrigger>
        </TabsList>

        <TabsContent value="doctors" className="mt-4">
          {!data ? <ListSkeleton rows={3} /> : data.doctor_requests.length === 0 ? (
            <EmptyState icon={HandCoins} title="Nicio cerere de la medici" description="Când un medic cere banii lui, cererea apare aici. O plătești tu, apoi o marchezi ca plătită." />
          ) : (
            <ul className="space-y-2">
              {[...data.doctor_requests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map((withdrawal) => (
                <li key={withdrawal.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{withdrawal.doctor}</p>
                      <ToneBadge tone={STATUS[withdrawal.status]?.tone ?? 'neutral'}>{STATUS[withdrawal.status]?.label ?? withdrawal.status}</ToneBadge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Cerută {dateTime(withdrawal.date)}
                      {withdrawal.status === 'pending' && withdrawal.doctor_balance !== undefined && ` · îi datorezi ${money(withdrawal.doctor_balance)} MDL`}
                      {withdrawal.status !== 'pending' && withdrawal.processed_at && ` · procesată ${dateTime(withdrawal.processed_at)}${withdrawal.processed_by ? ` de ${withdrawal.processed_by}` : ''}`}
                    </p>
                    {(withdrawal.note || withdrawal.payout_reference) && <p className="mt-1 text-xs text-slate-500">{[withdrawal.payout_reference && `Ref: ${withdrawal.payout_reference}`, withdrawal.note].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <p className="tabular text-lg font-bold text-slate-950">{money(withdrawal.status === 'approved' ? withdrawal.approved_amount : withdrawal.amount)} MDL</p>
                  {withdrawal.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void reject(withdrawal)} disabled={busyId === withdrawal.id}><XCircle className="h-4 w-4" />Respinge</Button>
                      <Button size="sm" onClick={() => void approve(withdrawal)} disabled={busyId === withdrawal.id}><CheckCircle2 className="h-4 w-4" />Am plătit</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="platform" className="mt-4">
          {!data ? <ListSkeleton rows={2} /> : data.platform_payouts.length === 0 ? (
            <EmptyState icon={Banknote} title="Niciun transfer cerut" description="Cere transferul soldului de la platformă în contul instituției." action={<Button asChild variant="outline"><Link to="/institution/settings">Verifică IBAN-ul</Link></Button>} />
          ) : (
            <ul className="space-y-2">
              {data.platform_payouts.map((payout) => (
                <li key={payout.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">Transfer către instituție</p>
                      <ToneBadge tone={STATUS[payout.status]?.tone ?? 'neutral'}>{payout.status === 'approved' ? 'Transferat' : STATUS[payout.status]?.label ?? payout.status}</ToneBadge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">Cerut {dateTime(payout.date)}{payout.doctor ? ` de ${payout.doctor}` : ''}{payout.note ? ` · ${payout.note}` : ''}</p>
                  </div>
                  <p className="tabular text-lg font-bold text-slate-950">{money(payout.status === 'approved' ? payout.approved_amount : payout.amount)} MDL</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
