import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { DoctorPerformanceCard, type DoctorPerformance } from '../../components/DoctorPerformanceCard';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { apiRequest } from '../../lib/api';
import { mdl } from '../../lib/doctor';
import { usePageTitle } from '../../lib/use-page-title';

interface DoctorStats {
  summary: {
    performance?: DoctorPerformance | null;
    current_month_revenue: number;
    rating: number;
    reviews_count: number;
    available_balance: number;
  };
  revenue: Array<{ name: string; total: number }>;
  by_service?: Array<{ name: string; count: number; total: number }>;
  current_month_consultations?: number;
  previous_month_consultations?: number;
  withdrawals: Array<{ id: number; date: string; amount: number; status: string; payer?: 'platform' | 'institution'; institution?: string | null; payout_method?: string | null }>;
  institution: { id: number; name: string; doctor_share_percent: number; balance: number; pending: number; earned_total: number } | null;
}

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MIN_WITHDRAWAL = 500;
const plain = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const STATUS: Record<string, [string, string]> = {
  pending: ['În procesare', 'bg-amber-100 text-amber-800'],
  approved: ['Plătită', 'bg-slate-100 text-slate-700'],
  rejected: ['Respinsă', 'bg-red-50 text-red-700']
};

/** Fereastra de extragere: zilele 1–10 ale lunii. */
function withdrawalWindow(today = new Date()) {
  const day = today.getDate();
  const month = MONTHS[today.getMonth()];
  const next = MONTHS[(today.getMonth() + 1) % 12];
  if (day === 10) return { open: true, text: `Azi, ${day} ${month}, e ultima zi pentru cereri luna aceasta. Următoarea fereastră: 1–10 ${next}.` };
  if (day < 10) return { open: true, text: `Poți trimite cereri până pe 10 ${month}. Următoarea fereastră: 1–10 ${next}.` };
  return { open: false, text: `Extragerile se cer în zilele 1–10 ale lunii. Următoarea fereastră: 1–10 ${next}.` };
}

/**
 * S1: balanța disponibilă stă lângă butonul de extragere; venitul lunii e
 * împărțit pe servicii, ca medicul să vadă ce aduce bani.
 */
