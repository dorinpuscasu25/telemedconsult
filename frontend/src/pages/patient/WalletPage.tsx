import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Check, CreditCard, Gift, HelpCircle, PauseCircle, Plus, RotateCcw, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { ListSkeleton, Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader } from '../../components/app/PageHeader';
import { apiRequest } from '../../lib/api';
import { relativeDay, timeOnly } from '../../lib/format';

type ReservationState = 'reserved' | 'paid' | 'refunded';

type Transaction = {
  id: number;
  date: string;
  type: string;
  kind?: string;
  amount: number;
  status: string;
  consultation_request_id?: number | null;
  consultation?: { provider_name?: string | null; patient_name?: string | null; scheduled_at?: string | null; reservation_state?: ReservationState | null } | null;
};

interface WalletData {
  topup_bonus_percent: number;
  max_bonus_payment_percent: number;
  wallet: { id: number; balance: number; currency: string };
  points_wallet: { id: number; balance: number; currency: string };
  promo_wallet?: { balance: number; currency: string };
  transactions: Transaction[];
  points_transactions: Transaction[];
  promo_transactions?: Transaction[];
  reserved?: { total: number; points_total: number; items: Array<{ consultation_request_id: number; amount: number; provider_name?: string | null; patient_name?: string | null; scheduled_at?: string | null }> };
  payments?: Array<{ id: number; status: string; amount_minor: number }>;
  first_topup_promotion?: {
    enabled: boolean;
    minimum_deposit: number;
    bonus_amount: number;
    max_payment_percent: number;
    doctors: Array<{ id: number; name: string }>;
    eligible_for_grant: boolean;
  };
}

type Pocket = 'money' | 'bonus';
type Filter = 'all' | Pocket;
type PaymentResult = 'ok' | 'pending' | 'fail';

/** Un rând din istoric: o operație sau o rezervare întreagă (rezervare → plătit / returnat). */
type HistoryRow = {
  key: string;
  date: string;
  pocket: Pocket;
  title: string;
  sub: string;
  amount: number;
  state?: ReservationState | null;
  transaction: Transaction;
};

const PENDING_RETRIES = 3;
const PENDING_INTERVAL_MS = 3000;
const QUICK_AMOUNTS = [250, 500, 1000];
const HOLD_KINDS = ['service_hold', 'points_service_hold', 'promo_service_hold'];
const REFUND_KINDS = ['service_refund', 'points_service_refund', 'promo_service_refund'];

