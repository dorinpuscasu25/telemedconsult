import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, CreditCard, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';

interface WalletData {
  wallet: {
    id: number;
    balance: number;
    currency: string;
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

  const loadWallet = () => {
    apiRequest<WalletData>('/wallet').then(setWalletData);
  };

  useEffect(() => {
    loadWallet();
    const topUpAmount = Number(searchParams.get('topup'));
    if (Number.isFinite(topUpAmount) && topUpAmount >= 10) {
      setAmount(String(Math.ceil(topUpAmount)));
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
  const transactions = walletData?.transactions ?? [];

  return (
    <div className="space-y-8 max-w-5xl mx-auto relative">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
          Portofel Electronic
        </h1>
        <p className="text-slate-500">
          Gestionează fondurile și alimentează contul în siguranță.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-2">
          <Card className="border-0 h-full bg-gradient-to-br from-primary to-purple-700 text-white shadow-xl shadow-primary/20 relative overflow-hidden">
            <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[60%] rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[50%] rounded-full bg-white/5 blur-2xl pointer-events-none" />
            <CardContent className="p-8 flex flex-col h-full justify-between relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white/80 font-medium mb-1">Balanță Curentă</p>
                  <h2 className="text-5xl font-bold tracking-tight">
                    {(wallet?.balance ?? 0).toFixed(2)}
                    <span className="text-2xl font-medium text-white/80 ml-2">{wallet?.currency ?? 'MDL'}</span>
                  </h2>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
                  <Wallet className="h-6 w-6 text-white" />
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-white/60 text-xs uppercase tracking-wider">Portofel telemedconsult.md</p>
                  <p className="font-medium text-white/90">Fonduri disponibile pentru servicii medicale</p>
                  <p className="text-sm text-white/80">Tranzacții înregistrate: <strong>{transactions.length}</strong></p>
                </div>

                <Button
                  onClick={() => setIsTopUpOpen(true)}
                  className="bg-white text-primary hover:bg-white/90 rounded-xl font-semibold px-6 shadow-lg shadow-black/10">
                  <Plus className="mr-2 h-4 w-4" /> Alimentează
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="glass-card border-0 h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <ShieldCheck className="h-5 w-5 text-green-500 mr-2" />
                Plăți securizate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900 mb-1">Card bancar</div>
              <p className="text-sm text-slate-500 mb-4">
                Alimentările sunt procesate securizat, iar istoricul rămâne salvat în cont.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Valută</span>
                  <span className="font-medium">MDL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="font-medium text-green-600">Pregătit</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle>Istoric Tranzacții</CardTitle>
            <CardDescription>Ultimele operațiuni din portofelul tău.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-200/50">
                  <TableHead>Data</TableHead>
                  <TableHead>Detalii</TableHead>
                  <TableHead className="text-right">Suma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-500 py-8">
                      Nu există tranzacții încă.
                    </TableCell>
                  </TableRow>
                )}
                {transactions.map((tx) => (
                  <TableRow key={tx.id} className="border-slate-200/50 hover:bg-slate-50/50">
                    <TableCell className="text-slate-500">{new Date(tx.date).toLocaleString()}</TableCell>
                    <TableCell className="font-medium text-slate-900 flex items-center">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center mr-3 ${tx.amount > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-600'}`}>
                        {tx.amount > 0 ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      {displayTransactionType(tx.type)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-slate-900'}`}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)} MDL
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
        <DialogContent className="sm:max-w-[400px] glass-panel border-0 rounded-2xl z-50">
          <form onSubmit={handleTopUp}>
            <DialogHeader>
              <DialogTitle className="text-2xl">Alimentare Cont</DialogTitle>
              <DialogDescription>Introduceți suma pentru a alimenta portofelul.</DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-500">MDL</span>
                <Input
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="pl-14 text-2xl font-bold h-16 rounded-xl bg-slate-50"
                  min={10}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                {[250, 500, 1000].map((value) => (
                  <Button key={value} type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setAmount(value.toString())}>
                    {value}
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0 h-12 text-lg">
                <CreditCard className="mr-2 h-5 w-5" />
                {isSubmitting ? 'Se inițiază...' : 'Continuă spre Plată'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function displayTransactionType(type: string) {
  return type.replace(/\s*\([^)]+\)/g, '').trim();
}
