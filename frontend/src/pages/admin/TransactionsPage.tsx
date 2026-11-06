import { useEffect, useMemo, useState } from 'react';
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
  consultations: { count: number; total: number; paid_real: number; paid_points: number; paid_promo: number; provider_payouts: number; platform_net_real: number };
  issued: Array<{ type: string; label: string; amount: number; count: number }>;
  issued_total: number;
  admin_debits: number;
  in_circulation: { points: number; promo: number };
  promotion: { automatic_grants: number; manual_grants: number; max_grants: number };
  recent: Array<{ id: number; date: string; patient: string | null; provider: string | null; total: number; paid_real: number; paid_bonus: number; provider_amount: number; platform_net_real: number }>;
}

function BonusReportView({ report }: { report?: BonusReport }) {
  if (!report) return <p className="text-sm text-slate-500">Se încarcă raportul...</p>;
  const c = report.consultations;
  const stats: Array<[string, number, string]> = [
    ['Achitat în lei reali', c.paid_real, 'text-slate-900'],
    ['Achitat din puncte bonus', c.paid_points, 'text-emerald-700'],
    ['Achitat din promoție', c.paid_promo, 'text-blue-700'],
    ['Plătit medicilor / operatorilor', c.provider_payouts, 'text-slate-900'],
    ['Rămas platformei (lei reali)', c.platform_net_real, c.platform_net_real < 0 ? 'text-red-600' : 'text-emerald-700']
  ];
  return (
    <div className="space-y-6">
      <Card className="glass-card border-0">
        <CardHeader className="pb-2">
          <p className="font-semibold text-slate-900">Consultații finalizate ({num(c.count)}) — total {money(c.total)} MDL</p>
          <p className="text-xs text-slate-500">Medicul primește partea lui integral în lei, indiferent dacă pacientul a plătit cu lei sau cu bonusuri. Diferența o acoperă platforma.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-lg font-semibold ${tone}`}>{money(value)} MDL</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass-card border-0">
          <CardHeader className="pb-2"><p className="font-semibold text-slate-900">Bonusuri emise — {money(report.issued_total)} puncte</p></CardHeader>
          <CardContent className="space-y-1">
            {report.issued.map((row) => (
              <div key={row.type} className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                <span className="text-slate-600">{row.label} <span className="text-xs text-slate-400">({num(row.count)})</span></span>
                <span className="font-medium">{money(row.amount)}</span>
              </div>
            ))}
            {report.admin_debits > 0 && <div className="flex justify-between py-1.5 text-sm"><span className="text-slate-600">Corecții admin (scăderi)</span><span className="font-medium text-red-600">−{money(report.admin_debits)}</span></div>}
          </CardContent>
        </Card>
        <Card className="glass-card border-0">
          <CardHeader className="pb-2"><p className="font-semibold text-slate-900">Bonusuri în circulație</p></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Puncte bonus nefolosite</span><span className="font-medium">{money(report.in_circulation.points)}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Puncte promoție nefolosite</span><span className="font-medium">{money(report.in_circulation.promo)}</span></div>
            <div className="flex justify-between border-t border-slate-100 py-1.5"><span className="text-slate-600">Promoția 500: acordări automate</span><span className="font-medium">{num(report.promotion.automatic_grants)}{report.promotion.max_grants > 0 ? ` / ${num(report.promotion.max_grants)}` : ''}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-slate-600">Promoția 500: acordări manuale</span><span className="font-medium">{num(report.promotion.manual_grants)}</span></div>
          </CardContent>
        </Card>
      </div>

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
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead className="text-right">Medic</TableHead>
                  <TableHead className="text-right">Platformă</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.recent.map((row) => (
                  <TableRow key={row.id} className="border-slate-200/50">
                    <TableCell className="text-slate-500">{dateTime(row.date)}</TableCell>
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

interface FinancialData {
  bonus_report?: BonusReport;
  summary: {
    wallets_balance: number;
    top_ups: number;
    platform_fees: number;
    pending_withdrawals: number;
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
  const [data, setData] = useState<FinancialData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<FinancialData['withdrawals'][number] | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [actualAmount, setActualAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [payoutSentAt, setPayoutSentAt] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('transfer_bancar');
  const [payoutReference, setPayoutReference] = useState('');

  const loadData = () => {
    apiRequest<FinancialData>('/admin/financial').then(setData).catch(() => setData(null));
  };

  useEffect(() => {
    loadData();
  }, []);

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
    setIsApproveModalOpen(true);
  };

  const updateWithdrawal = async (status: 'approved' | 'rejected', request = selectedRequest) => {
    if (!request) return;

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
  };

  const summaryCards = [
    { label: 'Balanțe Wallet', value: data?.summary.wallets_balance ?? 0, tone: 'from-blue-50 to-blue-100/50', text: 'text-blue-800' },
    { label: 'Alimentări card', value: data?.summary.top_ups ?? 0, tone: 'from-purple-50 to-purple-100/50', text: 'text-purple-800' },
    { label: 'Venit Platformă', value: data?.summary.platform_fees ?? 0, tone: 'from-green-50 to-green-100/50', text: 'text-green-800' },
    { label: 'Extrageri Pending', value: data?.summary.pending_withdrawals ?? 0, tone: 'from-amber-50 to-amber-100/50', text: 'text-amber-800' }
  ];
  const processedWithdrawals = (data?.withdrawals ?? []).filter((item) => item.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Tranzacții și Financiar</h1>
        <p className="text-slate-500">Date reale din wallet, payments și cereri de extragere.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card, index) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Card className={`glass-card border-0 bg-gradient-to-br ${card.tone}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                  <p className={`text-sm font-medium ${card.text}`}>{card.label}</p>
                  <Wallet className="h-4 w-4 text-slate-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">{money(card.value)} MDL</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3 bg-white/50 backdrop-blur-sm p-1 rounded-xl mb-6">
          <TabsTrigger value="transactions" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Istoric Tranzacții
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm relative">
            Cereri Extragere
            {pendingWithdrawals.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
          </TabsTrigger>
          <TabsTrigger value="bonuses" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Lei vs Bonusuri
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bonuses">
          <BonusReportView report={data?.bonus_report} />
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
              <div className="rounded-xl border border-slate-200/50 bg-white/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-slate-200/50">
                      <TableHead>Data</TableHead>
                      <TableHead>Utilizator</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead className="text-right">Suma</TableHead>
                      <TableHead className="text-right">Venit Platformă</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow key={tx.id} className="border-slate-200/50 hover:bg-slate-50/50">
                        <TableCell className="text-slate-500">{dateTime(tx.date)}</TableCell>
                        <TableCell className="font-medium text-slate-900">{tx.user}</TableCell>
                        <TableCell className="text-slate-500">{tx.type}</TableCell>
                        <TableCell className={`text-right font-medium ${num(tx.amount) > 0 ? 'text-green-600' : 'text-slate-900'}`}>
                          {num(tx.amount) > 0 ? '+' : ''}{money(tx.amount)} {tx.currency}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">+{money(tx.fee)} {tx.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                      <p className="text-sm text-slate-500">Solicitat la {dateTime(request.date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900">{money(request.amount)} {request.currency}</span>
                      <Button size="sm" className="rounded-lg" onClick={() => openApprove(request)}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Procesează
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg text-red-600 border-red-200" onClick={() => updateWithdrawal('rejected', request)}>
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
                              {request.status}
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

      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent className="sm:max-w-[460px] glass-panel border-0 rounded-2xl z-50">
          <form onSubmit={(event) => { event.preventDefault(); void updateWithdrawal('approved'); }}>
            <DialogHeader>
              <DialogTitle className="text-2xl">Procesează extragerea</DialogTitle>
              <DialogDescription>Confirmă suma procesată manual. După confirmare, balanța disponibilă a medicului scade automat.</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="py-4 space-y-4">
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
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsApproveModalOpen(false)}>Anulare</Button>
              <Button type="submit" className="rounded-xl bg-slate-900 text-white">Marchează procesat</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
