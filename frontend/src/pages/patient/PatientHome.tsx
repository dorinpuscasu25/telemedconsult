import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, Check, ChevronDown, Clock, CreditCard, FileText, Plus, Star, UserPlus, Video, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../components/ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';
import { patientAge } from '../../lib/medical-record';
import { ProposalResponse } from '../../components/patient/ProposalResponse';
import { buildHomeAlerts, countdown, formatTime, readDismissed, recordProgress, writeDismissed, type AlertLevel, type HomeAlert, type HomeProfile, type ReviewableRequest } from '../../lib/patient-alerts';
import type { PatientConsultation } from '../../lib/patient-consultations';

interface WalletData {
  wallet: { balance: number; currency: string };
  points_wallet?: { balance: number };
  promo_wallet?: { balance: number };
  reserved?: { total: number };
}

type Profile = HomeProfile & { active_until?: string | null };
type ProfileResponse = {
  patient_profiles: Profile[];
  card_purchases?: Array<{ available_slots: number; profile_slots: number; expires_at: string }>;
};

const TODO_VISIBLE = 3;
const TZ = 'Europe/Chisinau';

/** Culorile nivelurilor de alertă, ca în design: 1 acum (albastru), 2 blochează (portocaliu), 3 informativ (gri). */
const LEVEL_STYLE: Record<AlertLevel, string> = {
  1: 'bg-blue-50 text-blue-600',
  2: 'bg-orange-50 text-orange-600',
  3: 'bg-slate-100 text-slate-600'
};

