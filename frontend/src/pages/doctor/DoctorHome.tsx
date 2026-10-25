import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, CalendarCheck2, CheckCircle2, ChevronRight, Clock, FileText, Hourglass, Inbox, Star, TrendingUp } from 'lucide-react';
import { type DoctorPerformance } from '../../components/DoctorPerformanceCard';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { ListSkeleton, Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { StatusBadge } from '../../components/app/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { relativeDay, timeOnly, timeUntil } from '../../lib/format';
import { CONSULTATION_KIND_LABELS } from '../../lib/status';
import { useNow } from '../../lib/use-now';

interface DashboardData {
  summary: {
    performance?: DoctorPerformance | null;
    current_month_revenue: number;
    previous_month_revenue: number;
    revenue_change_percent: number | null;
    current_month_consultations: number;
    rating: number;
    reviews_count: number;
    average_response_minutes: number | null;
  };
}

interface DoctorRequest {
  id: string;
  status: string;
  consultation_kind?: string | null;
  specialty?: string | null;
  symptoms?: string | null;
  scheduled_at?: string | null;
  acceptance_expires_at?: string | null;
  doctor_started_at?: string | null;
  ready_for_doctor?: boolean;
  created_at: string;
  patient?: { name: string } | null;
  patient_profile?: { name?: string | null } | null;
}

const formatMoney = (value: number) => new Intl.NumberFormat('ro-MD', { maximumFractionDigits: 0 }).format(value);

const formatResponseTime = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined || minutes < 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
};

const nameOf = (request: DoctorRequest) => request.patient_profile?.name || request.patient?.name || 'Pacient';
const initialsOf = (name: string) => name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);
const isToday = (value?: string | null) => Boolean(value) && new Date(value as string).toDateString() === new Date().toDateString();

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Bună dimineața';
  if (hour < 18) return 'Bună ziua';
  return 'Bună seara';
}

/**
 * Prima pagină a medicului răspunde la „ce am de făcut acum”: cereri care
 * așteaptă răspuns, agenda zilei și consultațiile rămase fără concluzie.
 * Cifrele lunii stau pe coloana laterală, nu în prim-plan.
 */
