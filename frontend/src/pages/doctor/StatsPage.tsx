import { DoctorPerformanceCard, type DoctorPerformance } from '../../components/DoctorPerformanceCard';
import { PageHeader } from '../../components/app/PageHeader';
import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, CheckCircle2, Clock3, Star, TrendingUp, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';
import { dateTime, money } from '../../lib/format';

interface DoctorStats {
  summary: {
    performance?: DoctorPerformance | null;
    current_month_revenue: number;
    previous_month_revenue: number;
    revenue_change_percent: number | null;
    total_consultations: number;
    rating: number;
    reviews_count: number;
    profile_views: number;
    available_balance: number;
  };
  revenue: Array<{ name: string; total: number }>;
  consultations: Array<{ name: string; count: number }>;
  withdrawals: Array<{
    id: number;
    date: string;
    amount: number;
    approved_amount?: number | null;
    status: string;
    admin_note?: string | null;
    payer?: 'platform' | 'institution';
    institution?: string | null;
  }>;
  institution: {
    id: number;
    name: string;
    doctor_share_percent: number;
    balance: number;
    pending: number;
    earned_total: number;
  } | null;
}

const statusLabel: Record<string, string> = {
  pending: 'În procesare',
  approved: 'Transferat',
  rejected: 'Respins'
};