/** Starea unei consultații în lista de pe Acasă. */
const CONSULT_STATE: Record<string, { label: string; className: string }> = {
  accepted: { label: 'Confirmată', className: 'bg-green-50 text-green-700' },
  new: { label: 'Așteaptă medicul', className: 'bg-amber-100 text-amber-800' },
  rescheduled: { label: 'Oră nouă propusă', className: 'bg-orange-50 text-orange-700' },
  completed: { label: 'Încheiată', className: 'bg-slate-100 text-slate-600' }
};

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
  const canAddPatient = !packagesRequired || availableSlots > 0;

  // Propunerile de oră au cardul lor cu alegerea orei (P1b), deasupra celorlalte.
  const proposals = useMemo(() => requests.filter((request) => request.status === 'rescheduled'), [requests]);
  const alerts = useMemo(
    () => buildHomeAlerts({ requests, reviewable, profiles, needsPackage, now }).filter((alert) => !dismissed.includes(alert.id) && alert.kind !== 'proposal'),
    [requests, reviewable, profiles, needsPackage, now, dismissed]
  );
  const [current, ...rest] = alerts;
  const todo = showAll ? rest : rest.slice(0, TODO_VISIBLE);
  const hiddenCount = rest.length - TODO_VISIBLE;
  const recentConsultations = useMemo(() => [...requests].sort((a, b) => new Date(b.scheduled_at ?? b.created_at).getTime() - new Date(a.scheduled_at ?? a.created_at).getTime()).slice(0, 4), [requests]);
  // Butonul plutitor: doar în stările B și D (lipsește la configurare, apel în curs și când totul e liniștit).
  const showFab = doctorsEnabled && requestableProfiles.length > 0 && current !== undefined && current.kind !== 'setup' && current.kind !== 'live';

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(next);
  };

  const firstName = user?.name?.split(' ')[0] ?? '';
  const money = wallet?.wallet.balance ?? 0;
  const bonus = (wallet?.points_wallet?.balance ?? 0) + (wallet?.promo_wallet?.balance ?? 0);
  const reserved = wallet?.reserved?.total ?? 0;

  useEffect(() => { document.title = 'Acasă · telemedconsult.md'; }, []);

  const patientsSection = profiles.length > 0 && (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-base font-semibold text-slate-950 lg:px-0">Pacienții mei</h2>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:px-0">
        {profiles.map((profile) => <PatientTile key={profile.id} profile={profile} canBook={doctorsEnabled} />)}
        {canAddPatient && (
          <Link to="/patient/profile" className="flex w-[140px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-slate-300 p-3.5 text-center hover:border-slate-400 lg:w-auto">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"><Plus className="h-5 w-5" /></span>
            <span className="text-sm font-semibold text-slate-950">Adaugă pacient</span>
            {packagesRequired && <span className="text-xs text-slate-500">{availableSlots} {availableSlots === 1 ? 'loc liber' : 'locuri libere'}</span>}
          </Link>
        )}
      </div>
    </section>
  );

  const consultationsSection = recentConsultations.length > 0 && (
    <section className="flex flex-col gap-2.5 lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
      <div className="flex items-center justify-between px-1 lg:px-4 lg:py-3.5"><h2 className="text-base font-semibold text-slate-950 lg:text-[15px]">Consultații</h2><Link to="/patient/consultations" className="text-sm font-medium text-blue-600 lg:text-[13px]">Toate</Link></div>
      <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:rounded-none lg:border-0">
        {recentConsultations.map((request, index) => <ConsultationRow key={request.id} request={request} first={index === 0} />)}
      </ul>
    </section>
  );

  return (
    <div className="pb-20 lg:pb-0">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <h1 className="text-[26px] font-bold tracking-tight text-slate-950 lg:text-[28px]">Bună, {firstName}</h1>

          {proposals.map((request) => <ProposalResponse key={request.id} request={request} onChanged={load} />)}

          {isLoading ? <Skeleton className="h-44 w-full rounded-2xl" /> : current ? (
            <NowCard alert={current} now={now} needsPackage={needsPackage} onChanged={load} onDismiss={dismiss} />
          ) : (
            <CalmCard canBook={doctorsEnabled && requestableProfiles.length > 0} />
          )}

          {!isLoading && todo.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="px-1 text-base font-semibold text-slate-950 lg:px-0">De făcut</h2>
              <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {todo.map((alert, index) => <TodoRow key={alert.id} alert={alert} first={index === 0} onChanged={load} onDismiss={dismiss} />)}
              </ul>
              {hiddenCount > 0 && (
                <button type="button" onClick={() => setShowAll((value) => !value)} className="flex items-center justify-center gap-1 rounded-xl py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                  {showAll ? 'Arată mai puține' : `Vezi toate (${rest.length})`}<ChevronDown className={cn('h-4 w-4 transition', showAll && 'rotate-180')} />
                </button>
              )}
            </section>
          )}

          {!isLoading && patientsSection}
          {!isLoading && <div className="lg:hidden">{consultationsSection}</div>}

          {/* Telefon: portofelul pe un singur rând. */}
          {paymentsEnabled && !isLoading && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 lg:hidden">
              <Link to="/patient/wallet" className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] text-slate-500">Portofel</span>
                <span className="truncate text-sm text-slate-900"><b>Bani {mdl(money)} MDL</b> · Bonusuri {mdl(bonus)}{reserved > 0 ? ` · Rezervat ${mdl(reserved)}` : ''}</span>
              </Link>
              <Link to="/patient/wallet?topup=1" className="flex h-9 shrink-0 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900">Alimentează</Link>
            </div>
          )}
        </div>

        {/* Desktop: portofelul și consultațiile în coloana din dreapta. */}
        <aside className="hidden flex-col gap-4 lg:flex lg:pt-[58px]">
          {paymentsEnabled && (
            <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-[18px]">
              <span className="text-[13px] text-slate-500">Portofel</span>
              {isLoading ? <Skeleton className="h-16 w-full" /> : (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-900">Bani</span><b className="text-lg text-slate-950">{mdl(money)} MDL</b></div>
                  <div className="flex justify-between text-slate-600"><span>Bonusuri</span><span>{mdl(bonus)}</span></div>
                  {reserved > 0 && <div className="flex justify-between text-slate-600"><span>Rezervat</span><span>{mdl(reserved)} MDL</span></div>}
                </div>
              )}
              <Link to="/patient/wallet?topup=1" className="flex h-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-900 hover:bg-slate-50">Alimentează</Link>
            </section>
          )}
          {!isLoading && consultationsSection}
        </aside>
      </div>

      {showFab && (
        <Link to="/patient/doctors" className="fixed bottom-[calc(76px+max(12px,env(safe-area-inset-bottom)))] right-4 z-30 flex h-12 items-center gap-2 rounded-full border border-blue-200 bg-white px-5 text-sm font-semibold text-blue-700 shadow-[0_4px_16px_rgba(37,99,235,.12)] lg:hidden">
          <Plus className="h-4 w-4" />Programează
        </Link>
      )}
    </div>
  );
}

