import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Navigation } from 'lucide-react';
import { NotificationBell } from '../../components/NotificationBell';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { useDialogs } from '../../components/app/DialogProvider';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { hm } from '../../lib/doctor';
import { relativeDay, timeUntil } from '../../lib/format';
import { usePageTitle } from '../../lib/use-page-title';
import { useNow } from '../../lib/use-now';
import { addressOf, mapsUrl, operatorStageOf, patientNameOf, type RequestItem } from '../../lib/operator-visits';
import { Avatar } from '../doctor/DoctorHome';
import { ReferralLinkBox, loadOperatorReferrals, type OperatorReferrals } from './OperatorReferralsPage';

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const isToday = (value?: string | null) => Boolean(value) && new Date(value as string).toDateString() === new Date().toDateString();
const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);
const firstNameOf = (request: RequestItem) => patientNameOf(request).split(' ')[0];
const visitLink = (request: RequestItem) => `/operator/patients?request=${request.id}`;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

/** Ora vizitei: azi doar ora, altfel ziua și ora; fără oră, „Curând”. */
const visitTime = (request: RequestItem) => {
  if (!request.scheduled_at) return 'Curând';
  return isToday(request.scheduled_at) ? hm(request.scheduled_at) : `${relativeDay(request.scheduled_at)}, ${hm(request.scheduled_at)}`;
};

/**
 * Operatorul lucrează pe teren, de pe telefon. Acasă arată întâi cererile noi
 * care trebuie preluate la timp, apoi vizitele în lucru în ordinea orei, cu
 * navigarea spre următoarea. În dreapta: ziua și pacienții aduși prin link.
 */
