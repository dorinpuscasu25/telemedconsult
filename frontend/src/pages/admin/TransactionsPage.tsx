import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Search, Wallet, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { dateTime, money, num } from '../../lib/format';

interface BonusReport {
  institution_scoped: boolean;
  circulation_report?: {
    balances_by_role: Array<{ key: string; label: string; accounts: number; points: number; promo: number }>;
    transferred_to_doctors: number; used_for_services_points: number; used_for_services_promo: number;
    promotion_spent: number | null; promotion_reserved_current: number | null;
    held_services_points_current: number; held_services_promo_current: number;
    refunds: Array<{ type: string; amount: number }>;
    unclassified_movements: Array<{ type: string; credits: number; debits: number; operations: number }>;
  };
  consultations: { count: number; total: number; paid_real: number; paid_points: number; paid_promo: number; provider_payouts: number; platform_net_real: number };
  issued: Array<{ type: string; label: string; amount: number; count: number }>;
  issued_total: number;
  admin_debits: number;
  in_circulation: { points: number; promo: number };
  promotion: { automatic_grants: number | null; manual_grants: number | null; max_grants: number };
  recent: Array<{ id: number; date: string; patient: string | null; provider: string | null; total: number; paid_real: number; paid_bonus: number; provider_amount: number; platform_net_real: number }>;
}