/** Cardul „Acum”: un singur lucru, cu acțiunea lui. Forma se schimbă după tipul alertei (A–D din design). */
function NowCard({ alert, now, needsPackage, onChanged, onDismiss }: { alert: HomeAlert; now: Date; needsPackage: boolean; onChanged: () => void; onDismiss: (id: string) => void }) {
  if (alert.kind === 'setup') return <SetupCard alert={alert} needsPackage={needsPackage} />;
  if (alert.kind === 'live') return <LiveCard alert={alert} now={now} />;

  const scheduled = alert.request?.scheduled_at ? new Date(alert.request.scheduled_at) : null;
  const chip = alert.kind === 'today' && scheduled ? `Azi, ${formatTime(scheduled)} · ${countdown(scheduled, now)}` : alert.chip;
  const Icon = iconFor(alert);
  const accent = alert.kind === 'review' || alert.kind === 'proposal' ? 'orange' : 'blue';

  return (
    <section aria-label="Acum" className={cn('relative flex flex-col gap-4 rounded-2xl border bg-white p-5 lg:flex-row lg:items-center lg:gap-6 lg:px-6 lg:py-[22px]', accent === 'orange' ? 'border-orange-200 shadow-[0_4px_16px_rgba(234,88,12,.08)]' : 'border-blue-200 shadow-[0_4px_16px_rgba(37,99,235,.08)]')}>
      {alert.dismissable && <DismissButton onClick={() => onDismiss(alert.id)} className="absolute right-3 top-3" />}
      <span className={cn('hidden h-14 w-14 shrink-0 place-items-center rounded-[14px] lg:grid', accent === 'orange' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600')}><Icon className="h-6 w-6" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {chip && <span className={cn('self-start rounded-full px-2.5 py-1 text-xs font-semibold', accent === 'orange' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700')}>{chip}</span>}
        <span className="text-xl font-bold leading-[1.25] tracking-tight text-slate-950">{alert.title}</span>
        <span className="text-sm leading-[1.45] text-slate-500">{alert.sub}</span>
        {alert.kind === 'review' && alert.reviewId && <InlineReview requestId={alert.reviewId} onDone={onChanged} className="mt-2" />}
      </div>
      {alert.kind !== 'review' && <div className="flex shrink-0 flex-col gap-2 lg:flex-row [&>*]:h-12 [&>*]:text-[15px]"><AlertActions alert={alert} onChanged={onChanged} primary /></div>}
    </section>
  );
}

/** A: configurare neterminată, cu cei trei pași. */
function SetupCard({ alert, needsPackage }: { alert: HomeAlert; needsPackage: boolean }) {
  const steps = [
    { label: 'Pachet', state: needsPackage ? 'current' : 'done' },
    { label: 'Pacient', state: needsPackage ? 'todo' : 'current' },
    { label: 'Programare', state: 'todo' }
  ];
  return (
    <section aria-label="Acum" className="flex flex-col gap-[18px] rounded-2xl border border-blue-200 bg-white p-5 shadow-[0_4px_16px_rgba(37,99,235,.08)] lg:px-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-blue-600">{alert.chip}</span>
        <span className="text-xl font-bold tracking-tight text-slate-950">{alert.title}</span>
        <span className="text-sm leading-[1.45] text-slate-500">{alert.sub}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {steps.map((step) => (
          <div key={step.label} className="flex flex-col gap-1.5">
            <span className={cn('h-1 rounded-sm', step.state === 'done' ? 'bg-blue-600' : step.state === 'current' ? 'bg-blue-200' : 'bg-slate-200')} />
            <span className={cn('text-xs', step.state === 'done' ? 'font-semibold text-blue-600' : step.state === 'current' ? 'font-semibold text-slate-950' : 'text-slate-400')}>{step.state === 'done' ? `✓ ${step.label}` : step.label}</span>
          </div>
        ))}
      </div>
      <Button asChild className="h-12 text-[15px] font-semibold lg:self-start lg:px-8"><Link to="/patient/start">{alert.title}</Link></Button>
    </section>
  );
}

/** C: apel în curs, card verde cu o singură acțiune. */
function LiveCard({ alert, now }: { alert: HomeAlert; now: Date }) {
  const started = alert.request?.doctor_started_at ? new Date(alert.request.doctor_started_at) : null;
  const minutes = started ? Math.max(0, Math.round((now.getTime() - started.getTime()) / 60000)) : 0;
  const doctor = alert.request?.doctor?.name ?? 'Medicul';
  return (
    <section aria-label="Acum" className="flex flex-col gap-4 rounded-2xl bg-green-700 p-5 text-white shadow-[0_8px_24px_rgba(21,128,61,.25)] lg:px-6">
      <div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-full bg-green-300 ring-4 ring-green-300/30" /><span className="text-[13px] font-semibold text-green-100">Apel în curs · început {minutes ? `acum ${minutes} min` : 'acum'}</span></div>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/[.18] text-[15px] font-semibold">{initialsOf(doctor)}</span>
        <span className="flex flex-col gap-0.5"><span className="text-[19px] font-bold tracking-tight">{doctor} te așteaptă în apel</span><span className="text-sm text-green-100">{alert.request?.patient_profile?.name ? `pentru ${alert.request.patient_profile.name} · ` : ''}Video</span></span>
      </div>
      <Link to={`/consultations/${alert.request?.id}/video`} className="flex h-[50px] items-center justify-center gap-2 rounded-[10px] bg-white text-base font-bold text-green-700 hover:bg-green-50 lg:self-start lg:px-8"><Video className="h-5 w-5" />Intră în apel</Link>
    </section>
  );
}

