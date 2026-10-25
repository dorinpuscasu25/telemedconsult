import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, CreditCard, Gift, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ListSkeleton, Skeleton } from '../../components/ui/skeleton';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { apiRequest } from '../../lib/api';
import { money, num, relativeDay, timeOnly } from '../../lib/format';

interface WalletData {
  topup_bonus_percent: number;
  max_bonus_payment_percent: number;
  points_transactions: WalletData['transactions'];
  promo_transactions?: WalletData['transactions'];
  promo_wallet?: { balance: number; currency: string };
  first_topup_promotion?: {
    enabled: boolean;
    minimum_deposit: number;
    bonus_amount: number;
    max_payment_percent: number;
    doctors: Array<{ id: number; name: string }>;
    eligible_for_grant: boolean;
    grant?: { doctor_ids: number[]; max_payment_percent: number } | null;
  };
  wallet: {
    id: number;
    balance: number;
    currency: string;
  };
  points_wallet: {
    id: number;
    balance: number;
    currency: string;
    type: 'points';
  };
  transactions: Array<{
    id: number;
    date: string;
    type: string;
    amount: number;
    status: string;
  }>;
}

type PaymentRedirect = {
  payUrl?: string;
  payId?: string;
};

export function WalletPage() {
  const [searchParams] = useSearchParams();
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState('500');
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pocketFilter, setPocketFilter] = useState<'all' | 'base' | 'bonus'>('all');
  const [showPromoDetails, setShowPromoDetails] = useState(false);

  const loadWallet = () => {
    setError('');
    apiRequest<WalletData>('/wallet').then(setWalletData).catch((err) => { setWalletData(null); setError(err instanceof Error ? err.message : 'Portofelele nu au putut fi încărcate.'); });
  };

  useEffect(() => {
    loadWallet();
    const topUpParam = searchParams.get('topup');
    const topUpAmount = Number(topUpParam);
    if (Number.isFinite(topUpAmount) && topUpAmount >= 10) {
      setAmount(String(Math.ceil(topUpAmount)));
      setIsTopUpOpen(true);
    } else if (topUpParam !== null) {
      setIsTopUpOpen(true);
    }
  }, [searchParams]);

  const handleTopUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await apiRequest<{pay?: PaymentRedirect}>('/wallet/top-up', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) })
      });

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

  const wallet = walletData?.wallet;
  const pointsWallet = walletData?.points_wallet;
  const promoBalance = walletData?.promo_wallet?.balance ?? 0;
  const promotion = walletData?.first_topup_promotion;
  const promoDoctors = promotion?.doctors.map((doctor) => doctor.name).join(', ');
  const transactions = [...(walletData?.transactions ?? []).map((tx) => ({ ...tx, pocket: 'Bază' as Pocket })), ...(walletData?.points_transactions ?? []).map((tx) => ({ ...tx, pocket: 'Bonusuri' as Pocket })), ...(walletData?.promo_transactions ?? []).map((tx) => ({ ...tx, pocket: 'Bonus promoțional' as Pocket }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const visibleTransactions = transactions.filter((tx) => pocketFilter === 'all' || (pocketFilter === 'base' ? tx.pocket === 'Bază' : tx.pocket !== 'Bază'));
  const groups = groupByDay(visibleTransactions);
  const bonusTotal = (pointsWallet?.balance ?? 0) + promoBalance;
  const numericAmount = Number(amount) || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portofel"
        description="Soldul tău, bonusurile și toate plățile pentru consultații."
        actions={<Button disabled={!walletData} onClick={() => setIsTopUpOpen(true)}><Plus className="h-4 w-4" />Alimentează</Button>}
      />

      {error && !isTopUpOpen && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}<Button variant="outline" size="sm" onClick={loadWallet}>Reîncearcă</Button></div>}

      {promotion?.eligible_for_grant && (
        <section className="flex flex-col gap-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 sm:flex-row sm:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><Gift className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-blue-950">+{money(promotion.bonus_amount)} MDL bonus la prima alimentare</h2>
            <p className="mt-0.5 text-sm text-blue-900">Depune minimum {money(promotion.minimum_deposit)} MDL. <button type="button" className="font-semibold underline" onClick={() => setShowPromoDetails((value) => !value)}>{showPromoDetails ? 'Ascunde detaliile' : 'Detalii'}</button></p>
            {showPromoDetails && <p className="mt-2 text-sm text-blue-900">Bonusul se acordă o singură dată și se folosește automat pentru maximum 50% din fiecare consultație cu {promoDoctors || 'medicul eligibil'}. Examinările și deplasarea operatorului se achită separat.</p>}
          </div>
          <Button onClick={() => { setAmount(String(promotion.minimum_deposit)); setIsTopUpOpen(true); }}>Alimentează {money(promotion.minimum_deposit)} MDL</Button>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-[1.3fr_1fr] xl:grid-cols-[2fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/40 blur-3xl" />
          <p className="flex items-center gap-2 text-sm font-medium text-white/70"><Wallet className="h-4 w-4" />Sold disponibil</p>
          {walletData ? <p className="tabular mt-3 text-4xl font-bold tracking-tight">{money(wallet?.balance)} <span className="text-lg font-medium text-white/60">{wallet?.currency ?? 'MDL'}</span></p> : <Skeleton className="mt-3 h-10 w-40 bg-white/10" />}
          <p className="mt-2 text-sm text-white/60">Folosit pentru consultații, examinări și servicii pe loc.</p>
          <Button className="mt-5 bg-white text-slate-900 hover:bg-white/90" disabled={!walletData} onClick={() => setIsTopUpOpen(true)}><CreditCard className="h-4 w-4" />Alimentează cu cardul</Button>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><Gift className="h-4 w-4" />Bonusuri</p>
          {walletData ? <p className="tabular mt-3 text-3xl font-bold tracking-tight text-amber-950">{money(bonusTotal)} <span className="text-base font-medium text-amber-700">MDL</span></p> : <Skeleton className="mt-3 h-9 w-28" />}
          <dl className="mt-3 space-y-1 text-sm text-amber-900">
            {promoBalance > 0 && <><div className="flex justify-between"><dt>Bonusuri obișnuite</dt><dd className="tabular">{money(pointsWallet?.balance)} MDL</dd></div><div className="flex justify-between"><dt>Bonus promoțional</dt><dd className="tabular">{money(promoBalance)} MDL</dd></div></>}
          </dl>
          <p className="mt-3 text-xs leading-5 text-amber-800">Acoperă până la {walletData?.max_bonus_payment_percent ?? 30}% din consultațiile eligibile. Primești {walletData?.topup_bonus_percent ?? 0}% bonus la fiecare alimentare.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <SectionHeader title="Istoric" description={`${transactions.length} ${transactions.length === 1 ? 'operațiune' : 'operațiuni'}`} />
          <Tabs value={pocketFilter} onValueChange={(value) => setPocketFilter(value as 'all' | 'base' | 'bonus')}>
            <TabsList>
              <TabsTrigger value="all">Toate</TabsTrigger>
              <TabsTrigger value="base">Sold</TabsTrigger>
              <TabsTrigger value="bonus">Bonusuri</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {!walletData && !error ? <div className="p-5"><ListSkeleton rows={3} /></div> : groups.length === 0 ? (
          <EmptyState icon={Wallet} title="Nicio operațiune încă" description="Alimentările și plățile pentru consultații vor apărea aici." className="m-5" />
        ) : (
          <div className="divide-y divide-slate-100">
            {groups.map(([day, items]) => (
              <div key={day}>
                <p className="bg-slate-50/80 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</p>
                <ul className="divide-y divide-slate-100">
                  {items.map((tx) => {
                    const positive = num(tx.amount) > 0;
                    return (
                      <li key={`${tx.pocket}-${tx.id}`} className="flex items-center gap-3 px-5 py-3.5">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{displayTransactionType(tx.type)}</span>
                          <span className="block text-xs text-slate-500">{timeOnly(tx.date)} · {tx.pocket}</span>
                        </span>
                        <span className={`tabular shrink-0 text-sm font-semibold ${positive ? 'text-emerald-600' : 'text-slate-900'}`}>{positive ? '+' : ''}{money(tx.amount)} MDL</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleTopUp} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Alimentează portofelul</DialogTitle>
              <DialogDescription>Plata se face cu cardul, pe pagina securizată a procesatorului.</DialogDescription>
            </DialogHeader>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <div className="space-y-3">
              <label htmlFor="topup-amount" className="sr-only">Suma</label>
              <div className="relative">
                <Input id="topup-amount" type="number" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} className="tabular h-16 pr-16 text-3xl font-bold" min={10} autoFocus />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-slate-400">MDL</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[250, 500, 1000].map((value) => (
                  <Button key={value} type="button" variant={numericAmount === value ? 'default' : 'outline'} onClick={() => setAmount(value.toString())}>{value}</Button>
                ))}
              </div>
            </div>
            <dl className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">În portofelul de bază</dt><dd className="tabular font-semibold text-slate-900">+{money(numericAmount)} MDL</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Bonus estimat ({walletData?.topup_bonus_percent ?? 0}%)</dt><dd className="tabular font-semibold text-amber-700">+{money(numericAmount * (walletData?.topup_bonus_percent ?? 0) / 100)} MDL</dd></div>
              {promotion?.eligible_for_grant && <div className="flex justify-between"><dt className="text-slate-500">Bonus prima alimentare</dt><dd className={`tabular font-semibold ${numericAmount >= promotion.minimum_deposit ? 'text-blue-700' : 'text-slate-400'}`}>{numericAmount >= promotion.minimum_deposit ? `+${money(promotion.bonus_amount)} MDL` : `de la ${money(promotion.minimum_deposit)} MDL`}</dd></div>}
              <p className="pt-1 text-xs text-slate-500">Procentul bonusului se fixează la confirmarea plății.</p>
            </dl>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || numericAmount < 10} size="lg" className="w-full">
                <ShieldCheck className="h-5 w-5" />
                {isSubmitting ? 'Se inițiază…' : `Plătește ${money(numericAmount)} MDL`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Pocket = 'Bază' | 'Bonusuri' | 'Bonus promoțional';

function groupByDay<T extends { date: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const label = relativeDay(item.date);
    const day = ['Azi', 'Ieri', 'Mâine'].includes(label) ? label : new Date(item.date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
    groups.set(day, [...(groups.get(day) ?? []), item]);
  });
  return [...groups.entries()];
}

function displayTransactionType(type: string) {
  return type.replace(/\s*\([^)]+\)/g, '').trim();
}
