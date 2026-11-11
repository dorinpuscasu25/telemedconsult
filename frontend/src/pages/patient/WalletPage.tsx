import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, ChevronRight, CreditCard, Gift, Lock, Pause, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { apiRequest } from '../../lib/api';

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
  first_topup_promotion?: { enabled: boolean; minimum_deposit: number; bonus_amount: number; max_payment_percent: number; doctors: Array<{ id: number; name: string }>; eligible_for_grant: boolean };
}

type Pocket = 'money' | 'bonus';
type Filter = 'all' | Pocket;
type PaymentResult = 'ok' | 'pending' | 'fail';

/** Un rând din istoric: o operație sau o rezervare întreagă (rezervat → plătit / returnat). */
type HistoryRow = { key: string; date: string; pocket: Pocket; title: string; sub: string; amount: number; state?: ReservationState | null; transaction: Transaction; note?: string };

const PENDING_RETRIES = 3;
const PENDING_INTERVAL_MS = 3000;
const QUICK_AMOUNTS = [200, 500, 1000];
const HOLD_KINDS = ['service_hold', 'points_service_hold', 'promo_service_hold'];
const REFUND_KINDS = ['service_refund', 'points_service_refund', 'promo_service_refund'];
const TZ = 'Europe/Chisinau';

/** Culorile stărilor, ca în design: Rezervat (galben), Plătit (gri), Returnat (verde). */
const STATE_STYLE: Record<ReservationState, { label: string; className: string }> = {
  reserved: { label: 'Rezervat', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Plătit', className: 'bg-slate-100 text-slate-700' },
  refunded: { label: 'Returnat', className: 'bg-green-50 text-green-700' }
};

/**
 * Portofelul: „Bani” mare, „Bonusuri” dedesubt, rezervările separat, cu link spre
 * consultație, și istoricul în care o rezervare e un singur rând a cărui stare evoluează.
 */
export function WalletPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState(500);
  const [customAmount, setCustomAmount] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openTip, setOpenTip] = useState<Pocket | null>(null);
  const [selectedRow, setSelectedRow] = useState<HistoryRow | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(() => paymentResultParam(searchParams.get('payment')));
  const [pendingChecks, setPendingChecks] = useState(0);
  const historyOnly = searchParams.get('view') === 'istoric';

  const loadWallet = () => {
    setError('');
    return apiRequest<WalletData>('/wallet')
      .then((data) => { setWalletData(data); return data; })
      .catch((err) => { setError(err instanceof Error ? err.message : 'Portofelul nu a putut fi încărcat.'); return null; });
  };

  useEffect(() => {
    document.title = 'Portofel · telemedconsult.md';
    void loadWallet();
    const topUpAmount = Number(searchParams.get('topup'));
    if (Number.isFinite(topUpAmount) && topUpAmount >= 10) {
      setAmount(Math.ceil(topUpAmount));
      setCustomAmount(!QUICK_AMOUNTS.includes(Math.ceil(topUpAmount)));
      setIsTopUpOpen(true);
    } else if (searchParams.get('topup') !== null) {
      setIsTopUpOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('topup');
    setSearchParams(next, { replace: true });
  };
  const closeResult = () => { setPaymentResult(null); setParam('payment', null); };

  const startTopUp = async (value: number) => {
    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiRequest<{ pay?: { payUrl?: string } }>('/wallet/top-up', { method: 'POST', body: JSON.stringify({ amount: value }) });
      if (!response.pay?.payUrl) throw new Error('Nu am primit linkul de plată.');
      window.location.href = response.pay.payUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut iniția plata.');
      setIsSubmitting(false);
    }
  };
  const handleTopUp = (event: FormEvent) => { event.preventDefault(); void startTopUp(amount); };
  const openTopUp = (value?: number) => {
    if (value) { setAmount(value); setCustomAmount(!QUICK_AMOUNTS.includes(value)); }
    setError('');
    setIsTopUpOpen(true);
  };

  const money = walletData?.wallet.balance ?? 0;
  const points = walletData?.points_wallet.balance ?? 0;
  const promo = walletData?.promo_wallet?.balance ?? 0;
  const bonusTotal = points + promo;
  const promotion = walletData?.first_topup_promotion;
  const rows = useMemo(() => historyRows(walletData), [walletData]);
  const visibleRows = rows.filter((row) => filter === 'all' || row.pocket === filter);
  const isEmpty = walletData !== null && money === 0 && bonusTotal === 0 && rows.length === 0;
  const lastPaymentAmount = (walletData?.payments?.[0]?.amount_minor ?? amount * 100) / 100;
  const topupBonus = Math.round((amount * (walletData?.topup_bonus_percent ?? 0)) / 100);
  const promoApplies = Boolean(promotion?.eligible_for_grant && amount >= (promotion?.minimum_deposit ?? Infinity));

  // Ecranele de întoarcere de la plată (W3b–W3d) iau locul paginii.
  if (paymentResult) {
    return (
      <ResultScreen
        result={paymentResult}
        amount={lastPaymentAmount}
        money={money}
        bonus={bonusTotal}
        stillChecking={paymentResult === 'pending' && pendingChecks < PENDING_RETRIES}
        onRecheck={() => setPendingChecks(0)}
        onClose={closeResult}
        onRetry={() => { closeResult(); void startTopUp(lastPaymentAmount); }}
        onOtherAmount={() => { closeResult(); openTopUp(); }}
      />
    );
  }

  if (historyOnly) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setParam('view', null)} className="flex items-center gap-2 text-lg font-semibold text-slate-950"><ArrowLeft className="h-5 w-5" />Istoric</button>
        <PocketFilter value={filter} onChange={setFilter} stretch />
        <HistoryList rows={visibleRows} loading={!walletData} compact onOpen={setSelectedRow} />
        <DetailSheet row={selectedRow} onClose={() => setSelectedRow(null)} onOpenConsultation={(id) => navigate(`/patient/chat?request=${id}`)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[26px] font-bold tracking-tight text-slate-950 lg:text-[28px]">Portofel</h1>

      {error && !isTopUpOpen && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}<Button variant="outline" size="sm" onClick={() => void loadWallet()}>Reîncearcă</Button></div>}

      {!walletData && !error ? <Skeleton className="h-56 w-full rounded-2xl" /> : isEmpty ? (
        <EmptyWallet promotion={promotion} onTopUp={() => openTopUp(promotion?.eligible_for_grant ? promotion.minimum_deposit : undefined)} />
      ) : walletData && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <section className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-5 text-white lg:p-[22px]">
              <div className="flex flex-col gap-1">
                <TipLabel label="Bani" open={openTip === 'money'} onToggle={() => setOpenTip(openTip === 'money' ? null : 'money')} />
                <p className="text-[40px] font-bold leading-[1.1] tracking-tight">{groupThousands(money)} <span className="text-base font-medium text-slate-400">MDL</span></p>
                {openTip === 'money' && <Tip>Se folosesc pentru orice: consultații, pachete și redeschiderea chatului.<br />Îi adaugi cu cardul.</Tip>}
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <TipLabel label="Bonusuri" open={openTip === 'bonus'} onToggle={() => setOpenTip(openTip === 'bonus' ? null : 'bonus')} />
                  <span className="text-xl font-semibold">{groupThousands(bonusTotal)}</span>
                </div>
                {promo > 0 && <span className="text-xs text-slate-400">din care {groupThousands(promo)} credit promoțional · doar la medicii din campanie</span>}
                {openTip === 'bonus' && <Tip>Acoperă o parte din consultație, la medicii care le acceptă (până la {walletData.max_bonus_payment_percent}%). 1 bonus = 1 MDL.<br />Nu se folosesc pentru pachete.</Tip>}
              </div>
              <button type="button" onClick={() => openTopUp()} className="hidden h-[46px] items-center justify-center rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 lg:flex">Alimentează</button>
            </section>

            {(walletData.reserved?.items ?? []).map((item) => (
              <Link key={item.consultation_request_id} to={`/patient/chat?request=${item.consultation_request_id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900 hover:border-slate-300">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-600 lg:hidden"><Lock className="h-4 w-4" /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">Rezervat pentru consultații: {groupThousands(item.amount)} MDL</span>
                  <span className="truncate text-[13px] text-blue-600">{[item.provider_name, item.scheduled_at ? shortWhen(item.scheduled_at) : null, item.patient_name ? `pentru ${item.patient_name}` : null].filter(Boolean).join(' · ')}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            ))}

            <button type="button" onClick={() => openTopUp()} className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 lg:hidden"><Plus className="h-4 w-4" />Alimentează</button>

            {/* Mobil: ultimele două operații, restul sub „Vezi tot”. */}
            <div className="lg:hidden">
              <div className="flex items-center justify-between px-1 pb-3 pt-2"><span className="text-base font-semibold text-slate-950">Istoric</span><button type="button" onClick={() => setParam('view', 'istoric')} className="text-sm font-medium text-blue-600">Vezi tot</button></div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {rows.slice(0, 2).map((row, index) => (
                  <button key={row.key} type="button" onClick={() => setSelectedRow(row)} className={cn('flex w-full items-center gap-3 px-3.5 py-3 text-left', index > 0 && 'border-t border-slate-100')}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-sm font-medium text-slate-900">{row.title}</span><span className="text-xs text-slate-500">{relativeShort(row.date)} · {row.pocket === 'money' ? 'Bani' : 'Bonusuri'}</span></span>
                    <span className={cn('text-sm font-semibold tabular-nums', row.amount > 0 ? 'text-green-600' : 'text-slate-900')}>{signed(row.amount)}</span>
                  </button>
                ))}
                {rows.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nicio operație încă.</p>}
              </div>
            </div>
          </div>

          <section className="hidden min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:flex">
            <div className="flex items-center justify-between px-5 py-4"><span className="text-base font-semibold text-slate-950">Istoric</span><PocketFilter value={filter} onChange={setFilter} /></div>
            <HistoryList rows={visibleRows} loading={false} onOpen={setSelectedRow} />
          </section>
        </div>
      )}

      <DetailSheet row={selectedRow} onClose={() => setSelectedRow(null)} onOpenConsultation={(id) => navigate(`/patient/chat?request=${id}`)} />

      {/* Alimentarea (W3a): pe tot ecranul pe telefon, dialog pe desktop. */}
      <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
        <DialogContent className="flex flex-col gap-0 p-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-w-[420px] sm:p-0 [&>button:last-child]:hidden">
          <form onSubmit={handleTopUp} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-1 px-2 pb-2 pt-3">
              <button type="button" onClick={() => setIsTopUpOpen(false)} aria-label="Închide" className="grid h-10 w-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              <DialogTitle className="text-lg font-semibold">Alimentează</DialogTitle>
              <DialogDescription className="sr-only">Alege suma și plătește cu cardul.</DialogDescription>
            </div>
            <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-4">
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex flex-col items-center gap-1.5 py-4">
                <span className="text-[13px] text-slate-500">Adaugi în Bani</span>
                <span className="text-[44px] font-bold tracking-tight text-slate-950">{groupThousands(amount)} <span className="text-lg font-medium text-slate-500">MDL</span></span>
              </div>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Suma">
                {QUICK_AMOUNTS.map((value) => (
                  <AmountButton key={value} selected={!customAmount && amount === value} onClick={() => { setCustomAmount(false); setAmount(value); }}>{value}</AmountButton>
                ))}
                <AmountButton selected={customAmount} onClick={() => setCustomAmount(true)}>Altă sumă</AmountButton>
              </div>
              {customAmount && (
                <label className="flex h-12 items-center justify-between rounded-[10px] border-2 border-blue-600 px-3.5 text-base ring-[3px] ring-blue-600/15">
                  <span className="sr-only">Suma</span>
                  <input type="number" inputMode="numeric" min={10} max={50000} autoFocus value={amount || ''} onChange={(event) => setAmount(Number(event.target.value) || 0)} className="w-full bg-transparent tabular-nums outline-none" />
                  <span className="text-sm text-slate-500">MDL</span>
                </label>
              )}
              {(promoApplies || topupBonus > 0) && (
                <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-amber-100 text-amber-700"><Gift className="h-4 w-4" /></span>
                  <span className="flex flex-col gap-0.5">
                    {promoApplies && promotion && <><span className="text-sm font-semibold text-amber-900">+{groupThousands(promotion.bonus_amount)} bonusuri — bonus la prima alimentare</span><span className="text-xs text-amber-800">Ajung în „Bonusuri”, doar la medicii din campanie.</span></>}
                    {topupBonus > 0 && <span className={cn('text-amber-900', promoApplies ? 'text-xs' : 'text-sm font-semibold')}>+{topupBonus} bonusuri — {walletData?.topup_bonus_percent}% la alimentare</span>}
                  </span>
                </div>
              )}
              <div className="min-h-4 flex-1" />
              <div className="flex justify-between px-0.5 text-[15px]"><span className="text-slate-600">Total de plată</span><span className="font-semibold text-slate-950">{groupThousands(amount)} MDL</span></div>
              <Button type="submit" disabled={isSubmitting || amount < 10 || amount > 50000} className="h-12 text-[15px] font-semibold"><CreditCard className="h-4 w-4" />{isSubmitting ? 'Se deschide plata…' : 'Plătește cu cardul'}</Button>
              <span className="-mt-2.5 text-center text-xs text-slate-500">Plată securizată MAIB</span>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TipLabel({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-slate-300">
      {label}
      <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`Ce sunt ${label.toLowerCase()}?`} className="grid h-[22px] w-[22px] place-items-center rounded-full border border-white/30 text-xs font-semibold text-slate-300">?</button>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 rounded-[10px] bg-white/[.08] px-3 py-2.5 text-[13px] leading-[1.45] text-slate-200">{children}</div>;
}

function AmountButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onClick}
      className={cn('h-12 rounded-[10px] px-1 text-[15px] font-semibold leading-tight transition', selected ? 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700' : 'border border-slate-200 bg-white text-slate-900 hover:border-slate-300')}>
      {children}
    </button>
  );
}

function PocketFilter({ value, onChange, stretch = false }: { value: Filter; onChange: (value: Filter) => void; stretch?: boolean }) {
  return (
    <div className={cn('flex gap-0.5 rounded-[10px] bg-slate-100 p-[3px]', stretch && 'w-full')} role="radiogroup" aria-label="Filtru">
      {([['all', 'Toate'], ['money', 'Bani'], ['bonus', 'Bonusuri']] as const).map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={value === key} onClick={() => onChange(key)}
          className={cn('h-[30px] rounded-lg px-3 text-[13px] font-medium', stretch && 'flex-1', value === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function HistoryList({ rows, loading, onOpen, compact = false }: { rows: HistoryRow[]; loading: boolean; onOpen: (row: HistoryRow) => void; compact?: boolean }) {
  if (loading) return <Skeleton className="h-60 w-full" />;
  if (rows.length === 0) return <p className="border-t border-slate-100 p-6 text-center text-sm text-slate-500">Nicio operație aici încă.</p>;
  return (
    <div className={compact ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white' : undefined}>
      {groupByDay(rows).map(([day, items]) => (
        <div key={day}>
          <p className={cn('border-t border-slate-100 bg-slate-50 py-2 text-xs font-semibold text-slate-500', compact ? 'px-4' : 'px-5')}>{day}</p>
          {items.map((row) => <HistoryItem key={row.key} row={row} compact={compact} onOpen={() => onOpen(row)} />)}
        </div>
      ))}
    </div>
  );
}

function HistoryItem({ row, compact, onOpen }: { row: HistoryRow; compact: boolean; onOpen: () => void }) {
  const plus = row.amount > 0;
  const Glyph = plus ? ArrowDownLeft : row.state === 'reserved' ? Pause : ArrowUpRight;
  const chip = row.state ? <span className={cn('shrink-0 rounded-full px-2 py-[3px] text-[11px] font-semibold', STATE_STYLE[row.state].className)}>{STATE_STYLE[row.state].label}</span> : null;
  return (
    <button type="button" onClick={onOpen} className={cn('flex w-full items-center gap-3 border-t border-slate-100 py-3 text-left transition hover:bg-slate-50', compact ? 'px-4' : 'px-5')}>
      <span className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full', plus ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-600')}><Glyph className="h-4 w-4" /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-slate-900">{row.title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500"><span className="truncate">{row.sub}</span>{compact && chip}</span>
      </span>
      {!compact && chip}
      <span className="flex w-24 shrink-0 flex-col items-end gap-0.5">
        <span className={cn('text-sm font-semibold tabular-nums', plus ? 'text-green-600' : 'text-slate-900')}>{signed(row.amount)}</span>
        <span className="text-[11px] text-slate-400">{row.pocket === 'money' ? 'MDL · Bani' : 'Bonusuri'}</span>
      </span>
    </button>
  );
}

function DetailSheet({ row, onClose, onOpenConsultation }: { row: HistoryRow | null; onClose: () => void; onOpenConsultation: (id: number) => void }) {
  const plus = (row?.amount ?? 0) > 0;
  const steps = row?.state ? [
    { label: 'Rezervat la programare', sub: 'Banii stau deoparte, nu s-au plătit.', status: row.state === 'reserved' ? 'cur' : 'done' },
    row.state === 'refunded'
      ? { label: 'Returnat', sub: 'Banii au revenit în portofel (refuz, anulare sau neconfirmare).', status: 'ret' }
      : { label: 'Plătit după consultație', sub: 'Consultația a avut loc. Suma ajunge la medic.', status: row.state === 'paid' ? 'done' : 'todo' }
  ] : [];

  return (
    <Sheet open={row !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} className="mx-auto max-w-lg gap-4 rounded-t-[20px] px-5 pb-8 pt-2.5">
        <div className="h-1 w-10 self-center rounded-full bg-slate-200" />
        <SheetTitle className="sr-only">{row?.title ?? 'Operație'}</SheetTitle>
        <SheetDescription className="sr-only">Detaliul operației din portofel.</SheetDescription>
        {row && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-slate-500">{row.pocket === 'money' ? 'Bani' : 'Bonusuri'} · {longWhen(row.date)}</span>
              <span className={cn('text-[30px] font-bold tracking-tight tabular-nums', plus ? 'text-green-600' : 'text-slate-900')}>{signed(row.amount)} <span className="text-[15px] font-medium text-slate-500">{row.pocket === 'money' ? 'MDL' : 'bonusuri'}</span></span>
              <span className="text-[15px] font-medium text-slate-900">{row.title}</span>
              {row.sub && <span className="text-[13px] text-slate-500">{row.sub}</span>}
            </div>
            {steps.length > 0 && (
              <div className="flex flex-col rounded-2xl border border-slate-200 p-3.5">
                {steps.map((step, index) => {
                  const last = index === steps.length - 1;
                  return (
                    <div key={step.label} className="flex gap-3">
                      <div className="flex w-5 flex-col items-center">
                        <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white', step.status === 'done' || step.status === 'ret' ? 'bg-green-600' : step.status === 'cur' ? 'border-2 border-blue-600 bg-white' : 'border-2 border-slate-200 bg-white')}>
                          {step.status === 'done' ? <Check className="h-3 w-3" /> : step.status === 'ret' ? '↺' : ''}
                        </span>
                        <span className={cn('min-h-3.5 w-0.5 flex-1', last ? 'bg-transparent' : step.status === 'done' ? 'bg-green-200' : 'bg-slate-200')} />
                      </div>
                      <div className="flex flex-col gap-0.5 pb-3">
                        <span className={cn('text-sm text-slate-900', step.status === 'cur' ? 'font-semibold' : 'font-medium')}>{step.label}</span>
                        <span className="text-xs text-slate-500">{step.sub}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {row.note && <span className="text-[13px] leading-[1.45] text-slate-600">{row.note}</span>}
            {row.transaction.consultation_request_id
              ? <button type="button" onClick={() => onOpenConsultation(row.transaction.consultation_request_id as number)} className="h-[46px] rounded-[10px] border border-slate-200 bg-white text-[15px] font-medium text-slate-900 hover:bg-slate-50">Vezi consultația</button>
              : <button type="button" onClick={onClose} className="h-[46px] rounded-[10px] border border-slate-200 bg-white text-[15px] font-medium text-slate-900 hover:bg-slate-50">Închide</button>}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyWallet({ promotion, onTopUp }: { promotion?: WalletData['first_topup_promotion']; onTopUp: () => void }) {
  return (
    <div className="flex max-w-md flex-col gap-3.5">
      <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-1"><span className="text-[13px] text-slate-500">Bani</span><span className="text-[40px] font-bold leading-[1.1] tracking-tight text-slate-950">0 <span className="text-base font-medium text-slate-400">MDL</span></span></div>
        <div className="flex justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-500">Bonusuri</span><span className="font-semibold text-slate-950">0</span></div>
      </section>
      <section className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-[18px]">
        <ol className="grid grid-cols-3 gap-1.5 text-center text-xs text-slate-600">
          {['Alimentezi', 'Se rezervă la programare', 'Se plătesc după consultație'].map((step, index) => (
            <li key={step} className="flex flex-col items-center gap-1.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 font-bold text-blue-600">{index + 1}</span>{step}</li>
          ))}
        </ol>
        <p className="mt-1.5 text-sm leading-[1.55] text-slate-700">Banii se rezervă la programare și se plătesc medicului doar după consultație. Dacă se anulează, revin în portofel.</p>
      </section>
      <button type="button" onClick={onTopUp} className="h-12 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700">Alimentează</button>
      {promotion?.eligible_for_grant && <span className="text-center text-[13px] text-amber-700">Prima alimentare vine cu {groupThousands(promotion.bonus_amount)} bonusuri.</span>}
    </div>
  );
}

/** W3b–W3d: rezultatul plății, pe ecran întreg pe telefon și ca un card pe desktop. */
function ResultScreen({ result, amount, money, bonus, stillChecking, onRecheck, onClose, onRetry, onOtherAmount }: {
  result: PaymentResult; amount: number; money: number; bonus: number; stillChecking: boolean;
  onRecheck: () => void; onClose: () => void; onRetry: () => void; onOtherAmount: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-12rem)] max-w-md flex-col rounded-[28px] bg-white px-5 pb-8 sm:border sm:border-slate-200 sm:shadow-sm">
      <div className="flex flex-1 flex-col justify-center gap-5 py-10">
        {result === 'ok' && <span className="grid h-14 w-14 place-items-center rounded-full bg-green-50 text-green-600"><Check className="h-6 w-6" /></span>}
        {result === 'pending' && <span className={cn('h-14 w-14 rounded-full border-4 border-blue-100 border-t-blue-600', stillChecking && 'animate-spin')} />}
        {result === 'fail' && <span className="grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600"><AlertCircle className="h-6 w-6" /></span>}
        <div className="flex flex-col gap-1.5">
          <span className="text-[26px] font-bold tracking-tight text-slate-950">{result === 'ok' ? 'Alimentare reușită' : result === 'pending' ? 'Banca confirmă plata' : 'Plata nu a trecut'}</span>
          <span className="text-[15px] leading-normal text-slate-500">
            {result === 'ok' ? 'Banii sunt în portofel.' : result === 'pending' ? `${groupThousands(amount)} MDL. Pagina se actualizează singură când banca răspunde. Nu plătești de două ori dacă o închizi.` : 'Banca a refuzat tranzacția. De pe card nu s-a retras nimic. Verifică soldul cardului sau încearcă alt card.'}
          </span>
        </div>
        {result === 'ok' && (
          <div className="rounded-2xl border border-slate-200">
            <div className="flex justify-between px-4 py-3.5 text-sm"><span className="text-slate-500">Bani</span><span className="font-semibold text-slate-950">{groupThousands(money)} MDL</span></div>
            <div className="flex justify-between border-t border-slate-100 px-4 py-3.5 text-sm"><span className="text-slate-500">Bonusuri</span><span className="font-semibold text-slate-950">{groupThousands(bonus)}</span></div>
          </div>
        )}
      </div>
      {result === 'ok' && <button type="button" onClick={onClose} className="h-12 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700">Mergi la portofel</button>}
      {result === 'pending' && <button type="button" onClick={onRecheck} disabled={stillChecking} className="h-12 rounded-[10px] border border-slate-200 bg-white text-[15px] font-medium text-slate-900 disabled:opacity-60">Verifică din nou</button>}
      {result === 'fail' && (
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={onRetry} className="h-12 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700">Încearcă din nou · {groupThousands(amount)} MDL</button>
          <button type="button" onClick={onOtherAmount} className="h-12 rounded-[10px] border border-slate-200 bg-white text-[15px] font-medium text-slate-900">Alege altă sumă</button>
        </div>
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
    const holds = new Set(transactions.filter((tx) => HOLD_KINDS.includes(tx.kind ?? '') && tx.consultation_request_id).map((tx) => `${tx.kind}-${tx.consultation_request_id}`));

    for (const tx of transactions) {
      const kind = tx.kind ?? '';
      if (REFUND_KINDS.includes(kind) && tx.consultation_request_id && holds.has(`${kind.replace('refund', 'hold')}-${tx.consultation_request_id}`)) continue;
      const state = HOLD_KINDS.includes(kind) ? tx.consultation?.reservation_state ?? null : null;
      const refund = state === 'refunded' ? transactions.find((other) => other.kind === kind.replace('hold', 'refund') && other.consultation_request_id === tx.consultation_request_id) : undefined;
      const provider = tx.consultation?.provider_name ?? '';
      const forWhom = tx.consultation?.patient_name ? `pentru ${tx.consultation.patient_name}` : '';
      const when = tx.consultation?.scheduled_at ? shortWhen(tx.consultation.scheduled_at) : '';
      const description = describeTransaction(tx, pocket, state, provider, [forWhom, when].filter(Boolean).join(' · '));

      rows.push({ key: `${pocket}-${tx.id}`, date: refund?.date ?? tx.date, pocket, amount: refund ? Math.abs(refund.amount) : tx.amount, state, transaction: tx, ...description });
    }
  }

  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function describeTransaction(tx: Transaction, pocket: Pocket, state: ReservationState | null, provider: string, details: string): { title: string; sub: string; note?: string } {
  const kind = tx.kind ?? '';
  if (HOLD_KINDS.includes(kind)) {
    if (pocket === 'bonus' && state !== 'refunded') return { title: 'Bonusuri folosite la consultație', sub: [provider, details].filter(Boolean).join(' · '), note: 'Bonusurile se rezervă și se consumă la fel ca banii: doar după consultație.' };
    if (state === 'refunded') return { title: 'Returnat — consultația nu a avut loc', sub: `${provider}${provider ? ' · ' : ''}banii au revenit în ${pocket === 'money' ? 'Bani' : 'Bonusuri'}` };
    if (state === 'paid') return { title: 'Plătit după consultație', sub: [provider, details].filter(Boolean).join(' · ') };
    return { title: provider ? `Consultație ${provider} — rezervat` : 'Consultație — rezervat', sub: details || 'Banii stau deoparte, nu s-au plătit' };
  }
  const titles: Record<string, { title: string; sub: string; note?: string }> = {
    top_up: { title: 'Alimentare cu cardul', sub: 'MAIB' },
    topup_bonus: { title: 'Bonus la alimentare', sub: 'Bonusuri' },
    first_topup_promotion: { title: 'Bonus la prima alimentare', sub: 'Doar la medicii din campanie', note: 'Credit promoțional. Se folosește la fel ca bonusurile, doar la medicii din campanie.' },
    patient_card_purchase: { title: tx.type.replace(/^Cumpărare cartelă pacient:\s*/i, 'Pachet '), sub: 'Pachet pentru profilurile de pacient', note: 'Pachetele se plătesc doar din Bani.' },
    patient_card_bonus: { title: 'Bonus la pachet', sub: 'Bonusuri' },
    chat_reactivation: { title: 'Redeschiderea chatului', sub: '24 h de chat cu medicul' },
    registration_bonus: { title: 'Bonus de bun-venit', sub: 'Bonusuri' }
  };
  return titles[kind] ?? { title: tx.type.replace(/\s*\([^)]+\)/g, '').trim(), sub: '' };
}

function groupByDay(rows: HistoryRow[]): Array<[string, HistoryRow[]]> {
  const groups = new Map<string, HistoryRow[]>();
  rows.forEach((row) => {
    const label = dayLabel(row.date);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  });
  return [...groups.entries()];
}

function dayKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** „Azi”, „Ieri” sau „Marți, 3 noiembrie”. */
function dayLabel(value: string): string {
  const date = new Date(value);
  if (dayKey(date) === dayKey(new Date())) return 'Azi';
  if (dayKey(date) === dayKey(new Date(Date.now() - 86400000))) return 'Ieri';
  const text = date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function relativeShort(value: string): string {
  const label = dayLabel(value);
  return label === 'Azi' || label === 'Ieri' ? label : new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: TZ }).replace('.', '');
}

function shortWhen(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString('ro-RO', { weekday: 'short', timeZone: TZ }).replace('.', '')} ${date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`;
}

function longWhen(value: string): string {
  return new Date(value).toLocaleString('ro-RO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

/** 1250 → „1 250”, cu spațiu fix între mii, ca în design. */
function groupThousands(value: unknown): string {
  const numeric = Number(value) || 0;
  const fixed = Number.isInteger(numeric) ? String(Math.abs(numeric)) : Math.abs(numeric).toFixed(2);
  const [whole, decimals] = fixed.split('.');
  return `${numeric < 0 ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${decimals ? `,${decimals}` : ''}`;
}

function signed(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${groupThousands(Math.abs(value))}`;
}

function paymentResultParam(value: string | null): PaymentResult | null {
  return value === 'ok' || value === 'pending' || value === 'fail' ? value : null;
}