export function StatsPage() {
  const [data, setData] = useState<DoctorStats | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawSource, setWithdrawSource] = useState<'platform' | 'institution'>('platform');
  const [error, setError] = useState('');

  const loadStats = () => {
    apiRequest<DoctorStats>('/doctor/stats').then(setData).catch(() => setData(null));
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleWithdrawRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      await apiRequest('/doctor/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(withdrawAmount),
          source: withdrawSource
        })
      });
      toast.success(withdrawSource === 'institution' ? `Cererea a fost trimisă către ${institution?.name}.` : 'Cererea a fost trimisă administratorului.');
      setIsWithdrawModalOpen(false);
      setWithdrawAmount('');
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite cererea.');
    }
  };

  const summary = data?.summary;
  const availableBalance = summary?.available_balance ?? 0;
  const institution = data?.institution ?? null;
  const institutionAvailable = Math.max(0, (institution?.balance ?? 0) - (institution?.pending ?? 0));
  const sourceAvailable = withdrawSource === 'institution' ? institutionAvailable : availableBalance;
  const openWithdraw = (source: 'platform' | 'institution') => {
    setWithdrawSource(source);
    setWithdrawAmount('');
    setError('');
    setIsWithdrawModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistici și venituri"
        description="Veniturile, consultațiile și extragerile tale, lună de lună."
        actions={<Button onClick={() => openWithdraw(institution ? 'institution' : 'platform')}><Wallet className="h-4 w-4" />{institution ? `Cere plata de la ${institution.name}` : 'Solicită extragere'}</Button>}
      />

      {institution && (
        <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-white p-5 sm:flex-row sm:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white"><Building2 className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500">Lucrezi prin instituția</p>
            <h2 className="text-lg font-bold text-slate-950">{institution.name}</h2>
            <p className="mt-1 text-sm text-slate-600">Primești <strong>{institution.doctor_share_percent}%</strong> din suma rămasă după comisionul platformei. Plățile le cere și le primește de la instituție.</p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-3 text-sm sm:w-72">
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm"><dt className="text-xs text-slate-500">De primit</dt><dd className="tabular text-lg font-bold text-slate-950">{money(institution.balance)}</dd></div>
            <div className="rounded-xl bg-white px-3 py-2 shadow-sm"><dt className="text-xs text-slate-500">Câștigat total</dt><dd className="tabular text-lg font-bold text-slate-950">{money(institution.earned_total)}</dd></div>
            {institution.pending > 0 && <p className="col-span-2 text-xs text-amber-700">{money(institution.pending)} MDL cerut, în așteptarea instituției.</p>}
          </dl>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Venit luna curentă"
          value={`${(summary?.current_month_revenue ?? 0).toFixed(2)} MDL`}
          detail={summary?.revenue_change_percent === null ? 'Fără lună precedentă' : `${summary?.revenue_change_percent ?? 0}% față de luna trecută`}
          icon={TrendingUp}
          tone="bg-emerald-50 text-emerald-700"
        />
        <SummaryCard
          label="Consultații totale"
          value={String(summary?.total_consultations ?? 0)}
          detail="Finalizate în platformă"
          icon={Users}
          tone="bg-blue-50 text-blue-700"
        />
        <SummaryCard
          label="Rating mediu"
          value={(summary?.rating ?? 0).toFixed(1)}
          detail={`${summary?.reviews_count ?? 0} recenzii`}
          icon={Star}
          tone="bg-amber-50 text-amber-700"
        />
        <SummaryCard
          label="Balanță disponibilă"
          value={`${availableBalance.toFixed(2)} MDL`}
          detail={institution ? 'La platformă, din consultațiile de dinainte de instituție' : 'După extrageri procesate'}
          icon={Wallet}
          tone="bg-slate-100 text-slate-700"
        />
      </div>

      <DoctorPerformanceCard performance={summary?.performance} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Evoluție venituri</CardTitle>
            <CardDescription>Ultimele 6 luni, din consultații finalizate.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.revenue ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Consultații săptămâna curentă</CardTitle>
            <CardDescription>Număr de consultații finalizate pe zi.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.consultations ?? []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/70 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>Istoric extrageri</CardTitle>
          <CardDescription>Cereri salvate în backend și procesate din admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Data</TableHead>
                <TableHead>Suma cerută</TableHead>
                <TableHead>De la</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.withdrawals ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-slate-500">Nu există extrageri anterioare.</TableCell>
                </TableRow>
              )}
              {(data?.withdrawals ?? []).map((withdrawal) => (
                <TableRow key={withdrawal.id}>
                  <TableCell className="text-slate-500">{dateTime(withdrawal.date)}</TableCell>
                  <TableCell className="font-semibold text-slate-950">{money(withdrawal.amount)} MDL</TableCell>
                  <TableCell className="text-slate-600">{withdrawal.payer === 'institution' ? withdrawal.institution ?? 'Instituție' : 'Platformă'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center text-sm font-medium ${withdrawal.status === 'approved' ? 'text-green-600' : withdrawal.status === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                      {withdrawal.status === 'approved' ? <CheckCircle2 className="mr-1 h-4 w-4" /> : <Clock3 className="mr-1 h-4 w-4" />}
                      {statusLabel[withdrawal.status] || withdrawal.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isWithdrawModalOpen} onOpenChange={setIsWithdrawModalOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl border-0 bg-white shadow-xl">
          <form onSubmit={handleWithdrawRequest}>
            <DialogHeader>
              <DialogTitle>{withdrawSource === 'institution' ? 'Cere plata de la instituție' : 'Solicită extragere'}</DialogTitle>
              <DialogDescription>{withdrawSource === 'institution' ? `${institution?.name} primește cererea și îți transferă banii.` : 'Administratorul platformei procesează cererea (zilele 1–10 ale lunii, minimum 500 MDL).'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-6">
              {institution && availableBalance > 0 && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                  <button type="button" onClick={() => setWithdrawSource('institution')} className={`rounded-lg px-3 py-2 ${withdrawSource === 'institution' ? 'bg-white shadow-sm' : 'text-slate-600'}`}>De la instituție</button>
                  <button type="button" onClick={() => setWithdrawSource('platform')} className={`rounded-lg px-3 py-2 ${withdrawSource === 'platform' ? 'bg-white shadow-sm' : 'text-slate-600'}`}>De la platformă</button>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-medium text-slate-500">Disponibil</span>
                <span className="text-xl font-bold text-slate-950">{money(sourceAvailable)} MDL</span>
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="space-y-2">
                <Label>Suma de extras (MDL)</Label>
                <Input
                  type="number"
                  required
                  min={withdrawSource === 'institution' ? 1 : 500}
                  max={withdrawSource === 'institution' ? Math.max(1, sourceAvailable) : Math.max(500, sourceAvailable)}
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder={withdrawSource === 'institution' ? 'Suma în MDL' : 'Minim 500 MDL'}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsWithdrawModalOpen(false)} className="rounded-xl bg-white">
                Anulare
              </Button>
              <Button type="submit" className="rounded-xl">
                Trimite cererea
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <Card className="border-slate-200/70 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs font-medium text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