function BonusReportView({ report }: { report?: BonusReport }) {
  if (!report) return <p className="text-sm text-slate-500">Se încarcă raportul...</p>;
  const c = report.consultations;
  const stats: Array<[string, number, string, string]> = [
    ['Achitat în lei reali', c.paid_real, 'text-slate-900', 'MDL'],
    ['Achitat din puncte bonus', c.paid_points, 'text-emerald-700', 'puncte'],
    ['Achitat din promoție', c.paid_promo, 'text-blue-700', 'puncte'],
    ['Cuvenit instituțiilor / prestatorilor', c.provider_payouts, 'text-slate-900', 'MDL'],
    ['Rămas platformei (lei reali)', c.platform_net_real, c.platform_net_real < 0 ? 'text-red-600' : 'text-emerald-700', 'MDL']
  ];
  return (
    <div className="space-y-6">
      <Card className="glass-card border-0">
        <CardHeader className="pb-2">
          <p className="font-semibold text-slate-900">Consultații decontate ({num(c.count)}) — valoare nominală {money(c.total)}</p>
          <p className="text-xs text-slate-500">Acest bloc arată consultațiile de bază. Serviciile suplimentare și reactivările chatului apar separat în fila Servicii și sunt incluse în totalurile de sus.</p>
          <p className="text-xs text-slate-500">Leii și punctele sunt evidențiate separat. Partea în lei a prestatorilor folosește calculul păstrat la programare. Suma rămasă platformei include reținerile contractuale; comisioanele bancare și rezerva nu sunt reconciliate aici.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map(([label, value, tone, unit]) => (
            <div key={label} className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-lg font-semibold ${tone}`}>{money(value)} {unit}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card border-0">
          <CardHeader className="pb-2"><p className="font-semibold text-slate-900">Bonusuri emise — {money(report.issued_total)} puncte</p></CardHeader>
          <CardContent className="space-y-1">
            {report.institution_scoped && <p className="pb-3 text-xs text-slate-500">Doar emiterile legate explicit de consultațiile acestei instituții. Bonusurile de cont, alimentare și afiliere fără o astfel de legătură nu sunt atribuite instituției.</p>}
            {report.issued.map((row) => (
              <div key={row.type} className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                <span className="text-slate-600">{row.label} <span className="text-xs text-slate-400">({num(row.count)})</span></span>
                <span className="font-medium">{money(row.amount)}</span>
              </div>
            ))}
            {report.admin_debits > 0 && <div className="flex justify-between py-1.5 text-sm"><span className="text-slate-600">Corecții admin (scăderi)</span><span className="font-medium text-red-600">−{money(report.admin_debits)}</span></div>}
          </CardContent>
        </Card>
        {!report.institution_scoped && <Card className="glass-card border-0">
          <CardHeader className="pb-2"><p className="font-semibold text-slate-900">Bonusuri în circulație acum, în întreaga platformă</p><p className="text-xs text-slate-500">Soldurile sunt curente. Numărul acordărilor promoției respectă perioada selectată.</p></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Puncte bonus nefolosite</span><span className="font-medium">{money(report.in_circulation.points)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Puncte promoție nefolosite</span><span className="font-medium">{money(report.in_circulation.promo)}</span></div>
            <div className="flex justify-between border-t border-slate-100 py-1.5"><span className="text-slate-600">Promoția 500: acordări automate</span><span className="font-medium">{num(report.promotion.automatic_grants)}{report.promotion.max_grants > 0 ? ` / ${num(report.promotion.max_grants)}` : ''}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Promoția 500: acordări manuale</span><span className="font-medium">{num(report.promotion.manual_grants)}</span></div>
          </CardContent>
        </Card>}
      </div>

      {report.circulation_report && <BonusCirculationView report={report.circulation_report} />}

      <Card className="glass-card border-0">
        <CardHeader className="pb-2"><p className="font-semibold text-slate-900">Ultimele consultații finalizate</p></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-200/50 bg-white/50">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-200/50">
                  <TableHead>Data</TableHead>
                  <TableHead>Pacient</TableHead>
                  <TableHead>Medic / operator</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Lei</TableHead>
                  <TableHead className="text-right">Puncte</TableHead>
                  <TableHead className="text-right">Prestatori, lei</TableHead>
                  <TableHead className="text-right">Platformă</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.recent.map((row) => (
                  <TableRow key={row.id} className="border-slate-200/50">
                    <TableCell className="text-slate-500">{dateTime(row.date, '-', 'Europe/Chisinau')}</TableCell>
                    <TableCell>{row.patient ?? '—'}</TableCell>
                    <TableCell>{row.provider ?? '—'}</TableCell>
                    <TableCell className="text-right">{money(row.total)}</TableCell>
                    <TableCell className="text-right">{money(row.paid_real)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{money(row.paid_bonus)}</TableCell>
                    <TableCell className="text-right">{money(row.provider_amount)}</TableCell>
                    <TableCell className={`text-right font-medium ${row.platform_net_real < 0 ? 'text-red-600' : ''}`}>{money(row.platform_net_real)}</TableCell>
                  </TableRow>
                ))}
                {report.recent.length === 0 && <TableRow><TableCell colSpan={8} className="py-6 text-center text-slate-500">Nu sunt consultații finalizate.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BonusCirculationView({ report }: { report: NonNullable<BonusReport['circulation_report']> }) {
  const flows: Array<[string, number | null]> = [
    ['Puncte folosite pentru servicii decontate', report.used_for_services_points],
    ['Promoție folosită pentru servicii decontate', report.used_for_services_promo],
    ['Puncte transferate medicilor', report.transferred_to_doctors],
    ['Consum efectiv pentru promovare', report.promotion_spent],
    ['Bugete de promovare încă rezervate, acum', report.promotion_reserved_current],
    ['Puncte încă rezervate pentru servicii, acum', report.held_services_points_current],
    ['Promoție încă rezervată pentru servicii, acum', report.held_services_promo_current],
  ];
  const refundLabels: Record<string, string> = { points_service_refund: 'Puncte restituite din servicii', promo_service_refund: 'Promoție restituită din servicii', promotion_budget_refund: 'Bugete de promovare restituite' };
  return <Card className="glass-card border-0">
    <CardHeader className="space-y-2"><p className="font-semibold">Circuitul punctelor</p><p className="text-xs text-slate-500">Fluxurile respectă perioada aplicată; rezervele și soldurile sunt curente. Transferul pacient → medic și restituirile mută puncte existente. Promovarea este consumată numai la afișările înregistrate.</p></CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{flows.filter(([, value]) => value !== null).map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold">{money(value)} puncte</p></div>)}</div>
      {report.balances_by_role.length > 0 && <section className="space-y-2"><h3 className="font-medium">Solduri curente pe rolurile contului, platforma întreagă</h3><p className="text-xs text-slate-500">Fiecare cont cu portofel de puncte sau promoție apare o singură dată. Conturile medic și operator sunt în grupa lor separată. Comutarea cabinetului nu schimbă distribuția.</p><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Roluri</TableHead><TableHead>Conturi</TableHead><TableHead>Puncte</TableHead><TableHead>Promoție</TableHead></TableRow></TableHeader><TableBody>{report.balances_by_role.map((row) => <TableRow key={row.key}><TableCell>{row.label}</TableCell><TableCell>{num(row.accounts)}</TableCell><TableCell>{money(row.points)}</TableCell><TableCell>{money(row.promo)}</TableCell></TableRow>)}</TableBody></Table></div></section>}
      <section className="space-y-2"><h3 className="font-medium">Restituiri în perioada selectată</h3>{report.refunds.map((row) => <div key={row.type} className="flex justify-between gap-3 text-sm"><span className="text-slate-500">{refundLabels[row.type] ?? row.type}</span><span>{money(row.amount)} puncte</span></div>)}</section>
      {report.unclassified_movements.length > 0 && <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-medium text-amber-900">Mișcări fără clasificare verificată</h3><p className="text-xs text-amber-900">Aceste credite și debite sunt păstrate separat. Creditele nu sunt declarate automat bonusuri nou emise.</p><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Tip în istoric</TableHead><TableHead>Intrări, puncte</TableHead><TableHead>Ieșiri, puncte</TableHead></TableRow></TableHeader><TableBody>{report.unclassified_movements.map((row) => <TableRow key={row.type}><TableCell>{row.type}</TableCell><TableCell>{money(row.credits)}</TableCell><TableCell>{money(row.debits)}</TableCell></TableRow>)}</TableBody></Table></div></section>}
    </CardContent>
  </Card>;
}

interface FinancialData {
  filters: { from: string | null; to: string | null; institution_id: number | null };
  institutions: Array<{ id: number; name: string; status: string }>;
  transaction_pagination: { current_page: number; last_page: number };
  by_institution: Array<{ id: number; name: string; consultations: number; request_count: number; reconciliation_required: boolean; gross: number; provider: number; doctor_total: number; institution_total: number; paid_real: number; retained_real: number | null; balance_current: number; pending_current: number }>;
  bonus_report?: BonusReport;
  transaction_count: number;
  by_service: Array<{ key: string; service_id: number | null; name: string; historical_names: string[]; type: string; count: number; total: number; paid_real: number; paid_points: number; paid_promo: number; provider_earnings: number; retained_real: number; unclassified_total: number }>;
  summary: {
    wallets_balance: number;
    top_ups: number | null;
    pending_top_ups: number | null;
    platform_fees: number;
    card_revenue: number | null;
    medical_paid_real: number;
    medical_provider_earnings: number;
    medical_retained_real: number;
    has_unclassified_medical: boolean;
    medical_held_real: number;
    pending_withdrawals: number;
    paid_withdrawals: number;
  };
  transactions: Array<{
    id: number;
    date: string;
    user: string;
    type: string;
    amount: number;
    fee: number;
    status: string;
    currency: string;
    wallet_type: string;
  }>;
  withdrawals: Array<{
    id: number;
    doctor: string;
    amount: number;
    approved_amount?: number | null;
    currency: string;
    date: string;
    status: string;
    admin_note?: string | null;
    iban?: string | null;
    contract_number?: string | null;
    payout_period?: string | null;
    payout_sent_at?: string | null;
    payout_method?: string | null;
    payout_reference?: string | null;
    processed_at?: string | null;
    processed_by?: string | null;
  }>;
}

export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const currentQuery = useRef(query);
  currentQuery.current = query;
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [institution, setInstitution] = useState(params.get('institution_id') ?? '');
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<FinancialData['withdrawals'][number] | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [actualAmount, setActualAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [payoutSentAt, setPayoutSentAt] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('transfer_bancar');
  const [payoutReference, setPayoutReference] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadData = useCallback(() => {
    if (query !== currentQuery.current) return;
    const sequence = ++loadSequence.current;
    let cancelled = false;
    setLoading(true); setLoadError('');
    apiRequest<FinancialData>(`/admin/financial${query ? `?${query}` : ''}`).then((response) => {
      if (cancelled || sequence !== loadSequence.current) return;
      setData(response); setSearchTerm(''); setTypeFilter('all'); setServiceFilter('all');
    }).catch((error) => { if (!cancelled && sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : 'Raportul nu a putut fi actualizat.'); })
      .finally(() => { if (!cancelled && sequence === loadSequence.current) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  useEffect(() => {
    const applied = new URLSearchParams(query);
    setFrom(applied.get('from') ?? ''); setTo(applied.get('to') ?? ''); setInstitution(applied.get('institution_id') ?? '');
    setSelectedRequest(null); setIsApproveModalOpen(false); setActionError('');
    return loadData();
  }, [loadData, query]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    if (institution) next.set('institution_id', institution);
    if (next.toString() === query) loadData(); else setParams(next);
  };
  const changeTransactionPage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('transactions_page', String(page));
    setParams(next);
  };

  const filteredTransactions = useMemo(() => {
    const transactions = data?.transactions ?? [];
    return transactions.filter((tx) => {
      const matchesSearch = `${tx.user} ${tx.type}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'all' || tx.type.toLowerCase().includes(typeFilter.toLowerCase());
      return matchesSearch && matchesType;
    });
  }, [data?.transactions, searchTerm, typeFilter]);

  const pendingWithdrawals = (data?.withdrawals ?? []).filter((item) => item.status === 'pending');

  const openApprove = (request: FinancialData['withdrawals'][number]) => {
    setSelectedRequest(request);
    setActualAmount(String(request.amount));
    setAdminNote('');
    setPayoutSentAt(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setPayoutMethod('transfer_bancar');
    setPayoutReference('');
    setActionError('');
    setIsApproveModalOpen(true);
  };

  const updateWithdrawal = async (status: 'approved' | 'rejected', request = selectedRequest) => {
    if (!request || processing) return;
    setProcessing(true); setActionError('');
    try {
      await apiRequest(`/admin/withdrawals/${request.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status,
        approved_amount: status === 'approved' ? Number(actualAmount || request.amount) : 0,
        admin_note: adminNote,
        payout_sent_at: status === 'approved' ? payoutSentAt || null : null,
        payout_method: status === 'approved' ? payoutMethod || null : null,
        payout_reference: status === 'approved' ? payoutReference || null : null
      })
      });
      setIsApproveModalOpen(false);
      loadData();
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Cererea de plată nu a putut fi procesată.'); }
    finally { setProcessing(false); }
  };

  const institutionScoped = Boolean(data?.filters.institution_id);
  const summaryCards = [
    { label: 'Solduri curente în portofele, platforma întreagă', value: data?.summary.wallets_balance ?? 0, globalOnly: true, tone: 'from-blue-50 to-blue-100/50', text: 'text-blue-800' },
    { label: 'Alimentări confirmate', value: data?.summary.top_ups ?? 0, globalOnly: true, tone: 'from-purple-50 to-purple-100/50', text: 'text-purple-800' },
    { label: 'Vânzări de pachete', value: data?.summary.card_revenue ?? 0, globalOnly: true, tone: 'from-green-50 to-green-100/50', text: 'text-green-800' },
    { label: 'Achitat în lei pentru servicii decontate', value: data?.summary.medical_paid_real ?? 0, tone: 'from-blue-50 to-blue-100/50', text: 'text-blue-800' },
    { label: 'Cuvenit instituțiilor / prestatorilor', value: data?.summary.medical_provider_earnings ?? 0, tone: 'from-purple-50 to-purple-100/50', text: 'text-purple-800' },
    { label: 'Rămas platformei din servicii', value: data?.summary.medical_retained_real ?? 0, unavailable: data?.summary.has_unclassified_medical, tone: 'from-green-50 to-green-100/50', text: 'text-green-800' },
    { label: 'Cereri de plată în așteptare', value: data?.summary.pending_withdrawals ?? 0, tone: 'from-amber-50 to-amber-100/50', text: 'text-amber-800' },
    { label: 'Plăți efectuate de platformă', value: data?.summary.paid_withdrawals ?? 0, tone: 'from-green-50 to-green-100/50', text: 'text-green-800' }
  ];
  const processedWithdrawals = (data?.withdrawals ?? []).filter((item) => item.status !== 'pending');

  if (!data) return <div className="space-y-4">
    <h1 className="text-3xl font-bold text-slate-900">Tranzacții și Financiar</h1>
    {loadError ? <div role="alert" className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>{loadError}</p><div className="flex gap-2"><Button variant="outline" onClick={loadData}>Reîncearcă</Button>{query && <Button variant="outline" onClick={() => setParams({})}>Resetează filtrele</Button>}</div></div> : <p role="status" className="text-sm text-slate-500">Se încarcă raportul financiar…</p>}
  </div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Tranzacții și Financiar</h1>
        <p className="text-slate-500">Totaluri pentru selecția aplicată. Alimentările, vânzările și serviciile decontate reprezintă etape distincte și nu se adună ca venit.</p>
      </div>
      <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_auto]">
        <div className="space-y-1.5"><Label htmlFor="financial-from">De la</Label><Input id="financial-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="financial-to">Până la</Label><Input id="financial-to" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="financial-institution">Instituție</Label><select id="financial-institution" value={institution} onChange={(event) => setInstitution(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Toată platforma</option>{data.institutions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'active' ? '' : ' · inactivă'}</option>)}</select></div>
        <div className="flex items-end gap-2"><Button type="submit" disabled={loading || processing}>Aplică</Button><Button type="button" variant="outline" disabled={loading || processing} onClick={() => { setFrom(''); setTo(''); setInstitution(''); if (query) setParams({}); else loadData(); }}>Resetează</Button></div>
      </form>
      <p className="text-xs text-slate-500">Selecție aplicată: {data.filters.from || 'începutul evidenței'} – {data.filters.to || 'astăzi'} · {data.institutions.find((item) => item.id === data.filters.institution_id)?.name ?? 'toată platforma'}. Zilele sunt cele ale Chișinăului. Veniturile se filtrează după decontare, iar operațiunile suplimentare după data tranzacției. Cererile în așteptare se filtrează după depunere și plățile efectuate după data transferului. Soldurile etichetate „curente” nu sunt limitate la perioada selectată.</p>
      {institutionScoped && <p className="text-xs text-slate-500">Alimentările, vânzările de pachete și soldurile personale nu sunt atribuite unei instituții. Sunt prezentate doar operațiunile cu afiliere istorică identificabilă.</p>}
      {loadError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><span>{loadError} Datele de mai jos nu au fost actualizate.</span><Button variant="outline" onClick={loadData}>Reîncearcă</Button></div>}
      {loading && <p role="status" className="text-sm text-slate-500">Se actualizează raportul pentru filtrele alese…</p>}
      {actionError && !isApproveModalOpen && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{actionError}</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy={loading}>
        {summaryCards.filter((card) => !institutionScoped || !card.globalOnly).map((card, index) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Card className={`glass-card border-0 bg-gradient-to-br ${card.tone}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className={`text-sm font-medium ${card.text}`}>{card.label}</p>
                  <Wallet className="h-4 w-4 text-slate-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">{loading ? '…' : card.unavailable ? 'Necesită reconciliere' : `${money(card.value)} MDL`}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {!institutionScoped && <>Alimentări în așteptare, create în selecție: {money(data.summary.pending_top_ups ?? 0)} MDL. </>}Lei încă rezervați pentru consultații create în selecție: {money(data.summary.medical_held_real)} MDL.
        {' '}Suma rămasă platformei include reținerile contractuale. Profitul după comisioane bancare și rezerva bancară necesită reconciliere separată.
      </p>
      {data?.summary.has_unclassified_medical && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Există operațiuni istorice fără clasificare completă lei/puncte. Verifică sumele marcate în fila Servicii înainte de a interpreta totalul rămas platformei.</p>}

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid h-auto w-full max-w-3xl grid-cols-2 gap-1 bg-white/50 backdrop-blur-sm p-1 rounded-xl mb-6 sm:grid-cols-5">
          <TabsTrigger value="transactions" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Tranzacții
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm relative">
            Cereri de plată
            {pendingWithdrawals.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
          </TabsTrigger>
          <TabsTrigger value="bonuses" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Lei și puncte
          </TabsTrigger>
          <TabsTrigger value="services" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Servicii</TabsTrigger>
          <TabsTrigger value="institutions" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Instituții</TabsTrigger>
        </TabsList>

        <TabsContent value="bonuses">
          <BonusReportView report={data?.bonus_report} />
        </TabsContent>

        <TabsContent value="institutions">
          <Card className="glass-card border-0">
            <CardHeader className="space-y-2"><p className="font-semibold">Decontările instituțiilor pentru perioada aplicată</p><p className="text-xs text-slate-500">Partea totală de plată include remunerația medicilor. Împărțirea păstrează procentele de la decontare, inclusiv pentru medicii care au plecat. Soldul și cererile curente includ întreaga evidență a instituției. Contribuția la suma rămasă platformei include consultațiile de bază; suplimentele sunt evidențiate în fila Servicii.</p></CardHeader>
            <CardContent><div className="overflow-x-auto" role="region" aria-label="Raportul pe instituții" tabIndex={0}><Table>
              <TableHeader><TableRow><TableHead>Instituție</TableHead><TableHead>Decontări</TableHead><TableHead>Valoare nominală</TableHead><TableHead>Total de plată instituției</TableHead><TableHead>Partea medicilor</TableHead><TableHead>Partea proprie a instituției</TableHead><TableHead>Rămas platformei, lei</TableHead><TableHead>Sold curent la platformă</TableHead><TableHead>Cereri curente</TableHead></TableRow></TableHeader>
              <TableBody>{data.by_institution.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}{row.reconciliation_required && <p className="mt-1 text-xs text-amber-800">Diferențe între cereri și evidența decontărilor</p>}</TableCell><TableCell>{num(row.consultations)}<span className="block text-xs text-slate-500">{num(row.request_count)} servicii închise</span></TableCell><TableCell>{money(row.gross)}</TableCell><TableCell>{money(row.provider)}</TableCell><TableCell>{money(row.doctor_total)}</TableCell><TableCell>{money(row.institution_total)}</TableCell><TableCell>{row.retained_real === null ? 'Necesită reconciliere' : money(row.retained_real)}</TableCell><TableCell>{money(row.balance_current)}</TableCell><TableCell>{money(row.pending_current)}</TableCell></TableRow>)}{!data.by_institution.length && <TableRow><TableCell colSpan={9} className="py-6 text-center text-slate-500">Nu există decontări pentru această selecție.</TableCell></TableRow>}</TableBody>
            </Table></div></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <Card className="glass-card border-0">
            <CardHeader className="space-y-3">
              <p className="font-semibold">Servicii decontate, după tariful și denumirea de la programare</p>
              <p className="text-xs text-slate-500">Redenumirea sau ștergerea unui serviciu păstrează istoricul. Filtrul de mai jos se aplică acestui tabel; perioada și instituția de sus se aplică întregului raport.</p>
              <Select value={serviceFilter} onValueChange={setServiceFilter}><SelectTrigger className="w-full sm:max-w-md"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toate serviciile</SelectItem>{(data?.by_service ?? []).map((row) => <SelectItem key={row.key} value={row.key}>{row.name}{row.service_id ? ` · #${row.service_id}` : ' · istoric'}</SelectItem>)}</SelectContent></Select>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-slate-500 sm:hidden">Glisează tabelul orizontal pentru toate sumele.</p>
              <div className="overflow-x-auto" role="region" aria-label="Raportul pe servicii" tabIndex={0}><Table>
                <TableHeader><TableRow><TableHead>Serviciu</TableHead><TableHead>Operațiuni</TableHead><TableHead>Tarif nominal</TableHead><TableHead>Lei</TableHead><TableHead>Puncte</TableHead><TableHead>Promoție, puncte</TableHead><TableHead>Prestatori, lei</TableHead><TableHead>Platformă, lei</TableHead><TableHead>Fără clasificare</TableHead></TableRow></TableHeader>
                <TableBody>{(data?.by_service ?? []).filter((row) => serviceFilter === 'all' || row.key === serviceFilter).map((row) => <TableRow key={row.key}>
                  <TableCell><span className="font-medium">{row.name}</span>{row.historical_names.length > 1 && <span className="mt-1 block text-xs text-slate-500">Denumiri în istoric: {row.historical_names.join('; ')}</span>}</TableCell>
                  <TableCell>{num(row.count)}</TableCell><TableCell>{money(row.total)}</TableCell><TableCell>{money(row.paid_real)}</TableCell><TableCell>{money(row.paid_points)}</TableCell><TableCell>{money(row.paid_promo)}</TableCell><TableCell>{money(row.provider_earnings)}</TableCell><TableCell>{row.unclassified_total ? '—' : money(row.retained_real)}</TableCell><TableCell>{money(row.unclassified_total)}</TableCell>
                </TableRow>)}{!data?.by_service.length && <TableRow><TableCell colSpan={9} className="py-6 text-center text-slate-500">Nu există servicii decontate.</TableCell></TableRow>}</TableBody>
              </Table></div>
              <p className="mt-3 text-xs text-slate-500">„Fără clasificare” păstrează diferențele istorice pentru care sursa lei/puncte lipsește. Aceste sume nu sunt transformate automat în numerar.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="glass-card border-0">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Caută după utilizator sau tip..."
                    className="pl-10 bg-white/50 rounded-xl"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[200px] bg-white/50 rounded-xl z-10">
                    <SelectValue placeholder="Tip tranzacție" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl z-50">
                    <SelectItem value="all">Toate</SelectItem>
                    <SelectItem value="consultație">Consultații</SelectItem>
                    <SelectItem value="alimentare">Alimentări</SelectItem>
                    <SelectItem value="operator">Operatori</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-slate-500">{data.transactions.length} din {num(data.transaction_count)} tranzacții în selecție. Căutarea și filtrul de tip se aplică paginii afișate; totalurile includ întreaga selecție.</p>
              <div className="rounded-xl border border-slate-200/50 bg-white/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-slate-200/50">
                      <TableHead>Data</TableHead>
                      <TableHead>Utilizator</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead className="text-right">Suma</TableHead>
                      <TableHead className="text-right">Reținere consemnată, lei</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow key={tx.id} className="border-slate-200/50 hover:bg-slate-50/50">
                        <TableCell className="text-slate-500">{dateTime(tx.date, '-', 'Europe/Chisinau')}</TableCell>
                        <TableCell className="font-medium text-slate-900">{tx.user}</TableCell>
                        <TableCell className="text-slate-500">{tx.type}</TableCell>
                        <TableCell className={`text-right font-medium ${num(tx.amount) > 0 ? 'text-green-600' : 'text-slate-900'}`}>
                          {num(tx.amount) > 0 ? '+' : ''}{money(tx.amount)} {tx.wallet_type === 'real' ? tx.currency : 'puncte'}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">{tx.fee ? `${money(tx.fee)} MDL` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {data.transaction_pagination.last_page > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>Pagina {data.transaction_pagination.current_page} / {data.transaction_pagination.last_page}</span><div className="flex gap-2"><Button variant="outline" disabled={loading || processing || data.transaction_pagination.current_page <= 1} onClick={() => changeTransactionPage(data.transaction_pagination.current_page - 1)}>Înapoi</Button><Button variant="outline" disabled={loading || processing || data.transaction_pagination.current_page >= data.transaction_pagination.last_page} onClick={() => changeTransactionPage(data.transaction_pagination.current_page + 1)}>Înainte</Button></div></div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
          <Card className="glass-card border-0">
            <CardContent className="p-6">
              <div className="grid gap-4">
                {pendingWithdrawals.length === 0 && <p className="text-slate-500 text-sm">Nu există cereri de extragere în așteptare.</p>}
                {pendingWithdrawals.map((request) => (
                  <div key={request.id} className="rounded-xl border border-slate-200/70 bg-white/60 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">{request.doctor}</h3>
                      <p className="text-sm text-slate-500">Solicitat la {dateTime(request.date, '-', 'Europe/Chisinau')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900">{money(request.amount)} {request.currency}</span>
                      <Button size="sm" disabled={processing || loading || Boolean(loadError)} className="rounded-lg" onClick={() => openApprove(request)}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Procesează
                      </Button>
                      <Button size="sm" disabled={processing || loading || Boolean(loadError)} variant="outline" className="rounded-lg text-red-600 border-red-200" onClick={() => void updateWithdrawal('rejected', request)}>
                        <XCircle className="h-4 w-4 mr-2" /> Respinge
                      </Button>
                    </div>
                  </div>
                ))}
                {processedWithdrawals.length > 0 && (
                  <div className="pt-4">
                    <h3 className="mb-3 font-semibold text-slate-900">Procesate</h3>
                    <div className="grid gap-3">
                      {processedWithdrawals.map((request) => (
                        <div key={request.id} className="rounded-xl border border-slate-200/70 bg-white/60 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h4 className="font-semibold text-slate-900">{request.doctor}</h4>
                              <p className="text-sm text-slate-500">
                                {request.status === 'approved' ? 'Trimis' : 'Respins'}: {money(request.approved_amount ?? request.amount)} {request.currency}
                              </p>
                              {request.payout_sent_at && (
                                <p className="text-xs text-slate-500">
                                  Data: {dateTime(request.payout_sent_at)} • Metodă: {request.payout_method || '-'} • Ref: {request.payout_reference || '-'}
                                </p>
                              )}
                              {request.processed_by && <p className="text-xs text-slate-400">Marcat de {request.processed_by}</p>}
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${request.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                              {request.status === 'approved' ? 'Plătită' : request.status === 'rejected' ? 'Respinsă' : request.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isApproveModalOpen} onOpenChange={(open) => { if (!processing) setIsApproveModalOpen(open); }}>
        <DialogContent className="sm:max-w-[460px] glass-panel border-0 rounded-2xl z-50">
          <form onSubmit={(event) => { event.preventDefault(); void updateWithdrawal('approved'); }}>
            <DialogHeader>
              <DialogTitle className="text-2xl">Procesează extragerea</DialogTitle>
              <DialogDescription>Înregistrează transferul efectuat manual către medic sau instituție. Soldul beneficiarului scade după confirmare.</DialogDescription>
            </DialogHeader>
            {actionError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
            {selectedRequest && (
              <fieldset disabled={processing} className="py-4 space-y-4">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="font-semibold text-slate-900">{selectedRequest.doctor}</p>
                  <p className="text-sm text-slate-500">Suma solicitată: {money(selectedRequest.amount)} {selectedRequest.currency}</p>
                </div>
                <div className="space-y-2">
                  <Label>Suma procesată (MDL)</Label>
                  <Input type="number" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Data transferului manual</Label>
                  <Input type="datetime-local" value={payoutSentAt} onChange={(event) => setPayoutSentAt(event.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Metodă</Label>
                  <Input value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)} className="rounded-xl" placeholder="transfer_bancar" />
                </div>
                <div className="space-y-2">
                  <Label>Referință / ordin plată</Label>
                  <Input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Notă admin</Label>
                  <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className="rounded-xl min-h-[90px]" />
                </div>
              </fieldset>
            )}
            <DialogFooter>
              <Button type="button" disabled={processing} variant="outline" className="rounded-xl" onClick={() => setIsApproveModalOpen(false)}>Anulare</Button>
              <Button type="submit" disabled={processing} className="rounded-xl bg-slate-900 text-white">{processing ? 'Se salvează…' : 'Marchează procesat'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