export function WalletPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState('500');
  const [customAmount, setCustomAmount] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openTip, setOpenTip] = useState<Pocket | null>(null);
  const [selectedRow, setSelectedRow] = useState<HistoryRow | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(() => paymentResultParam(searchParams.get('payment')));
  const [pendingChecks, setPendingChecks] = useState(0);

  const loadWallet = () => {
    setError('');
    return apiRequest<WalletData>('/wallet')
      .then((data) => { setWalletData(data); return data; })
      .catch((err) => { setWalletData(null); setError(err instanceof Error ? err.message : 'Portofelul nu a putut fi încărcat.'); return null; });
  };

  useEffect(() => {
    void loadWallet();
    const topUpParam = searchParams.get('topup');
    const topUpAmount = Number(topUpParam);
    if (Number.isFinite(topUpAmount) && topUpAmount >= 10) {
      setAmount(String(Math.ceil(topUpAmount)));
      setCustomAmount(!QUICK_AMOUNTS.includes(Math.ceil(topUpAmount)));
      setIsTopUpOpen(true);
    } else if (topUpParam !== null) {
      setIsTopUpOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Întoarcerea de la MAIB: „pending” înseamnă că banca n-a confirmat încă; verificăm de câteva ori.
  useEffect(() => {
    if (paymentResult !== 'pending' || pendingChecks >= PENDING_RETRIES) return;
    const timer = window.setTimeout(() => {
      void loadWallet().then((data) => {
        const status = data?.payments?.[0]?.status;
        if (status === 'paid') setPaymentResult('ok');
        else if (status === 'failed') setPaymentResult('fail');
        setPendingChecks((count) => count + 1);
      });
    }, PENDING_INTERVAL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentResult, pendingChecks]);

  const dismissPaymentResult = () => {
    setPaymentResult(null);
    const next = new URLSearchParams(searchParams);
    next.delete('payment');
    setSearchParams(next, { replace: true });
  };

  const handleTopUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiRequest<{ pay?: { payUrl?: string } }>('/wallet/top-up', { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) });
      if (response.pay?.payUrl) {
        window.location.href = response.pay.payUrl;
        return;
      }
      throw new Error('Nu am primit linkul de plată.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut iniția plata.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const money = walletData?.wallet.balance ?? 0;
  const points = walletData?.points_wallet.balance ?? 0;
  const promo = walletData?.promo_wallet?.balance ?? 0;
  const bonusTotal = points + promo;
  const reserved = walletData?.reserved;
  const promotion = walletData?.first_topup_promotion;
  const rows = useMemo(() => historyRows(walletData), [walletData]);
  const visibleRows = rows.filter((row) => filter === 'all' || row.pocket === filter);
  const groups = groupByDay(visibleRows);
  const isEmpty = walletData !== null && money === 0 && bonusTotal === 0 && rows.length === 0;
  const numericAmount = Number(amount) || 0;
  const topupBonus = Math.round((numericAmount * (walletData?.topup_bonus_percent ?? 0)) / 100);
  const promoApplies = Boolean(promotion?.eligible_for_grant && numericAmount >= (promotion?.minimum_deposit ?? Infinity));

  const openTopUp = (value?: number) => {
    if (value) { setAmount(String(value)); setCustomAmount(!QUICK_AMOUNTS.includes(value)); }
    setError('');
    setIsTopUpOpen(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Portofel" documentTitle="Portofel" />

      {paymentResult && (
        <PaymentResultBanner result={paymentResult} stillChecking={paymentResult === 'pending' && pendingChecks < PENDING_RETRIES} money={money} bonus={bonusTotal}
          onClose={dismissPaymentResult} onRetry={() => { dismissPaymentResult(); openTopUp(); }} onRecheck={() => setPendingChecks(0)} />
      )}

      {error && !isTopUpOpen && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}<Button variant="outline" size="sm" onClick={() => void loadWallet()}>Reîncearcă</Button></div>}

      {!walletData && !error ? <Skeleton className="h-56 w-full rounded-2xl" /> : isEmpty ? (
        <EmptyWallet promotion={promotion} onTopUp={() => openTopUp(promotion?.eligible_for_grant ? promotion.minimum_deposit : undefined)} />
      ) : walletData && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <Balance label="Bani" value={`${mdl(money)} MDL`} large tipOpen={openTip === 'money'} onTip={() => setOpenTip(openTip === 'money' ? null : 'money')}
            tip={['Se folosesc pentru orice: consultații, pachete și redeschiderea chatului.', 'Îi adaugi cu cardul.']} />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Balance label="Bonusuri" value={mdl(bonusTotal)} tipOpen={openTip === 'bonus'} onTip={() => setOpenTip(openTip === 'bonus' ? null : 'bonus')}
              note={promo > 0 ? `din care ${mdl(promo)} credit promoțional · doar la medicii din campanie` : undefined}
              tip={[`Acoperă o parte din consultație, la medicii care le acceptă (până la ${walletData.max_bonus_payment_percent}%). 1 bonus = 1 MDL.`, 'Nu se folosesc pentru pachete.']} />
          </div>
          {reserved && reserved.total > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-slate-900"><PauseCircle className="h-4 w-4 text-slate-500" />Rezervat pentru consultații: {mdl(reserved.total)} MDL</p>
              <ul className="mt-1 space-y-0.5 pl-6 text-slate-500">
                {reserved.items.map((item) => (
                  <li key={item.consultation_request_id}>
                    <Link to={`/patient/chat?request=${item.consultation_request_id}`} className="hover:text-primary hover:underline">
                      {[item.provider_name, item.scheduled_at ? shortWhen(item.scheduled_at) : null, item.patient_name ? `pentru ${item.patient_name}` : null].filter(Boolean).join(' · ')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button className="mt-5 w-full sm:w-auto" onClick={() => openTopUp()}><Plus className="h-4 w-4" />Alimentează</Button>
        </section>
      )}

      {!isEmpty && (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">Istoric</h2>
            <div className="flex gap-1" role="radiogroup" aria-label="Filtru">
              {([['all', 'Toate'], ['money', 'Bani'], ['bonus', 'Bonusuri']] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={filter === value} onClick={() => setFilter(value)}
                  className={cn('h-8 rounded-full border px-3 text-xs font-semibold transition', filter === value ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!walletData ? <div className="p-5"><ListSkeleton rows={3} /></div> : groups.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Nicio operație aici încă.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {groups.map(([day, items]) => (
                <div key={day}>
                  <p className="bg-slate-50/80 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</p>
                  <ul className="divide-y divide-slate-100">
                    {items.map((row) => <HistoryItem key={row.key} row={row} onOpen={() => setSelectedRow(row)} />)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Sheet open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-lg gap-0 rounded-t-2xl">
          {selectedRow && <div className="px-5 pb-6 pt-1"><HistoryDetail row={selectedRow} /></div>}
        </SheetContent>
      </Sheet>

      <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleTopUp} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Alimentează</DialogTitle>
              <DialogDescription>Adaugi în Bani <span className="font-semibold text-slate-900">{mdl(numericAmount)} MDL</span></DialogDescription>
            </DialogHeader>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Suma">
              {QUICK_AMOUNTS.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={!customAmount && numericAmount === value} onClick={() => { setCustomAmount(false); setAmount(String(value)); }}
                  className={cn('h-11 rounded-xl border text-sm font-semibold tabular-nums transition', !customAmount && numericAmount === value ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
                  {value}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={customAmount} onClick={() => setCustomAmount(true)}
                className={cn('h-11 rounded-xl border text-sm font-semibold transition', customAmount ? 'border-primary text-primary ring-1 ring-primary' : 'border-dashed border-slate-300 text-slate-600')}>
                Altă sumă
              </button>
            </div>
            {customAmount && (
              <div className="relative">
                <label htmlFor="topup-amount" className="sr-only">Suma</label>
                <Input id="topup-amount" type="number" inputMode="numeric" min={10} max={50000} value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12 pr-14 text-lg font-semibold tabular-nums" autoFocus />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">MDL</span>
              </div>
            )}
            {(topupBonus > 0 || promoApplies) && (
              <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                {topupBonus > 0 && <p><span className="font-semibold">+{topupBonus} bonusuri</span> — {walletData?.topup_bonus_percent}% la alimentare</p>}
                {promoApplies && promotion && <p><span className="font-semibold">+{mdl(promotion.bonus_amount)} bonusuri</span> — bonus la prima alimentare. Ajung în „Bonusuri”, doar la medicii din campanie.</p>}
              </div>
            )}
            {promotion?.eligible_for_grant && !promoApplies && <p className="text-xs text-slate-500">Prima alimentare de minimum {mdl(promotion.minimum_deposit)} MDL vine cu {mdl(promotion.bonus_amount)} bonusuri.</p>}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-600">Total de plată</span>
              <span className="text-lg font-bold tabular-nums text-slate-950">{mdl(numericAmount)} MDL</span>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button type="submit" disabled={isSubmitting || numericAmount < 10 || numericAmount > 50000} size="lg" className="w-full"><CreditCard className="h-5 w-5" />{isSubmitting ? 'Se deschide plata…' : 'Plătește cu cardul'}</Button>
              <p className="flex items-center justify-center gap-1 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />Plată securizată MAIB</p>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Balance({ label, value, large = false, note, tip, tipOpen, onTip }: { label: string; value: string; large?: boolean; note?: string; tip: string[]; tipOpen: boolean; onTip: () => void }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        {label}
        <button type="button" onClick={onTip} aria-expanded={tipOpen} aria-label={`Ce sunt ${label.toLowerCase()}?`} className="rounded-full text-slate-400 hover:text-slate-700"><HelpCircle className="h-4 w-4" /></button>
      </p>
      <p className={cn('mt-1 font-bold tracking-tight tabular-nums text-slate-950', large ? 'text-4xl' : 'text-2xl')}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
      {tipOpen && <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{tip.map((line) => <p key={line}>{line}</p>)}</div>}
    </div>
  );
}

function EmptyWallet({ promotion, onTopUp }: { promotion?: WalletData['first_topup_promotion']; onTopUp: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-sm text-slate-500">Bani</dt><dd className="text-3xl font-bold text-slate-950">0 MDL</dd></div>
        <div><dt className="text-sm text-slate-500">Bonusuri</dt><dd className="text-3xl font-bold text-slate-950">0</dd></div>
      </dl>
      <ol className="mt-5 space-y-3">
        {['Alimentezi', 'Se rezervă la programare', 'Se plătesc după consultație'].map((step, index) => (
          <li key={step} className="flex items-center gap-3 text-sm text-slate-700">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>{step}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-6 text-slate-600">Banii se rezervă la programare și se plătesc medicului doar după consultație. Dacă se anulează, revin în portofel.</p>
      <Button className="mt-5 w-full sm:w-auto" onClick={onTopUp}><Plus className="h-4 w-4" />Alimentează</Button>
      {promotion?.eligible_for_grant && <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-800"><Gift className="h-4 w-4" />Prima alimentare vine cu {mdl(promotion.bonus_amount)} bonusuri.</p>}
    </section>
  );
}

function HistoryItem({ row, onOpen }: { row: HistoryRow; onOpen: () => void }) {
  const positive = row.amount > 0;
  const Glyph = row.state === 'reserved' ? PauseCircle : row.state === 'refunded' ? RotateCcw : row.state === 'paid' ? Check : positive ? ArrowDownLeft : ArrowUpRight;
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', positive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500')}><Glyph className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{row.title}</span>
          <span className="block truncate text-xs text-slate-500">{timeOnly(row.date)}{row.sub ? ` · ${row.sub}` : ''}</span>
        </span>
        {row.state && <StateChip state={row.state} />}
        <span className="shrink-0 text-right">
          <span className={cn('block text-sm font-semibold tabular-nums', positive ? 'text-emerald-600' : 'text-slate-900')}>{positive ? '+' : '−'}{mdl(Math.abs(row.amount))}</span>
          <span className="block text-[11px] text-slate-400">{row.pocket === 'money' ? 'Bani' : 'Bonusuri'}</span>
        </span>
      </button>
    </li>
  );
}

function StateChip({ state }: { state: ReservationState }) {
  const label = { reserved: 'Rezervat', paid: 'Plătit', refunded: 'Returnat' }[state];
  const tone = { reserved: 'bg-amber-50 text-amber-800', paid: 'bg-slate-100 text-slate-700', refunded: 'bg-emerald-50 text-emerald-700' }[state];
  return <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold sm:inline', tone)}>{label}</span>;
}

function HistoryDetail({ row }: { row: HistoryRow }) {
  const positive = row.amount > 0;
  const consultation = row.transaction.consultation;
  const steps = row.state ? [
    { label: 'Rezervat la programare', sub: 'Banii stau deoparte, nu s-au plătit.', done: true },
    row.state === 'refunded'
      ? { label: 'Returnat', sub: 'Banii au revenit în portofel (refuz, anulare sau neconfirmare).', done: true }
      : { label: 'Plătit după consultație', sub: 'Consultația a avut loc. Suma ajunge la medic.', done: row.state === 'paid' }
  ] : [];

  return (
    <div className="space-y-4">
      <SheetHeader className="p-0 pr-12 pt-4 text-left">
        <SheetDescription>{row.pocket === 'money' ? 'Bani' : 'Bonusuri'} · {new Date(row.date).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}</SheetDescription>
        <SheetTitle className={cn('text-3xl tabular-nums', positive ? 'text-emerald-600' : 'text-slate-950')}>{positive ? '+' : '−'}{mdl(Math.abs(row.amount))} {row.pocket === 'money' ? 'MDL' : 'bonusuri'}</SheetTitle>
        <p className="text-sm font-medium text-slate-900">{row.title}</p>
        {row.sub && <p className="text-sm text-slate-500">{row.sub}</p>}
      </SheetHeader>
      {steps.length > 0 && (
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.label} className="flex gap-3">
              <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', step.done ? 'bg-primary text-white' : 'border border-slate-300')}>{step.done && <Check className="h-3 w-3" />}</span>
              <span><span className="block text-sm font-medium text-slate-900">{step.label}</span><span className="block text-xs text-slate-500">{step.sub}</span></span>
            </li>
          ))}
        </ol>
      )}
      {row.transaction.consultation_request_id && (
        <Button asChild variant="outline" className="w-full"><Link to={`/patient/chat?request=${row.transaction.consultation_request_id}`}>Vezi consultația{consultation?.provider_name ? ` cu ${consultation.provider_name}` : ''}</Link></Button>
      )}
    </div>
  );
}

/**
 * Transformă tranzacțiile în rânduri de istoric. Rezervarea și returnarea aceleiași
 * consultații, din același buzunar, devin un singur rând cu starea curentă.
 */
function historyRows(data: WalletData | null): HistoryRow[] {
  if (!data) return [];
  const sources: Array<[Pocket, Transaction[]]> = [['money', data.transactions ?? []], ['bonus', [...(data.points_transactions ?? []), ...(data.promo_transactions ?? [])]]];
  const rows: HistoryRow[] = [];

  for (const [pocket, transactions] of sources) {
    const holds = new Map<string, Transaction>();
    transactions.filter((tx) => HOLD_KINDS.includes(tx.kind ?? '') && tx.consultation_request_id).forEach((tx) => holds.set(`${tx.kind}-${tx.consultation_request_id}`, tx));

    for (const tx of transactions) {
      const kind = tx.kind ?? '';
      const state = tx.consultation?.reservation_state ?? null;
      if (REFUND_KINDS.includes(kind) && tx.consultation_request_id && holds.has(`${kind.replace('refund', 'hold')}-${tx.consultation_request_id}`)) continue;

      const isHold = HOLD_KINDS.includes(kind);
      const refund = isHold && state === 'refunded'
        ? transactions.find((other) => other.kind === kind.replace('hold', 'refund') && other.consultation_request_id === tx.consultation_request_id)
        : undefined;
      const provider = tx.consultation?.provider_name;
      const forWhom = tx.consultation?.patient_name ? `pentru ${tx.consultation.patient_name}` : '';

      rows.push({
        key: `${pocket}-${tx.id}`,
        date: refund?.date ?? tx.date,
        pocket,
        title: isHold
          ? state === 'refunded' ? `Returnat — consultație ${provider ?? ''}`.trim() : state === 'paid' ? `Plătit după consultație ${provider ?? ''}`.trim() : `Consultație ${provider ?? ''} — rezervat`.trim()
          : transactionTitle(tx),
        sub: [forWhom, tx.consultation?.scheduled_at ? shortWhen(tx.consultation.scheduled_at) : ''].filter(Boolean).join(' · '),
        amount: refund ? Math.abs(refund.amount) : tx.amount,
        state: isHold ? state : null,
        transaction: tx
      });
    }
  }

  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function transactionTitle(tx: Transaction): string {
  const titles: Record<string, string> = {
    top_up: 'Alimentare cu cardul',
    topup_bonus: 'Bonus la alimentare',
    first_topup_promotion: 'Bonus la prima alimentare',
    patient_card_bonus: 'Bonus la pachet',
    service_refund: 'Returnat — consultație',
    chat_reactivation: 'Redeschiderea chatului'
  };
  return titles[tx.kind ?? ''] ?? tx.type.replace(/\s*\([^)]+\)/g, '').trim();
}

function shortWhen(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Chisinau' })} ${date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Chisinau' })}`;
}

function groupByDay<T extends { date: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const label = relativeDay(item.date);
    const day = ['Azi', 'Ieri', 'Mâine'].includes(label) ? label : new Date(item.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
    groups.set(day, [...(groups.get(day) ?? []), item]);
  });
  return [...groups.entries()];
}

function mdl(value: unknown): string {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function paymentResultParam(value: string | null): PaymentResult | null {
  return value === 'ok' || value === 'pending' || value === 'fail' ? value : null;
}

function PaymentResultBanner({ result, stillChecking, money, bonus, onClose, onRetry, onRecheck }: {
  result: PaymentResult;
  stillChecking: boolean;
  money: number;
  bonus: number;
  onClose: () => void;
  onRetry: () => void;
  onRecheck: () => void;
}) {
  if (result === 'ok') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <p className="min-w-0 flex-1"><span className="font-semibold">Alimentare reușită.</span> Bani {mdl(money)} MDL · Bonusuri {mdl(bonus)}.</p>
        <Button variant="outline" size="sm" className="bg-white" onClick={onClose}>Închide</Button>
      </div>
    );
  }

  if (result === 'pending') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <Wallet className="h-5 w-5 shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Banca confirmă plata.</span>{' '}
          {stillChecking ? 'Pagina se actualizează singură când banca răspunde.' : 'Încă nu avem răspunsul băncii.'} Nu plătești de două ori dacă o închizi.
        </p>
        {!stillChecking && <Button variant="outline" size="sm" className="bg-white" onClick={onRecheck}>Verifică din nou</Button>}
      </div>
    );
  }

  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <CreditCard className="h-5 w-5 shrink-0" />
      <p className="min-w-0 flex-1"><span className="font-semibold">Plata nu a trecut.</span> Banca a refuzat tranzacția. De pe card nu s-a retras nimic. Verifică soldul cardului sau încearcă alt card.</p>
      <Button size="sm" onClick={onRetry}>Încearcă din nou</Button>
      <Button variant="ghost" size="sm" onClick={onClose}>Închide</Button>
    </div>
  );
}