export function OperatorHome() {
  usePageTitle('Acasă');
  const { user } = useAuth();
  const dialogs = useDialogs();
  const now = useNow();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [referrals, setReferrals] = useState<OperatorReferrals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiRequest<{ data: RequestItem[] }>('/requests')
      .then((response) => { setRequests(response.data ?? []); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca vizitele.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
    loadOperatorReferrals().then(setReferrals).catch(() => undefined);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = useMemo(() => requests
    .filter((request) => ['new', 'rescheduled'].includes(request.status))
    .sort((a, b) => (time(a.acceptance_expires_at) || Number.MAX_SAFE_INTEGER) - (time(b.acceptance_expires_at) || Number.MAX_SAFE_INTEGER)), [requests]);
  const active = useMemo(() => requests
    .filter((request) => operatorStageOf(request) === 'active')
    .sort((a, b) => (time(a.scheduled_at) || time(a.accepted_at) || time(a.created_at)) - (time(b.scheduled_at) || time(b.accepted_at) || time(b.created_at))), [requests]);
  const next = active[0] ?? null;
  const acceptedToday = requests.filter((request) => isToday(request.accepted_at)).length;
  // „Finalizate” = examinări încheiate de operator, nu consultații închise de medic.
  const completedToday = requests.filter((request) => isToday(request.objective_data_completed_at)).length;
  const newCount = pending.filter((request) => request.status === 'new').length;

  const accept = async (request: RequestItem) => {
    const address = addressOf(request);
    const confirmed = await dialogs.confirm({
      title: 'Preiei această vizită?',
      description: <p>Pacientul <strong>{patientNameOf(request)}</strong> va fi anunțat că vii.{address && <> Adresa: {address}.</>}</p>,
      confirmLabel: 'Preia cazul'
    });
    if (!confirmed) return;
    setBusyId(request.id);
    try {
      await apiRequest(`/requests/${request.id}/accept`, { method: 'POST' });
      toast.success('Vizită preluată. Pacientul a fost anunțat.');
      window.dispatchEvent(new Event('requests-changed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setBusyId(null);
      load();
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? '';
  const today = new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);
  const lead = isLoading ? 'Se încarcă ziua…'
    : newCount || active.length
      ? `Ai ${[newCount ? `${newCount} ${newCount === 1 ? 'cerere nouă' : 'cereri noi'}` : '', active.length ? `${active.length} ${active.length === 1 ? 'vizită în lucru' : 'vizite în lucru'}` : ''].filter(Boolean).join(' și ')}.`
      : 'Nu ai vizite în lucru. Cererile noi din zona ta apar aici.';
  const expiry = (request: RequestItem) => {
    if (request.status === 'rescheduled') return { text: 'Așteaptă pacientul', tone: 'text-slate-500' };
    const left = timeUntil(request.acceptance_expires_at, now);
    if (!left) return null;
    return left === 'expirat' ? { text: 'Termen depășit', tone: 'text-red-600' } : { text: `Preia în ${left}`, tone: 'text-amber-700' };
  };

  return (
    <>
      {/* Telefon */}
      <div className="-mx-4 -mt-5 bg-slate-50 lg:hidden">
        <div className="flex items-start justify-between px-4 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-blue-600">{todayLabel}</span>
            <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">{greeting()}, {firstName}</h1>
          </div>
          <NotificationBell bare />
        </div>
        <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1.5">
          {error && <ErrorNote error={error} onRetry={load} />}
          <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-[15px] font-semibold text-slate-950">Cereri noi · {pending.length}</div>
            {isLoading ? <div className="p-4"><Skeleton className="h-10 w-full" /></div> : pending.length === 0 ? (
              <p className="px-4 py-[18px] text-sm text-slate-500">Nicio cerere nouă în zona ta.</p>
            ) : pending.map((request, index) => {
              const left = expiry(request);
              return (
                <Link key={request.id} to={visitLink(request)} className={cn('flex items-center gap-3 px-4 py-3.5 text-slate-950', index > 0 && 'border-t border-slate-100')}>
                  <Avatar name={patientNameOf(request)} size={38} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{patientNameOf(request)}</span>
                    <span className="truncate text-[13px] text-slate-700">{addressOf(request) || 'Adresă necompletată'}</span>
                    {left && <span className={cn('text-xs font-medium', left.tone)}>{left.text}</span>}
                  </span>
                  <span className="whitespace-nowrap font-mono text-sm font-semibold">{visitTime(request)}</span>
                </Link>
              );
            })}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="px-4 py-3 text-[15px] font-semibold text-slate-950">Vizite în lucru</div>
            {active.length === 0 ? <p className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">{isLoading ? 'Se încarcă…' : 'Nicio vizită preluată.'}</p> : active.map((request) => (
              <Link key={request.id} to={visitLink(request)} className={cn('flex items-center gap-3 border-t border-slate-100 px-4 py-3', next?.id === request.id ? 'bg-[#F8FBFF]' : 'bg-white')}>
                <span className={cn('flex w-[62px] shrink-0 flex-col whitespace-nowrap font-mono text-sm font-semibold', next?.id === request.id ? 'text-blue-600' : 'text-slate-950')}>
                  {request.scheduled_at && !isToday(request.scheduled_at) && <span className="text-[11px] font-medium text-slate-500">{relativeDay(request.scheduled_at)}</span>}
                  {request.scheduled_at ? hm(request.scheduled_at) : 'Curând'}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-sm font-semibold text-slate-950">{patientNameOf(request)}</span><span className="truncate text-xs text-slate-500">{addressOf(request) || 'Adresă necompletată'}</span></span>
              </Link>
            ))}
            {next && addressOf(next) && (
              <div className="border-t border-slate-100 px-4 py-3">
                <a href={mapsUrl(addressOf(next))} target="_blank" rel="noreferrer" className="flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white">
                  <Navigation className="h-4 w-4" />Navigare la {firstNameOf(next)}
                </a>
              </div>
            )}
          </section>
          <ReferralCard referrals={referrals} />
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-blue-600">{todayLabel}</span>
            <h1 className="text-[28px] font-bold tracking-[-.02em] text-slate-950">{greeting()}, {firstName}</h1>
            <span className="text-sm text-slate-500">{lead}</span>
          </div>
          {error && <ErrorNote error={error} onRetry={load} />}

          <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
            <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-4">
              <span className="flex items-center gap-2 text-base font-semibold text-slate-950">
                Cereri noi
                <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-amber-500 px-[7px] text-xs font-bold text-white">{pending.length}</span>
              </span>
              <span className="text-[13px] text-amber-800">Preia la timp, altfel cererea trece la alt operator</span>
            </div>
            {isLoading ? <div className="p-5"><Skeleton className="h-12 w-full" /></div> : pending.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">Nicio cerere nouă. Te anunțăm imediat ce apare una în zona ta.</p>
            ) : pending.map((request, index) => {
              const left = expiry(request);
              const investigations = request.pricing_snapshot?.cost_breakdown?.investigations ?? [];
              return (
                <div key={request.id} className={cn('flex items-center gap-3.5 px-5 py-4', index > 0 && 'border-t border-slate-100')}>
                  <Avatar name={patientNameOf(request)} size={40} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[15px] font-semibold text-slate-950">{patientNameOf(request)}</span>
                    <span className="truncate text-[13px] text-slate-700">{addressOf(request) || 'Adresă necompletată'}</span>
                    <span className="text-[13px] text-slate-500">
                      {request.scheduled_at ? `${relativeDay(request.scheduled_at)}, ${hm(request.scheduled_at)}` : 'Cât mai curând'}
                      {investigations.length > 0 && ` · ${investigations.length} ${investigations.length === 1 ? 'investigație' : 'investigații'}`}
                      {left && <span className={cn('font-medium', left.tone)}> · {left.text}</span>}
                    </span>
                  </div>
                  <Link to={visitLink(request)} className="flex h-[38px] items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50">Deschide</Link>
                  {request.status === 'new' && (
                    <button type="button" disabled={busyId === request.id} onClick={() => void accept(request)} className="h-[38px] whitespace-nowrap rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                      {busyId === request.id ? 'Se preia…' : 'Preia cazul'}
                    </button>
                  )}
                </div>
              );
            })}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-base font-semibold text-slate-950">Vizite în lucru</span>
              <Link to="/operator/patients" className="text-[13px] font-medium text-blue-600 hover:underline">Toate vizitele</Link>
            </div>
            {active.length === 0 ? <p className="border-t border-slate-100 px-5 py-5 text-sm text-slate-500">{isLoading ? 'Se încarcă…' : 'Nicio vizită preluată. Preia o cerere nouă ca să începi.'}</p> : active.map((request) => {
              const isNext = next?.id === request.id;
              const address = addressOf(request);
              return (
                <div key={request.id} className={cn('grid grid-cols-[124px_1fr_auto] items-center gap-3.5 border-t border-slate-100 px-5 py-3.5', isNext ? 'bg-[#F8FBFF]' : 'bg-white')}>
                  <span className={cn('whitespace-nowrap font-mono text-sm font-semibold', isNext ? 'text-blue-600' : 'text-slate-950')}>{visitTime(request)}</span>
                  <Link to={visitLink(request)} className="flex min-w-0 flex-col gap-[3px]"><span className="text-[15px] font-semibold text-slate-950">{patientNameOf(request)}</span><span className="truncate text-[13px] text-slate-500">{address || 'Adresă necompletată'}</span></Link>
                  {isNext && address ? (
                    <a href={mapsUrl(address)} target="_blank" rel="noreferrer" className="flex h-[38px] items-center gap-2 rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700"><Navigation className="h-4 w-4" />Navigare</a>
                  ) : (
                    <Link to={visitLink(request)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Deschide</Link>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <span className="text-base font-semibold text-slate-950">Azi</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Preluate</span>{isLoading ? <Skeleton className="h-7 w-8" /> : <span className="text-[26px] font-bold tracking-[-.02em] text-slate-950">{acceptedToday}</span>}</div>
              <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Examinări finalizate</span>{isLoading ? <Skeleton className="h-7 w-8" /> : <span className="text-[26px] font-bold tracking-[-.02em] text-slate-950">{completedToday}</span>}</div>
            </div>
          </section>
          <ReferralCard referrals={referrals} />
        </aside>
      </div>
    </>
  );
}

/** Pacienții aduși, pe scurt, cu linkul gata de copiat. */
function ReferralCard({ referrals }: { referrals: OperatorReferrals | null }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between"><span className="text-base font-semibold text-slate-950">Pacienți aduși</span><Link to="/operator/referrals" className="text-[13px] font-medium text-blue-600 hover:underline">Toți</Link></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Total</span>{referrals ? <span className="text-[26px] font-bold tracking-[-.02em] text-slate-950">{referrals.stats.invited_count}</span> : <Skeleton className="h-7 w-8" />}</div>
        <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">{MONTHS[new Date().getMonth()]}</span>{referrals ? <span className="text-[26px] font-bold tracking-[-.02em] text-slate-950">{referrals.stats.invited_this_month}</span> : <Skeleton className="h-7 w-8" />}</div>
      </div>
      {referrals && <span className="-mt-1.5 text-xs text-slate-500">{referrals.stats.active_count} au pus bani pe cont</span>}
      {referrals && <ReferralLinkBox data={referrals} compact />}
    </section>
  );
}

function ErrorNote({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" className="ml-2 font-semibold underline" onClick={onRetry}>Reîncearcă</button></p>;
}