export function DoctorHome() {
  const { user } = useAuth();
  const now = useNow();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [requests, setRequests] = useState<DoctorRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

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
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const needsReply = useMemo(() => requests
    .filter((request) => request.status === 'new')
    .sort((a, b) => (time(a.acceptance_expires_at) || Number.MAX_SAFE_INTEGER) - (time(b.acceptance_expires_at) || Number.MAX_SAFE_INTEGER)), [requests]);
  const toFinish = useMemo(() => requests.filter((request) => request.status === 'accepted' && request.doctor_started_at), [requests]);
  const agenda = useMemo(() => requests
    .filter((request) => request.status === 'accepted' && !request.doctor_started_at && (!request.scheduled_at || isToday(request.scheduled_at) || time(request.scheduled_at) < now))
    .sort((a, b) => (time(a.scheduled_at) || time(a.created_at)) - (time(b.scheduled_at) || time(b.created_at))), [requests, now]);
  const upcoming = useMemo(() => requests
    .filter((request) => request.status === 'accepted' && !request.doctor_started_at && request.scheduled_at && !isToday(request.scheduled_at) && time(request.scheduled_at) > now)
    .sort((a, b) => time(a.scheduled_at) - time(b.scheduled_at)), [requests, now]);

  const acceptRequest = async (request: DoctorRequest) => {
    setAcceptingId(request.id);
    try {
      await apiRequest(`/requests/${request.id}/accept`, { method: 'POST' });
      toast.success(`Cererea pentru ${nameOf(request)} a fost acceptată.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setAcceptingId(null);
    }
  };

  const summary = dashboard?.summary;
  const lastName = user?.name?.split(' ').slice(-1)[0] ?? '';
  const today = new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${today.charAt(0).toUpperCase() + today.slice(1)}${user?.doctor_institution ? ` · ${user.doctor_institution.name}` : ''}`}
        title={`${greeting()}, Dr. ${lastName}`}
        documentTitle="Acasă"
        description={isLoading ? 'Se încarcă activitatea zilei…' : needsReply.length + agenda.length + toFinish.length === 0 ? 'Nu ai nimic urgent. Cererile noi apar aici imediat ce sosesc.' : 'Iată ce te așteaptă astăzi.'}
        actions={<Button asChild variant="outline"><Link to="/doctor/consultations">Toate consultațiile<ArrowRight className="h-4 w-4" /></Link></Button>}
      />

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>Reîncearcă</button></p>}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <FocusTile icon={Inbox} label="Necesită răspuns" value={needsReply.length} tone="amber" loading={isLoading} />
        <FocusTile icon={CalendarCheck2} label="De consultat azi" value={agenda.length} tone="blue" loading={isLoading} />
        <FocusTile icon={FileText} label="Fără concluzie" value={toFinish.length} tone="emerald" loading={isLoading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Cereri noi */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader title="Necesită răspuns" description="Confirmă ora sau deschide cererea pentru detalii." />
            <div className="mt-4">
              {isLoading ? <ListSkeleton rows={2} /> : needsReply.length === 0 ? (
                <EmptyState compact icon={CheckCircle2} title="Ești la zi" description="Nicio cerere nu așteaptă răspunsul tău." className="border-none bg-slate-50" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {needsReply.map((request) => {
                    const expiresIn = timeUntil(request.acceptance_expires_at, now);
                    return (
                      <li key={request.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                        <Link to={`/doctor/consultations?request=${request.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar className="size-10 shrink-0"><AvatarFallback className="bg-amber-50 text-xs font-semibold text-amber-800">{initialsOf(nameOf(request))}</AvatarFallback></Avatar>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900">{nameOf(request)}</span>
                            <span className="block truncate text-sm text-slate-500">
                              {CONSULTATION_KIND_LABELS[request.consultation_kind ?? ''] ?? 'Consultație'}
                              {request.scheduled_at && ` · cerută pentru ${relativeDay(request.scheduled_at).toLowerCase()}, ${timeOnly(request.scheduled_at)}`}
                            </span>
                          </span>
                        </Link>
                        <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                          {expiresIn && <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', expiresIn === 'expirat' ? 'text-red-600' : 'text-amber-700')}><Hourglass className="h-3.5 w-3.5" />{expiresIn === 'expirat' ? 'Expirat' : expiresIn}</span>}
                          <Button size="sm" variant="outline" asChild><Link to={`/doctor/consultations?request=${request.id}`}>Detalii</Link></Button>
                          <Button size="sm" onClick={() => void acceptRequest(request)} disabled={acceptingId === request.id}>{acceptingId === request.id ? 'Se acceptă…' : 'Acceptă'}</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Agenda */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader title="Agenda" description="Consultații confirmate și cele începute, în ordinea orei." />
            <div className="mt-4">
              {isLoading ? <ListSkeleton rows={2} /> : toFinish.length + agenda.length + upcoming.length === 0 ? (
                <EmptyState compact icon={CalendarCheck2} title="Nicio consultație programată" description="Consultațiile confirmate apar aici, în ordinea orei." className="border-none bg-slate-50" />
              ) : (
                <ol className="relative space-y-2 before:absolute before:bottom-3 before:left-[51px] before:top-3 before:w-px before:bg-slate-200">
                  {[...toFinish, ...agenda, ...upcoming.slice(0, 4)].map((request) => (
                    <AgendaRow key={request.id} request={request} now={now} />
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        {/* Luna curentă */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader title="Luna aceasta" actions={<Link to="/doctor/stats" className="text-sm font-semibold text-primary hover:underline">Statistici</Link>} />
            <dl className="mt-4 space-y-4">
              <Metric label="Venit" loading={isLoading} value={`${formatMoney(summary?.current_month_revenue ?? 0)} MDL`} detail={summary?.revenue_change_percent === null || summary?.revenue_change_percent === undefined ? 'Fără date pentru luna trecută' : `${summary.revenue_change_percent > 0 ? '+' : ''}${summary.revenue_change_percent}% față de luna trecută`} icon={TrendingUp} />
              <Metric label="Consultații finalizate" loading={isLoading} value={String(summary?.current_month_consultations ?? 0)} icon={CheckCircle2} />
              <Metric label="Rating" loading={isLoading} value={(summary?.rating ?? 0).toFixed(1)} detail={`${summary?.reviews_count ?? 0} recenzii`} icon={Star} />
              <Metric label="Timp mediu de răspuns" loading={isLoading} value={formatResponseTime(summary?.average_response_minutes)} icon={Clock} />
            </dl>
          </section>
          {summary?.performance && (
            <Link to="/doctor/stats" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/30">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-500">Indicator de performanță</span>
                <span className="tabular mt-1 block text-2xl font-bold text-slate-950">{summary.performance.score.toLocaleString('ro-MD', { maximumFractionDigits: 1 })} <span className="text-sm font-medium text-slate-500">puncte</span></span>
                <span className="mt-1 block text-xs text-slate-500">Vezi cum se calculează</span>
              </span>
              <ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function FocusTile({ icon: Icon, label, value, tone, loading }: { icon: React.ElementType; label: string; value: number; tone: 'amber' | 'blue' | 'emerald'; loading: boolean }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700'
  };
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11', tones[tone])}><Icon className="h-5 w-5" /></span>
      <span>
        {loading ? <Skeleton className="h-7 w-8" /> : <span className="tabular block text-2xl font-bold leading-7 text-slate-950">{value}</span>}
        <span className="block text-xs leading-4 text-slate-500 sm:text-sm">{label}</span>
      </span>
    </div>
  );
}

function AgendaRow({ request, now }: { request: DoctorRequest; now: number }) {
  const when = request.scheduled_at || request.created_at;
  const started = Boolean(request.doctor_started_at);
  const late = !started && request.scheduled_at && time(request.scheduled_at) < now;
  const hint = started ? 'Scrie concluzia' : !request.ready_for_doctor ? 'Așteaptă examinarea' : late ? 'Poți începe acum' : `Începe la ${timeOnly(when)}`;
  return (
    <li className="relative">
      <Link to={`/doctor/consultations?request=${request.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50">
        <span className="tabular w-10 shrink-0 text-right text-sm font-semibold text-slate-900">{started ? 'Acum' : request.scheduled_at ? timeOnly(when) : '—'}</span>
        <span className={cn('relative z-10 h-3 w-3 shrink-0 rounded-full border-2 border-white ring-2', started ? 'bg-emerald-500 ring-emerald-100' : late ? 'bg-amber-500 ring-amber-100' : 'bg-blue-500 ring-blue-100')} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-slate-900">{nameOf(request)}</span>
            <StatusBadge request={request} perspective="doctor" />
          </span>
          <span className="block truncate text-sm text-slate-500">
            {!isToday(when) && !started ? `${relativeDay(when)} · ` : ''}{CONSULTATION_KIND_LABELS[request.consultation_kind ?? ''] ?? 'Consultație'}
          </span>
        </span>
        <span className="hidden shrink-0 text-sm font-medium text-primary sm:block">{hint}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      </Link>
    </li>
  );
}

function Metric({ label, value, detail, icon: Icon, loading }: { label: string; value: string; detail?: string; icon: React.ElementType; loading: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <dt className="text-sm text-slate-500">{label}</dt>
        {loading ? <Skeleton className="mt-1 h-5 w-20" /> : <dd className="tabular text-lg font-bold text-slate-950">{value}</dd>}
        {detail && !loading && <dd className="text-xs text-slate-500">{detail}</dd>}
      </div>
    </div>
  );
}
