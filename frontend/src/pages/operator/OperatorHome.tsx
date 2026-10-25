import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, CalendarCheck2, CheckCircle2, ChevronRight, ClipboardCheck, Hourglass, Inbox, MapPin, MessageSquare, Navigation } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ListSkeleton, Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { useDialogs } from '../../components/app/DialogProvider';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { relativeDay, timeOnly, timeUntil } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { addressOf, mapsUrl, operatorStageOf, patientNameOf, type RequestItem } from '../../lib/operator-visits';

const isToday = (value?: string | null) => Boolean(value) && new Date(value as string).toDateString() === new Date().toDateString();
const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);

/**
 * Operatorul lucrează pe teren, de pe telefon. Pagina începe cu următoarea
 * vizită (adresă + hărți), apoi cererile noi care trebuie preluate la timp.
 */
export function OperatorHome() {
  const { user } = useAuth();
  const dialogs = useDialogs();
  const now = useNow();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRequests = useCallback(() => {
    apiRequest<{ data: RequestItem[] }>('/requests')
      .then((response) => setRequests(response.data ?? []))
      .catch(() => setRequests([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadRequests();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadRequests(); }, 30000);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  const pending = useMemo(() => requests
    .filter((request) => ['new', 'rescheduled'].includes(request.status))
    .sort((a, b) => (time(a.acceptance_expires_at) || Number.MAX_SAFE_INTEGER) - (time(b.acceptance_expires_at) || Number.MAX_SAFE_INTEGER)), [requests]);
  const active = useMemo(() => requests
    .filter((request) => operatorStageOf(request) === 'active')
    .sort((a, b) => (time(a.scheduled_at) || time(a.accepted_at) || time(a.created_at)) - (time(b.scheduled_at) || time(b.accepted_at) || time(b.created_at))), [requests]);
  const acceptedToday = requests.filter((request) => isToday(request.accepted_at)).length;
  // „Finalizate” înseamnă examinări încheiate de operator, nu consultații
  // închise de medic — altfel contorul ar rămâne zero deși el și-a făcut treaba.
  const completedToday = requests.filter((request) => isToday(request.objective_data_completed_at)).length;
  const nextVisit = active[0];

  const acceptRequest = async (request: RequestItem) => {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setBusyId(null);
      loadRequests();
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Panou operator"
        title={`Salut, ${firstName}`}
        documentTitle="Acasă"
        description="Vizitele de azi și cererile noi din zona ta."
        actions={<Button asChild variant="outline"><Link to="/operator/patients">Toate vizitele<ArrowRight className="h-4 w-4" /></Link></Button>}
      />

      {/* Următoarea vizită */}
      {isLoading ? <Skeleton className="h-40 w-full rounded-2xl" /> : nextVisit ? (
        <section className="overflow-hidden rounded-2xl border border-primary/20 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-primary/10 bg-primary/5 px-5 py-3">
            <p className="text-sm font-semibold text-primary">Următoarea vizită</p>
            <p className="tabular text-sm font-semibold text-slate-700">{nextVisit.scheduled_at ? `${relativeDay(nextVisit.scheduled_at)}, ${timeOnly(nextVisit.scheduled_at)}` : 'Cât mai curând'}</p>
          </div>
          <div className="p-5">
            <h2 className="text-xl font-bold tracking-tight text-slate-950">{patientNameOf(nextVisit)}</h2>
            {addressOf(nextVisit) && <p className="mt-1.5 flex items-start gap-2 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{addressOf(nextVisit)}</p>}
            {nextVisit.symptoms && <p className="mt-3 line-clamp-2 text-sm text-slate-500">{nextVisit.symptoms}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild><Link to={`/operator/patients?request=${nextVisit.id}`}><ClipboardCheck className="h-4 w-4" />Deschide vizita</Link></Button>
              {addressOf(nextVisit) && <Button asChild variant="outline"><a href={mapsUrl(addressOf(nextVisit))} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />Navigare</a></Button>}
              <Button asChild variant="outline"><Link to={`/operator/chat?request=${nextVisit.id}`}><MessageSquare className="h-4 w-4" />Mesaje</Link></Button>
            </div>
          </div>
        </section>
      ) : (
        <EmptyState icon={CalendarCheck2} title="Nicio vizită în lucru" description="Preia o cerere nouă de mai jos ca să începi." />
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile icon={Inbox} label="Cereri noi" value={pending.length} tone="bg-amber-50 text-amber-700" loading={isLoading} />
        <Tile icon={CalendarCheck2} label="Preluate azi" value={acceptedToday} tone="bg-blue-50 text-blue-700" loading={isLoading} />
        <Tile icon={CheckCircle2} label="Examinări finalizate azi" value={completedToday} tone="bg-emerald-50 text-emerald-700" loading={isLoading} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <SectionHeader title="Cereri noi" description="Preia cererea înainte să expire termenul." actions={pending.length > 5 && <Link to="/operator/patients" className="text-sm font-semibold text-primary hover:underline">Vezi toate</Link>} />
        <div className="mt-4">
          {isLoading ? <ListSkeleton rows={2} /> : pending.length === 0 ? (
            <EmptyState compact icon={CheckCircle2} title="Nicio cerere nouă" description="Te anunțăm imediat ce apare o cerere în zona ta." className="border-none bg-slate-50" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.slice(0, 5).map((request) => {
                const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;
                return (
                  <li key={request.id} className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <Link to={`/operator/patients?request=${request.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><MapPin className="h-5 w-5" /></span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{patientNameOf(request)}</span>
                        <span className="block truncate text-sm text-slate-500">{addressOf(request) || 'Adresă necompletată'}</span>
                      </span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                      {expiresIn && <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', expiresIn === 'expirat' ? 'text-red-600' : 'text-amber-700')}><Hourglass className="h-3.5 w-3.5" />{expiresIn === 'expirat' ? 'Expirat' : expiresIn}</span>}
                      {request.status === 'rescheduled' ? (
                        <Button asChild size="sm" variant="ghost"><Link to={`/operator/patients?request=${request.id}`}>Așteaptă pacientul<ChevronRight className="h-4 w-4" /></Link></Button>
                      ) : (
                        <Button size="sm" onClick={() => void acceptRequest(request)} disabled={busyId === request.id}>{busyId === request.id ? 'Se preia…' : 'Preia cazul'}</Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone, loading }: { icon: React.ElementType; label: string; value: number; tone: string; loading: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11', tone)}><Icon className="h-5 w-5" /></span>
      <span>
        {loading ? <Skeleton className="h-7 w-8" /> : <span className="tabular block text-2xl font-bold leading-7 text-slate-950">{value}</span>}
        <span className="block text-xs leading-4 text-slate-500 sm:text-sm">{label}</span>
      </span>
    </div>
  );
}