export function StatsPage() {
  usePageTitle('Statistici');
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<DoctorStats | null>(null);
  const [open, setOpen] = useState(false);

  const load = () => { apiRequest<DoctorStats>('/doctor/stats').then(setData).catch(() => setData(null)); };
  useEffect(load, []);
  useEffect(() => {
    if (searchParams.get('withdraw') === '1') {
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('withdraw');
      setSearchParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary;
  const today = new Date();
  const bars = data?.revenue ?? [];
  const max = Math.max(1, ...bars.map((bar) => bar.total));
  const services = data?.by_service ?? [];
  const topService = Math.max(1, ...services.map((service) => service.total));
  const previousMonth = MONTHS[(today.getMonth() + 11) % 12];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-[-.02em] text-slate-950">Statistici și venituri</h1>
        <span className="text-sm text-slate-500">Veniturile, consultațiile și extragerile tale, lună de lună.</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-2.5 rounded-2xl bg-slate-900 p-5 text-white">
          <span className="text-[13px] text-slate-300">Balanță disponibilă</span>
          {data ? <span className="text-[28px] font-bold tracking-[-.02em]">{mdl(summary?.available_balance)}</span> : <Skeleton className="h-9 w-36 bg-slate-700" />}
          <button type="button" onClick={() => setOpen(true)} className="h-[38px] self-start rounded-[10px] bg-white px-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">Solicită extragere</button>
        </div>
        <Card label={`Venit ${MONTHS[today.getMonth()]}`} value={mdl(summary?.current_month_revenue)} sub={`până azi, ${today.getDate()} ${SHORT[today.getMonth()]}`} loading={!data} />
        <Card label="Consultații finalizate" value={String(data?.current_month_consultations ?? 0)} sub={`în ${previousMonth}: ${data?.previous_month_consultations ?? 0}`} loading={!data} />
        <Card label="Rating mediu" value={summary?.reviews_count ? summary.rating.toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'} sub={`${summary?.reviews_count ?? 0} recenzii`} loading={!data} />
      </div>

      {data?.institution && (
        <div className="flex flex-col gap-1 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-slate-700">
          <span className="font-semibold text-slate-950">Lucrezi prin {data.institution.name}</span>
          <span>Primești {data.institution.doctor_share_percent}% din suma rămasă după comisionul platformei. De primit de la instituție: <b>{mdl(data.institution.balance)}</b>{data.institution.pending > 0 ? ` · ${mdl(data.institution.pending)} cerut, în așteptare` : ''}.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-[3px]"><span className="text-base font-semibold text-slate-950">Evoluție venituri</span><span className="text-[13px] text-slate-500">Ultimele 6 luni, din consultații finalizate.</span></div>
          <div className="grid h-[200px] grid-cols-6 items-end gap-4 border-b border-slate-200 pt-2">
            {bars.map((bar, index) => (
              <div key={`${bar.name}-${index}`} className="flex h-full flex-col items-center justify-end gap-1.5">
                <span className="whitespace-nowrap text-[11px] text-slate-500">{plain(bar.total)}</span>
                <div className={cn('w-full max-w-[44px] rounded-t-md', index === bars.length - 1 ? 'bg-blue-300' : 'bg-blue-600')} style={{ height: `${Math.round((bar.total / max) * 150)}px` }} />
              </div>
            ))}
          </div>
          <div className="-mt-2 grid grid-cols-6 gap-4">{bars.map((bar, index) => <span key={`${bar.name}-l${index}`} className="text-center text-xs text-slate-500">{capital(bar.name.replace('.', '').slice(0, 3))}</span>)}</div>
        </section>
        <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-[3px]"><span className="text-base font-semibold text-slate-950">Pe servicii · {MONTHS[today.getMonth()]}</span><span className="text-[13px] text-slate-500">Câte ai făcut și cât au adus.</span></div>
          {services.length === 0 ? <p className="text-sm text-slate-500">Nicio consultație finalizată luna aceasta.</p> : services.map((service) => (
            <div key={service.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2.5 text-[13px]"><span className="font-medium text-slate-950">{service.name} <span className="font-normal text-slate-500">· {service.count} {service.count === 1 ? 'consultație' : 'consultații'}</span></span><span className="whitespace-nowrap font-semibold text-slate-950">{mdl(service.total)}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round((service.total / topService) * 100)}%` }} /></div>
            </div>
          ))}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="px-5 py-[18px] text-base font-semibold text-slate-950">Istoric extrageri</div>
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[1fr_1fr_1.4fr_1fr] border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-semibold text-slate-500"><span>Data</span><span>Suma</span><span>Cont</span><span>Status</span></div>
            {(data?.withdrawals ?? []).length === 0 ? <p className="border-t border-slate-100 px-5 py-6 text-center text-sm text-slate-500">Nu ai cerut încă nicio extragere.</p> : data?.withdrawals.map((item) => {
              const [label, tone] = STATUS[item.status] ?? [item.status, 'bg-slate-100 text-slate-700'];
              const date = new Date(item.date);
              return (
                <div key={item.id} className="grid grid-cols-[1fr_1fr_1.4fr_1fr] items-center border-t border-slate-100 px-5 py-3 text-sm">
                  <span className="text-slate-950">{date.getDate()} {SHORT[date.getMonth()]} {date.getFullYear()}</span>
                  <span className="font-semibold text-slate-950">{mdl(item.amount)}</span>
                  <span className="text-slate-500">{item.payer === 'institution' ? item.institution ?? 'Instituție' : item.payout_method || 'Platformă'}</span>
                  <span className={cn('justify-self-start rounded-full px-[9px] py-[3px] text-xs font-semibold', tone)}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <DoctorPerformanceCard performance={summary?.performance} />

      <WithdrawDialog open={open} onOpenChange={setOpen} data={data} onSent={() => { setOpen(false); load(); }} />
    </div>
  );
}

function Card({ label, value, sub, loading }: { label: string; value: string; sub: string; loading: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-5">
      <span className="text-[13px] text-slate-500">{label}</span>
      {loading ? <Skeleton className="h-8 w-24" /> : <span className="text-2xl font-bold text-slate-950">{value}</span>}
      <span className="text-xs text-slate-500">{sub}</span>
    </div>
  );
}

function WithdrawDialog({ open, onOpenChange, data, onSent }: { open: boolean; onOpenChange: (open: boolean) => void; data: DoctorStats | null; onSent: () => void }) {
  const institution = data?.institution ?? null;
  const [source, setSource] = useState<'platform' | 'institution'>('platform');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (open) { setAmount(''); setError(''); setSource(institution && !(data?.summary.available_balance) ? 'institution' : 'platform'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromInstitution = source === 'institution';
  const balance = fromInstitution ? Math.max(0, (institution?.balance ?? 0) - (institution?.pending ?? 0)) : data?.summary.available_balance ?? 0;
  const windowInfo = withdrawalWindow();
  const minimum = fromInstitution ? 1 : MIN_WITHDRAWAL;
  const value = Number(amount) || 0;
  const valid = value >= minimum && value <= balance && (fromInstitution || windowInfo.open);
  const hint = !amount ? (fromInstitution ? 'Instituția decide când plătește.' : `Minimum ${MIN_WITHDRAWAL} MDL.`)
    : value < minimum ? `Suma minimă e ${mdl(minimum)}.` : value > balance ? `Ai disponibil doar ${mdl(balance)}.` : fromInstitution ? `${institution?.name} primește cererea.` : 'Primești banii în 3–5 zile lucrătoare.';

  const send = async () => {
    if (!valid) return;
    setSending(true);
    setError('');
    try {
      await apiRequest('/doctor/withdrawals', { method: 'POST', body: JSON.stringify({ amount: value, source }) });
      toast.success(fromInstitution ? `Cererea a fost trimisă către ${institution?.name}.` : 'Cererea de extragere a fost trimisă.');
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite cererea.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[calc(100%-1rem)] max-w-[440px] gap-4 rounded-2xl p-6 sm:max-w-[440px]">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg font-semibold">Solicită extragere</DialogTitle>
          <button type="button" aria-label="Închide" onClick={() => onOpenChange(false)} className="grid h-8 w-8 place-items-center text-slate-500"><X className="h-[18px] w-[18px]" /></button>
        </div>
        <DialogDescription className="sr-only">Cere transferul banilor din balanța ta.</DialogDescription>
        {institution && (data?.summary.available_balance ?? 0) > 0 && (
          <div className="grid grid-cols-2 gap-0.5 rounded-[10px] bg-slate-100 p-[3px] text-[13px] font-medium">
            {(['institution', 'platform'] as const).map((value) => (
              <button key={value} type="button" onClick={() => setSource(value)} className={cn('h-8 rounded-lg', source === value ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>{value === 'institution' ? 'De la instituție' : 'De la platformă'}</button>
            ))}
          </div>
        )}
        {!fromInstitution && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] leading-normal text-amber-900">{windowInfo.text}</div>}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3.5"><span className="text-sm text-slate-600">Disponibil</span><span className="text-lg font-bold text-slate-950">{mdl(balance)}</span></div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-slate-700">Suma (MDL)</span>
          <div className="flex gap-2">
            <input value={amount} inputMode="numeric" onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} placeholder={`Minimum ${minimum}`}
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-slate-200 px-3 text-[15px] text-slate-950 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15" />
            <button type="button" onClick={() => setAmount(String(Math.floor(balance)))} className="h-11 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium hover:bg-slate-50">Toată suma</button>
          </div>
          <span className={cn('text-xs', amount && !valid ? 'text-red-600' : 'text-slate-500')}>{hint}</span>
        </label>
        <span className="text-[13px] text-slate-500">{fromInstitution ? `Plătește ${institution?.name}.` : 'În contul bancar comunicat administratorului.'}</span>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={() => onOpenChange(false)} className="h-[42px] rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50">Anulează</button>
          <button type="button" onClick={() => void send()} disabled={!valid || sending} className={cn('h-[42px] rounded-[10px] px-4 text-sm font-semibold text-white', valid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300')}>{sending ? 'Se trimite…' : 'Trimite cererea'}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
