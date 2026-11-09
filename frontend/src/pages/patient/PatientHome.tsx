import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, ChevronDown, ChevronRight, Clock, CreditCard, FileText, Plus, Star, Stethoscope, UserPlus, Video, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../components/ui/utils';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { StatusBadge } from '../../components/app/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';
import { patientAge } from '../../lib/medical-record';
import { buildHomeAlerts, countdown, readDismissed, recordProgress, writeDismissed, type HomeAlert, type HomeProfile, type ReviewableRequest } from '../../lib/patient-alerts';
import { consultationTitle, type PatientConsultation } from '../../lib/patient-consultations';

interface WalletData {
  wallet: { balance: number; currency: string };
  points_wallet?: { balance: number };
  promo_wallet?: { balance: number };
  reserved?: { total: number };
}

type ProfileResponse = {
  patient_profiles: HomeProfile[];
  card_purchases?: Array<{ available_slots: number; profile_slots: number; expires_at: string }>;
};

const TODO_VISIBLE = 3;

/**
 * Acasă: un card „Acum”, trei lucruri de făcut, restul la un click.
 * Toate alertele vin dintr-o listă ordonată pe niveluri (vezi `lib/patient-alerts`).
 */
export function PatientHome() {
  const { user } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [requests, setRequests] = useState<PatientConsultation[]>([]);
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [reviewable, setReviewable] = useState<ReviewableRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const paymentsEnabled = isEnabled('payments');
  const doctorsEnabled = isEnabled('doctors');

  const load = useCallback(async () => {
    const [walletResponse, profileResponse, requestsResponse, reviewableResponse] = await Promise.allSettled([
      apiRequest<WalletData>('/wallet'),
      apiRequest<ProfileResponse>('/patient/profile'),
      apiRequest<{ data: PatientConsultation[] }>('/requests'),
      apiRequest<{ data: ReviewableRequest[] }>('/patient/reviewable-requests')
    ]);
    if (walletResponse.status === 'fulfilled') setWallet(walletResponse.value);
    if (profileResponse.status === 'fulfilled') setProfileData(profileResponse.value);
    if (requestsResponse.status === 'fulfilled') setRequests(requestsResponse.value.data ?? []);
    if (reviewableResponse.status === 'fulfilled') setReviewable(reviewableResponse.value.data ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const profiles = profileData?.patient_profiles ?? [];
  const purchases = profileData?.card_purchases ?? [];
  const availableSlots = purchases.reduce((sum, item) => sum + item.available_slots, 0);
  const packagesRequired = isEnabled('patient_cards') && paymentsEnabled;
  const needsPackage = packagesRequired && availableSlots === 0;
  const requestableProfiles = profiles.filter((profile) => profile.can_request_consultation);

  const alerts = useMemo(
    () => buildHomeAlerts({ requests, reviewable, profiles, needsPackage, now }).filter((alert) => !dismissed.includes(alert.id)),
    [requests, reviewable, profiles, needsPackage, now, dismissed]
  );
  const [current, ...rest] = alerts;
  const todo = showAll ? rest : rest.slice(0, TODO_VISIBLE);
  const hiddenCount = rest.length - TODO_VISIBLE;
  const recentConsultations = useMemo(() => [...requests].sort((a, b) => new Date(b.scheduled_at ?? b.created_at).getTime() - new Date(a.scheduled_at ?? a.created_at).getTime()).slice(0, 4), [requests]);
  const showFab = doctorsEnabled && requestableProfiles.length > 0 && current !== undefined;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  const firstName = user?.name?.split(' ')[0] ?? '';

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <PageHeader title={`Bună, ${firstName}`} documentTitle="Acasă" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {isLoading ? <Skeleton className="h-44 w-full rounded-2xl" /> : current ? (
            <NowCard alert={current} now={now} onChanged={load} onDismiss={dismiss} />
          ) : (
            <CalmCard canBook={doctorsEnabled && requestableProfiles.length > 0} />
          )}

          {!isLoading && todo.length > 0 && (
            <section aria-labelledby="todo-title" className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <h2 id="todo-title" className="px-3 pb-1 pt-2 text-sm font-semibold text-slate-500">De făcut</h2>
              <ul className="divide-y divide-slate-100">
                {todo.map((alert) => <TodoRow key={alert.id} alert={alert} onChanged={load} onDismiss={dismiss} />)}
              </ul>
              {hiddenCount > 0 && (
                <button type="button" onClick={() => setShowAll((value) => !value)} className="flex w-full items-center justify-center gap-1 rounded-xl py-2 text-sm font-semibold text-primary hover:bg-primary/5">
                  {showAll ? 'Arată mai puține' : `Vezi toate (${rest.length})`}<ChevronDown className={cn('h-4 w-4 transition', showAll && 'rotate-180')} />
                </button>
              )}
            </section>
          )}

          {!isLoading && requests.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader title="Consultații" actions={<Link to="/patient/consultations" className="text-sm font-semibold text-primary hover:underline">Toate</Link>} />
              <ul className="mt-3 divide-y divide-slate-100">
                {recentConsultations.map((request) => <ConsultationRow key={request.id} request={request} />)}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          {!isLoading && profiles.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader title="Pacienții mei" actions={<Link to="/patient/profile" className="text-sm font-semibold text-primary hover:underline">Toți</Link>} />
              <ul className="mt-3 space-y-2">
                {profiles.slice(0, 4).map((profile) => <PatientRow key={profile.id} profile={profile} canBook={doctorsEnabled} />)}
              </ul>
              {(!packagesRequired || availableSlots > 0) && (
                <Button asChild variant="ghost" className="mt-2 w-full justify-start text-primary">
                  <Link to="/patient/profile"><Plus className="h-4 w-4" />Adaugă pacient{packagesRequired ? <span className="ml-auto text-xs font-normal text-slate-500">{availableSlots} {availableSlots === 1 ? 'loc liber' : 'locuri libere'}</span> : null}</Link>
                </Button>
              )}
            </section>
          )}

          {paymentsEnabled && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader title="Portofel" actions={<Link to="/patient/wallet" className="text-sm font-semibold text-primary hover:underline">Detalii</Link>} />
              {isLoading ? <Skeleton className="mt-3 h-16 w-full" /> : (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <WalletFigure label="Bani" value={`${mdl(wallet?.wallet.balance)} MDL`} strong />
                  <WalletFigure label="Bonusuri" value={mdl((wallet?.points_wallet?.balance ?? 0) + (wallet?.promo_wallet?.balance ?? 0))} />
                  {(wallet?.reserved?.total ?? 0) > 0 && <WalletFigure label="Rezervat" value={`${mdl(wallet?.reserved?.total)} MDL`} />}
                </dl>
              )}
              <Button asChild variant="outline" className="mt-4 w-full"><Link to="/patient/wallet?topup=1"><Plus className="h-4 w-4" />Alimentează</Link></Button>
            </section>
          )}
        </aside>
      </div>

      {showFab && (
        <Button asChild size="lg" className="fixed bottom-20 right-4 z-30 rounded-full shadow-lg lg:hidden">
          <Link to="/patient/doctors"><Plus className="h-5 w-5" />Programează</Link>
        </Button>
      )}
    </div>
  );
}

function NowCard({ alert, now, onChanged, onDismiss }: { alert: HomeAlert; now: Date; onChanged: () => void; onDismiss: (id: string) => void }) {
  const tone = alert.kind === 'live' ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
    : alert.kind === 'review' || alert.kind === 'proposal' ? 'border-orange-200 bg-gradient-to-br from-orange-50 to-white'
      : alert.kind === 'today' ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
        : 'border-slate-200 bg-white';
  const scheduled = alert.request?.scheduled_at ? new Date(alert.request.scheduled_at) : null;

  return (
    <section aria-label="Acum" className={cn('relative rounded-2xl border p-5 shadow-sm sm:p-6', tone)}>
      {alert.dismissable && <DismissButton onClick={() => onDismiss(alert.id)} />}
      <div className="flex items-start gap-4">
        <AlertIcon alert={alert} large />
        <div className="min-w-0 flex-1">
          {alert.chip && <p className="text-sm font-semibold text-slate-500">{alert.chip}{alert.kind === 'today' && scheduled ? ` · ${countdown(scheduled, now)}` : ''}</p>}
          <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{alert.title}</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">{alert.sub}</p>
        </div>
      </div>
      {alert.kind === 'review' && alert.reviewId ? (
        <InlineReview requestId={alert.reviewId} onDone={onChanged} className="mt-4 sm:pl-16" />
      ) : (
        <div className="mt-5 flex flex-wrap gap-2 sm:pl-16"><AlertActions alert={alert} onChanged={onChanged} primary /></div>
      )}
    </section>
  );
}

function TodoRow({ alert, onChanged, onDismiss }: { alert: HomeAlert; onChanged: () => void; onDismiss: (id: string) => void }) {
  const [rating, setRating] = useState(false);

  return (
    <li className="px-3 py-3">
      <div className="flex items-start gap-3">
        <AlertIcon alert={alert} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{alert.title}</p>
          <p className="text-sm text-slate-500">{alert.sub}</p>
          {alert.kind === 'review' && alert.reviewId && rating && <InlineReview requestId={alert.reviewId} onDone={onChanged} className="mt-3" />}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {alert.kind === 'review' ? (
            !rating && <Button size="sm" variant="outline" onClick={() => setRating(true)}><Star className="h-4 w-4" />Evaluează</Button>
          ) : <AlertActions alert={alert} onChanged={onChanged} />}
          {alert.dismissable && <DismissButton onClick={() => onDismiss(alert.id)} inline />}
        </div>
      </div>
    </li>
  );
}

function AlertActions({ alert, onChanged, primary = false }: { alert: HomeAlert; onChanged: () => void; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const size = primary ? 'default' : 'sm';
  const request = alert.request;

  const acceptProposal = async () => {
    if (!request) return;
    setBusy(true);
    try {
      await apiRequest(`/requests/${request.id}/accept-proposed-time`, { method: 'POST' });
      toast.success('Ora propusă a fost acceptată.');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut accepta ora propusă.');
    } finally {
      setBusy(false);
    }
  };

  switch (alert.kind) {
    case 'setup':
      return <Button asChild size={size}><Link to="/patient/start">{alert.title}</Link></Button>;
    case 'live':
      return <Button asChild size={size} className="bg-emerald-600 hover:bg-emerald-700"><Link to={`/consultations/${request?.id}/video`}><Video className="h-4 w-4" />Intră în apel</Link></Button>;
    case 'proposal':
      return (
        <>
          <Button size={size} disabled={busy} onClick={() => void acceptProposal()}>{busy ? 'Se confirmă…' : 'Accept'}</Button>
          <Button asChild size={size} variant="outline" className="bg-white"><Link to={`/patient/chat?request=${request?.id}`}>Altă oră</Link></Button>
        </>
      );
    case 'record':
      return <Button asChild size={size} variant={primary ? 'default' : 'ghost'}><Link to={`/patient/patients/${alert.profileId}?tab=fisa&section=${alert.sectionKey}`}>Completează</Link></Button>;
    default:
      return request ? <Button asChild size={size} variant={primary ? 'default' : 'ghost'}><Link to={`/patient/chat?request=${request.id}`}>Vezi detaliile</Link></Button> : null;
  }
}

function AlertIcon({ alert, large = false }: { alert: HomeAlert; large?: boolean }) {
  const Icon = { setup: alert.title === 'Alege pachetul' ? CreditCard : UserPlus, live: Video, today: CalendarClock, proposal: CalendarClock, review: Star, waiting: Clock, upcoming: CalendarClock, record: FileText }[alert.kind];
  const tone = alert.kind === 'live' ? 'bg-emerald-600 text-white'
    : alert.kind === 'review' || alert.kind === 'proposal' ? 'bg-orange-100 text-orange-600'
      : alert.kind === 'today' ? 'bg-blue-600 text-white'
        : 'bg-slate-100 text-slate-600';
  return <span className={cn('grid shrink-0 place-items-center', large ? 'h-12 w-12 rounded-2xl' : 'h-9 w-9 rounded-xl', tone)}><Icon className={large ? 'h-6 w-6' : 'h-4 w-4'} /></span>;
}

function DismissButton({ onClick, inline = false }: { onClick: () => void; inline?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label="Închide" className={cn('grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700', !inline && 'absolute right-3 top-3')}>
      <X className="h-4 w-4" />
    </button>
  );
}

function CalmCard({ canBook }: { canBook: boolean }) {
  return (
    <section aria-label="Acum" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Stethoscope className="h-6 w-6" /></span>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Nicio consultație programată</h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">Când ai nevoie, alegi medicul și ora. Video sau cu examinare acasă.</p>
        </div>
      </div>
      {canBook && <div className="mt-5 sm:pl-16"><Button asChild><Link to="/patient/doctors"><Plus className="h-4 w-4" />Programează o consultație</Link></Button></div>}
    </section>
  );
}

function ConsultationRow({ request }: { request: PatientConsultation }) {
  const date = new Date(request.scheduled_at ?? request.created_at);
  return (
    <li>
      <Link to={`/patient/chat?request=${request.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-slate-50">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-center leading-none text-slate-700">
          <span>
            <span className="block text-[10px] uppercase">{date.toLocaleDateString('ro-RO', { weekday: 'short', timeZone: 'Europe/Chisinau' }).replace('.', '')}</span>
            <span className="block text-base font-semibold">{date.toLocaleDateString('ro-RO', { day: 'numeric', timeZone: 'Europe/Chisinau' })}</span>
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{request.doctor?.name ?? request.operator?.name ?? consultationTitle(request)}</span>
          <span className="block truncate text-sm text-slate-500">{[request.consultation_kind === 'with_exam' ? 'Cu examinare' : request.type === 'operator' ? 'Examinare' : 'Video', request.patient_profile?.name].filter(Boolean).join(' · ')}</span>
        </span>
        <StatusBadge request={request} perspective="patient" />
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
      </Link>
    </li>
  );
}

function PatientRow({ profile, canBook }: { profile: HomeProfile; canBook: boolean }) {
  const progress = recordProgress(profile);
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  return (
    <li className="flex items-center gap-3">
      <Link to={`/patient/patients/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 hover:bg-slate-50">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials}</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-slate-900">{name}</span>
          <span className="block truncate text-xs text-slate-500">{profile.birth_date ? `${patientAge(profile.birth_date)} · ` : ''}Fișa {progress.done}/{progress.total}</span>
        </span>
      </Link>
      {canBook && profile.can_request_consultation && <Button asChild size="sm" variant="ghost" className="text-primary"><Link to={`/patient/doctors?patient_profile=${profile.id}`}>Programează</Link></Button>}
    </li>
  );
}

function WalletFigure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn('tabular-nums text-slate-950', strong ? 'text-lg font-bold' : 'font-semibold')}>{value}</dd>
    </div>
  );
}

/** Evaluarea restantă blochează următoarea programare, așa că o cerem direct din card. */
function InlineReview({ requestId, onDone, className }: { requestId: string; onDone: () => void; className?: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rating || !comment.trim()) return;
    setSaving(true);
    try {
      await apiRequest(`/requests/${requestId}/review`, { method: 'POST', body: JSON.stringify({ rating, comment: comment.trim() }) });
      toast.success('Mulțumim! Poți programa din nou.');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva evaluarea.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn('space-y-3', className)}>
      <div className="flex gap-1" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} din 5`} onClick={() => setRating(value)} className="rounded-lg p-1 transition hover:bg-orange-100">
            <Star className={cn('h-7 w-7', value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
          </button>
        ))}
      </div>
      {rating > 0 && <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Câteva cuvinte despre consultație" maxLength={2000} className="min-h-[72px] bg-white" required />}
      {rating > 0 && <Button type="submit" disabled={saving || !comment.trim()}>{saving ? 'Se trimite…' : 'Trimite evaluarea'}</Button>}
    </form>
  );
}

function mdl(value: unknown): string {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}