/** E: totul în regulă. */
function CalmCard({ canBook }: { canBook: boolean }) {
  return (
    <section aria-label="Acum" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-[22px]">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-green-50 text-green-600"><Check className="h-5 w-5" /></span>
      <div className="flex flex-col gap-1">
        <span className="text-xl font-bold tracking-tight text-slate-950">Nicio consultație programată</span>
        <span className="text-sm leading-[1.45] text-slate-500">Când ai nevoie, alegi medicul și ora. Video sau cu examinare acasă.</span>
      </div>
      {canBook && <Button asChild className="h-12 text-[15px] font-semibold lg:self-start lg:px-8"><Link to="/patient/doctors">Programează o consultație</Link></Button>}
    </section>
  );
}

function TodoRow({ alert, first, onChanged, onDismiss }: { alert: HomeAlert; first: boolean; onChanged: () => void; onDismiss: (id: string) => void }) {
  const Icon = iconFor(alert);
  return (
    <li className={cn('flex items-start gap-3 p-3.5 lg:items-center lg:gap-3.5 lg:px-[18px]', !first && 'border-t border-slate-100')}>
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', LEVEL_STYLE[alert.level])}><Icon className="h-4 w-4" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold leading-[1.35] text-slate-950">{alert.title}</span>
          <span className={cn('text-xs', alert.level === 2 ? 'text-orange-700' : 'text-slate-500')}>{alert.sub}</span>
        </div>
        {alert.kind === 'review' && alert.reviewId
          ? <InlineReview requestId={alert.reviewId} onDone={onChanged} compact />
          : <div className="flex shrink-0 gap-2 [&>*]:h-9 [&>*]:rounded-[10px] [&>*]:text-[13px] [&>*]:font-semibold"><AlertActions alert={alert} onChanged={onChanged} /></div>}
      </div>
      {alert.dismissable && <DismissButton onClick={() => onDismiss(alert.id)} />}
    </li>
  );
}

function AlertActions({ alert, onChanged, primary = false }: { alert: HomeAlert; onChanged: () => void; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const request = alert.request;
  const variant = primary ? 'default' : 'outline';

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
      return <Button asChild variant={variant}><Link to="/patient/start">{alert.title}</Link></Button>;
    case 'proposal':
      return (
        <>
          <Button variant={variant} disabled={busy} onClick={() => void acceptProposal()}>{busy ? 'Se confirmă…' : 'Accept'}</Button>
          <Button asChild variant="outline"><Link to={`/patient/chat?request=${request?.id}`}>Altă oră</Link></Button>
        </>
      );
    case 'record':
      return <Button asChild variant={variant}><Link to={`/patient/patients/${alert.profileId}?tab=fisa&section=${alert.sectionKey}`}>Completează</Link></Button>;
    case 'today':
      return <Button asChild variant={variant}><Link to={`/patient/chat?request=${request?.id}`}>{primary ? 'Vezi detaliile' : 'Detalii'}</Link></Button>;
    default:
      return request ? <Button asChild variant={variant}><Link to={`/patient/chat?request=${request.id}`}>Vezi detaliile</Link></Button> : null;
  }
}

function iconFor(alert: HomeAlert) {
  return { setup: alert.title === 'Alege pachetul' ? CreditCard : UserPlus, live: Video, today: CalendarClock, proposal: CalendarClock, review: Star, waiting: Clock, upcoming: CalendarClock, record: FileText }[alert.kind];
}

function DismissButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label="Închide" className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700', className)}>
      <X className="h-4 w-4" />
    </button>
  );
}

