import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MessageSquare, Video } from 'lucide-react';
import { type DoctorPerformance } from '../../components/DoctorPerformanceCard';
import { NotificationBell } from '../../components/NotificationBell';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { agoLabel, ageLabel, hm, initialsOf, mdl, needsDoctor, stageOf, whenLabel, type Proposal, type RequestService, type Stage } from '../../lib/doctor';
import { usePageTitle } from '../../lib/use-page-title';
import { useNow } from '../../lib/use-now';

interface DashboardData {
  summary: {
    performance?: DoctorPerformance | null;
    current_month_revenue: number;
    current_month_consultations: number;
    rating: number;
    reviews_count: number;
    average_response_minutes: number | null;
  };
}

export interface DoctorRequest {
  id: string;
  status: string;
  stage?: Stage;
  consultation_kind?: string | null;
  service?: RequestService;
  symptoms?: string | null;
  scheduled_at?: string | null;
  doctor_started_at?: string | null;
  created_at: string;
  amount?: number;
  proposal?: Proposal | null;
  patient?: { name: string } | null;
  patient_profile?: { name?: string | null; age?: number | null; address?: string | null; locality?: string | null } | null;
}

const MONTHS = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const nameOf = (request: DoctorRequest) => request.patient_profile?.name || request.patient?.name || 'Pacient';
const firstNameOf = (request: DoctorRequest) => nameOf(request).split(' ')[0];
const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);
const isToday = (value?: string | null) => Boolean(value) && new Date(value as string).toDateString() === new Date().toDateString();
const priceOf = (request: DoctorRequest) => request.service?.price ?? request.amount ?? 0;
const decimal = (value: number) => value.toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function responseTime(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined || minutes < 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

/** Rândul din agendă: ce serviciu și, la domiciliu, unde. */
function agendaDetail(request: DoctorRequest) {
  const service = request.service;
  if (!service) return 'Consultație';
  if (service.type === 'home') return `La domiciliu${request.patient_profile?.address ? ` · ${request.patient_profile.address}` : ''}`;
  if (service.type === 'chat') return service.name;
  return service.duration ? `${service.name} · ${service.duration} min` : service.name;
}

const AGENDA_TAG = { video: 'Video', chat: 'Chat', home: 'Deplasare' } as const;

/**
 * A1: Acasă arată întâi ce așteaptă răspunsul medicului, fiecare cerere cu
 * serviciul ales și prețul, apoi agenda zilei în ordinea orei. În dreapta,
 * luna curentă pe scurt.
 */
export function DoctorHome() {
  usePageTitle('Acasă');
  const { user } = useAuth();
  const now = useNow();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [requests, setRequests] = useState<DoctorRequest[]>([]);
  const [hasSignature, setHasSignature] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [dashboardResponse, requestsResponse] = await Promise.all([
        apiRequest<DashboardData>('/doctor/dashboard'),
        apiRequest<{ data: DoctorRequest[] }>('/requests')
      ]);
      setDashboard(dashboardResponse);
      setRequests(requestsResponse.data ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca datele.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    apiRequest<{ has_signature?: boolean }>('/doctor/profile').then((response) => setHasSignature(response.has_signature !== false)).catch(() => undefined);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = useMemo(() => requests
    .filter((request) => needsDoctor(stageOf(request)))
    .sort((a, b) => time(a.created_at) - time(b.created_at)), [requests]);
  const agenda = useMemo(() => requests
    .filter((request) => ['conf', 'live'].includes(stageOf(request)) && (request.doctor_started_at || isToday(request.scheduled_at)))
    .sort((a, b) => Number(Boolean(b.doctor_started_at)) - Number(Boolean(a.doctor_started_at)) || time(a.scheduled_at) - time(b.scheduled_at)), [requests]);
  const next = agenda.find((request) => request.doctor_started_at || time(request.scheduled_at) >= now - 30 * 60000) ?? null;

  const confirm = async (request: DoctorRequest) => {
    setBusyId(request.id);
    try {
      await apiRequest(`/requests/${request.id}/accept`, { method: 'POST' });
      toast.success(`Ora pentru ${nameOf(request)} e confirmată.`);
      window.dispatchEvent(new Event('requests-changed'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut confirma ora.');
    } finally {
      setBusyId(null);
    }
  };

  const summary = dashboard?.summary;
  const lastName = user?.name?.split(' ').slice(-1)[0] ?? '';
  const today = new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);
  const todayCount = agenda.length;
  const lead = isLoading ? 'Se încarcă ziua…'
    : pending.length || todayCount
      ? `Ai ${[pending.length ? `${pending.length} ${pending.length === 1 ? 'cerere' : 'cereri'} de confirmat` : '', todayCount ? `${todayCount} ${todayCount === 1 ? 'consultație' : 'consultații'} azi` : ''].filter(Boolean).join(' și ')}.`
      : 'Nu ai nimic de confirmat azi.';
  const callLabel = (request: DoctorRequest) => {
    const verb = request.service?.type === 'chat' ? 'Scrie' : request.service?.type === 'home' ? 'Deschide' : 'Sună';
    if (request.doctor_started_at) return `${verb} · în curs`;
    const minutes = Math.round((time(request.scheduled_at) - now) / 60000);
    return minutes > 0 ? `${verb} · peste ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`}` : `${verb} · acum`;
  };
  const link = (request: DoctorRequest) => `/doctor/consultations?request=${request.id}`;

  return (
    <>
      {/* Telefon · MBa */}
      <div className="-mx-4 -mt-5 bg-slate-50 lg:hidden">
        <div className="flex items-start justify-between px-4 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-blue-600">{todayLabel}</span>
            <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">{greeting()}, Dr. {lastName}</h1>
          </div>
          <NotificationBell bare />
        </div>
        <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1.5">
          {error && <ErrorNote error={error} onRetry={() => void load()} />}
          <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-[15px] font-semibold text-slate-950">Așteaptă răspunsul tău · {pending.length}</div>
            {isLoading ? <div className="p-4"><Skeleton className="h-10 w-full" /></div> : pending.length === 0 ? (
              <p className="px-4 py-[18px] text-sm text-slate-500">Ești la zi.</p>
            ) : pending.map((request, index) => (
              <Link key={request.id} to={link(request)} className={cn('flex items-center gap-3 px-4 py-3.5 text-slate-950', index > 0 && 'border-t border-slate-100')}>
                <Avatar name={nameOf(request)} size={38} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{nameOf(request)}</span>
                  <span className="truncate text-[13px] text-slate-700">{request.service?.name ?? 'Consultație'}</span>
                  <span className="text-xs text-slate-500">{stageOf(request) === 'ask' ? 'Cere alte ore' : whenLabel(request.scheduled_at, true)}</span>
                </span>
                <span className="whitespace-nowrap text-sm font-bold">{mdl(priceOf(request))}</span>
              </Link>
            ))}
          </section>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="px-4 py-3 text-[15px] font-semibold text-slate-950">Agenda de azi</div>
            {agenda.length === 0 ? <p className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">{isLoading ? 'Se încarcă…' : 'Nicio consultație azi.'}</p> : agenda.map((request) => {
              const isNext = next?.id === request.id;
              return (
                <Link key={request.id} to={link(request)} className={cn('flex items-center gap-3 border-t border-slate-100 px-4 py-3', isNext ? 'bg-[#F8FBFF]' : 'bg-white')}>
                  <span className={cn('w-[46px] font-mono text-sm font-semibold', isNext ? 'text-blue-600' : 'text-slate-950')}>{request.doctor_started_at ? 'Acum' : hm(request.scheduled_at ?? request.created_at)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-sm font-semibold text-slate-950">{nameOf(request)}</span><span className="truncate text-xs text-slate-500">{agendaDetail(request)}</span></span>
                </Link>
              );
            })}
            {next && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Link to={link(next)} className="flex h-[46px] w-full items-center justify-center rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white">
                  {next.service?.type === 'chat' ? 'Scrie-i' : next.service?.type === 'home' ? 'Deschide' : 'Sună'} pe {firstNameOf(next)} · {next.doctor_started_at ? 'acum' : hm(next.scheduled_at ?? '')}
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Desktop · A1a */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-blue-600">{todayLabel}</span>
            <h1 className="text-[28px] font-bold tracking-[-.02em] text-slate-950">{greeting()}, Dr. {lastName}</h1>
            <span className="text-sm text-slate-500">{lead}</span>
          </div>
          {error && <ErrorNote error={error} onRetry={() => void load()} />}

          <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
            <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-4">
              <span className="flex items-center gap-2 text-base font-semibold text-slate-950">
                Așteaptă răspunsul tău
                <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-amber-500 px-[7px] text-xs font-bold text-white">{pending.length}</span>
              </span>
              <span className="text-[13px] text-amber-800">Răspunde în 2 ore, altfel cererea expiră</span>
            </div>
            {isLoading ? <div className="p-5"><Skeleton className="h-12 w-full" /></div> : pending.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">Ești la zi. Cererile noi apar aici imediat ce sosesc.</p>
            ) : pending.map((request, index) => {
              const asks = stageOf(request) === 'ask';
              return (
                <div key={request.id} className={cn('flex items-center gap-3.5 px-5 py-4', index > 0 && 'border-t border-slate-100')}>
                  <Avatar name={nameOf(request)} size={40} />
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[15px] font-semibold text-slate-950">{nameOf(request)}{ageLabel(request.patient_profile?.age) && <span className="font-normal text-slate-500"> · {ageLabel(request.patient_profile?.age)}</span>}</span>
                    <span className="text-[13px] text-slate-700">{request.service?.name ?? 'Consultație'} · <b>{mdl(priceOf(request))}</b></span>
                    <span className="text-[13px] text-slate-500">
                      {asks ? `Cere alte ore${request.proposal?.patient_note ? `: „${request.proposal.patient_note}”` : ''}` : `Cere: ${whenLabel(request.scheduled_at, true)}`} · trimisă {agoLabel(request.created_at, now)}
                    </span>
                  </div>
                  <Link to={link(request)} className="flex h-[38px] items-center rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50">Deschide</Link>
                  {asks ? (
                    <Link to={`${link(request)}&propose=1`} className="flex h-[38px] items-center whitespace-nowrap rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700">Propune alte ore</Link>
                  ) : (
                    <button type="button" disabled={busyId === request.id} onClick={() => void confirm(request)} className="h-[38px] whitespace-nowrap rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                      {busyId === request.id ? 'Se confirmă…' : 'Confirmă ora'}
                    </button>
                  )}
                </div>
              );
            })}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-base font-semibold text-slate-950">Agenda de azi</span>
              <Link to="/doctor/consultations" className="text-[13px] font-medium text-blue-600 hover:underline">Toate consultațiile</Link>
            </div>
            {agenda.length === 0 ? <p className="border-t border-slate-100 px-5 py-5 text-sm text-slate-500">{isLoading ? 'Se încarcă…' : 'Nicio consultație programată azi.'}</p> : agenda.map((request) => {
              const isNext = next?.id === request.id;
              const Icon = request.service?.type === 'chat' ? MessageSquare : Video;
              return (
                <div key={request.id} className={cn('grid grid-cols-[64px_1fr_auto] items-center gap-3.5 border-t border-slate-100 px-5 py-3.5', isNext ? 'bg-[#F8FBFF]' : 'bg-white')}>
                  <span className={cn('font-mono text-[15px] font-semibold', isNext ? 'text-blue-600' : 'text-slate-950')}>{request.doctor_started_at ? 'Acum' : hm(request.scheduled_at ?? request.created_at)}</span>
                  <Link to={link(request)} className="flex min-w-0 flex-col gap-[3px]"><span className="text-[15px] font-semibold text-slate-950">{nameOf(request)}</span><span className="truncate text-[13px] text-slate-500">{agendaDetail(request)}</span></Link>
                  {isNext ? (
                    <Link to={link(request)} className="flex h-[38px] items-center gap-2 rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700"><Icon className="h-4 w-4" />{callLabel(request)}</Link>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{AGENDA_TAG[request.service?.type ?? 'video']}</span>
                  )}
                </div>
              );
            })}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between"><span className="text-base font-semibold text-slate-950">{MONTHS[new Date().getMonth()]}</span><Link to="/doctor/stats" className="text-[13px] font-medium text-blue-600 hover:underline">Statistici</Link></div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-slate-500">Venit până azi</span>
              {isLoading ? <Skeleton className="h-8 w-32" /> : <span className="text-[26px] font-bold tracking-[-.02em] text-slate-950">{mdl(summary?.current_month_revenue)}</span>}
              <span className="text-xs text-slate-500">{summary?.current_month_consultations ?? 0} {summary?.current_month_consultations === 1 ? 'consultație finalizată' : 'consultații finalizate'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Rating</span><span className="text-base font-semibold text-slate-950">{summary?.reviews_count ? decimal(summary.rating) : '—'}</span></div>
              <div className="flex flex-col gap-0.5"><span className="text-xs text-slate-500">Răspuns mediu</span><span className="text-base font-semibold text-slate-950">{responseTime(summary?.average_response_minutes)}</span></div>
            </div>
          </section>
          {summary?.performance && (
            <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5">
              <span className="text-[13px] text-slate-500">Indicator de performanță</span>
              <span className="text-2xl font-bold text-slate-950">{Math.round(summary.performance.score)} <span className="text-sm font-medium text-slate-500">puncte</span></span>
              <Link to="/doctor/stats" className="text-[13px] font-medium text-blue-600 hover:underline">Cum se calculează</Link>
            </section>
          )}
          {!hasSignature && (
            <section className="flex flex-col gap-1.5 rounded-2xl border border-amber-200 bg-white px-5 py-4">
              <span className="text-sm font-semibold text-slate-950">Lipsește parafa</span>
              <span className="text-[13px] text-slate-500">Fără ea nu poți publica concluzii.</span>
              <Link to="/doctor/profile#pdf" className="text-[13px] font-medium text-blue-600 hover:underline">Încarcă în Profil</Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span style={{ width: size, height: size, fontSize: size >= 48 ? 15 : size >= 40 ? 13 : 12 }} className={cn('grid shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700', className)}>
      {initialsOf(name)}
    </span>
  );
}

function ErrorNote({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" className="ml-2 font-semibold underline" onClick={onRetry}>Reîncearcă</button></p>;
}