function PatientTile({ profile, canBook }: { profile: Profile; canBook: boolean }) {
  const progress = recordProgress(profile);
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  const expires = profile.active_until ? new Date(profile.active_until) : null;
  const soon = expires ? expires.getTime() - Date.now() < 30 * 86400000 : false;
  return (
    <div className="flex w-[200px] shrink-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 lg:w-auto">
      <Link to={`/patient/patients/${profile.id}`} className="flex items-start justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">{initialsOf(name)}</span>
        <Ring done={progress.done} total={progress.total} />
      </Link>
      <Link to={`/patient/patients/${profile.id}`} className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-slate-950">{name}</span>
        <span className="text-xs text-slate-500">{profile.birth_date ? `${patientAge(profile.birth_date)} · ` : ''}Fișa {progress.done}/{progress.total}</span>
        {expires && <span className={cn('text-xs', soon ? 'text-orange-700' : 'text-slate-500')}>{soon ? 'Pachetul expiră' : 'Activ'} până la {expires.toLocaleDateString('ro-RO', { timeZone: TZ })}</span>}
      </Link>
      {canBook && profile.can_request_consultation && (
        <Link to={`/patient/doctors?patient_profile=${profile.id}`} className="mt-auto flex h-[38px] items-center justify-center rounded-[10px] border border-slate-200 bg-white text-[13px] font-semibold text-slate-900 hover:bg-slate-50 lg:h-9">Programează</Link>
      )}
    </div>
  );
}

function Ring({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 18;
  const full = done >= total;
  return (
    <span className="relative h-11 w-11 shrink-0">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#E2E8F0" strokeWidth="4" />
        <circle cx="22" cy="22" r="18" fill="none" stroke={full ? '#16A34A' : '#2563EB'} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(done / total) * circumference} ${circumference}`} transform="rotate(-90 22 22)" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-slate-950">{done}/{total}</span>
    </span>
  );
}

function ConsultationRow({ request, first }: { request: PatientConsultation; first: boolean }) {
  const date = new Date(request.scheduled_at ?? request.created_at);
  const state = CONSULT_STATE[request.status] ?? { label: 'Anulată', className: 'bg-slate-100 text-slate-600' };
  return (
    <li className={cn(!first && 'border-t border-slate-100')}>
      <Link to={`/patient/chat?request=${request.id}`} className="flex items-center gap-3 px-3.5 py-3 hover:bg-slate-50 lg:gap-2.5 lg:px-4 lg:py-2.5">
        <span className="flex w-11 shrink-0 flex-col items-center lg:w-[38px]">
          <span className="text-[11px] capitalize text-slate-500 lg:text-[10px]">{date.toLocaleDateString('ro-RO', { weekday: 'short', timeZone: TZ }).replace('.', '')}</span>
          <span className="text-base font-bold text-slate-950 lg:text-[15px]">{date.toLocaleDateString('ro-RO', { day: 'numeric', timeZone: TZ })}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-slate-950 lg:text-[13px]">{request.doctor?.name ?? request.operator?.name ?? 'Consultație'}</span>
          <span className="truncate text-xs text-slate-500 lg:text-[11px]">{[request.consultation_kind === 'with_exam' ? 'Cu examinare' : 'Video', request.patient_profile?.name ? `pentru ${request.patient_profile.name.split(' ')[0]}` : null].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2 py-[3px] text-[11px] font-semibold lg:px-[7px] lg:py-0.5 lg:text-[10px]', state.className)}>{state.label}</span>
      </Link>
    </li>
  );
}

/** Evaluarea restantă blochează următoarea programare, așa că o cerem direct din rând sau din card. */
function InlineReview({ requestId, onDone, className, compact = false }: { requestId: string; onDone: () => void; className?: string; compact?: boolean }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rating || !comment.trim()) return;
    setSaving(true);
    try {
      await apiRequest(`/requests/${requestId}/review`, { method: 'POST', body: JSON.stringify({ rating, comment: comment.trim() }) });
      toast.success('Mulțumim! Consultația s-a închis și plata a ajuns la medic.');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva evaluarea.');
    } finally {
      setSaving(false);
    }
  };

  const stars: ReactNode = (
    <div className="flex" role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((value) => (
        <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} din 5`} onClick={() => setRating(value)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-orange-50">
          <Star className={cn('h-6 w-6', value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-2', compact && 'lg:shrink-0', className)}>
      {stars}
      {rating > 0 && <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Câteva cuvinte despre consultație" maxLength={2000} className="min-h-[64px] bg-white text-sm" required />}
      {rating > 0 && <p className="text-xs leading-5 text-slate-500">Trimiterea închide consultația: abia atunci plata rezervată ajunge la medic.</p>}
      {rating > 0 && <Button type="submit" size="sm" disabled={saving || !comment.trim()} className="self-start">{saving ? 'Se trimite…' : 'Trimite și închide consultația'}</Button>}
    </form>
  );
}

function initialsOf(name: string): string {
  return name.replace(/^dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function mdl(value: unknown): string {
  const numeric = Number(value) || 0;
  const text = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}
