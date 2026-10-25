import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Activity, ArrowRight, CalendarClock, ChevronRight, Clock, Gift, Home, MessageSquare, Plus, Stethoscope, UserPlus, Users, Video, Wallet } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ListSkeleton, Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { StatusBadge } from '../../components/app/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import { consultationTitle, type PatientConsultation } from '../../lib/patient-consultations';

interface WalletData {
  points_wallet?: { balance: number; currency: string };
  wallet: { balance: number; currency: string };
}

interface PatientProfile {
  id: number;
  first_name?: string | null;
  can_request_consultation?: boolean;
}

const ACTIVE = ['new', 'accepted', 'rescheduled'];
const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);

type Hero = {
  tone: 'blue' | 'amber' | 'orange' | 'green' | 'slate';
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  description: string;
  request?: PatientConsultation;
};

/**
 * Prima pagină a pacientului spune un singur lucru clar: ce urmează. Cardul de
 * sus se schimbă după situație (fără pacient activ, cerere în așteptare, oră
 * nouă propusă, consultație azi), iar dedesubt stau cele două tipuri de servicii.
 */
export function PatientHome() {
  const { user } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [requests, setRequests] = useState<PatientConsultation[]>([]);
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  const doctorsEnabled = isEnabled('doctors');
  const operatorsEnabled = isEnabled('operators');
  const paymentsEnabled = isEnabled('payments');
  const affiliateEnabled = isEnabled('affiliate_program');

  const load = useCallback(async () => {
    const [walletResponse, profileResponse, requestsResponse] = await Promise.allSettled([
      apiRequest<WalletData>('/wallet'),
      apiRequest<{ patient_profiles: PatientProfile[] }>('/patient/profile'),
      apiRequest<{ data: PatientConsultation[] }>('/requests')
    ]);
    if (walletResponse.status === 'fulfilled') setWallet(walletResponse.value);
    if (profileResponse.status === 'fulfilled') setProfiles(profileResponse.value.patient_profiles ?? []);
    if (requestsResponse.status === 'fulfilled') setRequests(requestsResponse.value.data ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => requests.filter((request) => ACTIVE.includes(request.status)), [requests]);
  const hasRequestablePatient = profiles.some((profile) => profile.can_request_consultation);

  const hero: Hero = useMemo(() => {
    const rescheduled = active.find((request) => request.status === 'rescheduled');
    const live = active.find((request) => request.status === 'accepted' && request.doctor_started_at);
    const upcoming = active
      .filter((request) => request.status === 'accepted' && !request.doctor_started_at)
      .sort((a, b) => (time(a.scheduled_at) || Number.MAX_SAFE_INTEGER) - (time(b.scheduled_at) || Number.MAX_SAFE_INTEGER))[0];
    const waiting = active.find((request) => request.status === 'new');

    if (live) return { tone: 'green', icon: Video, eyebrow: 'Acum', title: 'Consultația a început', description: `${consultationTitle(live)}${live.doctor?.name ? ` cu ${live.doctor.name}` : ''}. Intră în apel sau scrie-i medicului.`, request: live };
    if (rescheduled) return { tone: 'orange', icon: CalendarClock, eyebrow: 'Ai de răspuns', title: 'Ți s-a propus o oră nouă', description: `${rescheduled.doctor?.name ?? 'Medicul'} propune ${dateTime(rescheduled.proposed_scheduled_at)} pentru ${rescheduled.patient_profile?.name ?? 'consultație'}.`, request: rescheduled };
    if (upcoming) return { tone: 'blue', icon: CalendarClock, eyebrow: 'Următoarea consultație', title: upcoming.scheduled_at ? dateTime(upcoming.scheduled_at) : 'Confirmată', description: `${consultationTitle(upcoming)}${upcoming.doctor?.name ? ` cu ${upcoming.doctor.name}` : ''}${upcoming.patient_profile?.name ? `, pentru ${upcoming.patient_profile.name}` : ''}. Medicul deschide consultația la ora stabilită.`, request: upcoming };
    if (waiting) return { tone: 'amber', icon: Clock, eyebrow: 'În așteptare', title: 'Așteptăm confirmarea', description: `${waiting.type === 'operator' ? 'Un operator' : waiting.doctor?.name ?? 'Medicul'} trebuie să confirme cererea${waiting.scheduled_at ? ` pentru ${dateTime(waiting.scheduled_at)}` : ''}. Te anunțăm imediat.`, request: waiting };
    if (!hasRequestablePatient) return { tone: 'slate', icon: UserPlus, eyebrow: 'Primul pas', title: 'Adaugă pacientul', description: 'Consultațiile se fac pentru un profil de pacient: tu sau un membru al familiei. Adaugă-l o singură dată și îl folosești la fiecare cerere.' };
    return { tone: 'slate', icon: Stethoscope, eyebrow: 'Totul e în regulă', title: 'Nicio consultație programată', description: 'Când ai nevoie, alege un medic pentru o consultație online sau cere o examinare la domiciliu.' };
  }, [active, hasRequestablePatient]);

  const acceptProposal = async (request: PatientConsultation) => {
    setAccepting(true);
    try {
      await apiRequest(`/requests/${request.id}/accept-proposed-time`, { method: 'POST' });
      toast.success('Ora propusă a fost acceptată.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut accepta ora propusă.');
    } finally {
      setAccepting(false);
    }
  };

  const firstName = user?.name?.split(' ')[0] ?? '';
  const heroTones: Record<Hero['tone'], string> = {
    blue: 'border-blue-200 bg-gradient-to-br from-blue-50 to-white',
    amber: 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
    orange: 'border-orange-200 bg-gradient-to-br from-orange-50 to-white',
    green: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white',
    slate: 'border-slate-200 bg-white'
  };
  const heroIconTones: Record<Hero['tone'], string> = {
    blue: 'bg-blue-600 text-white',
    amber: 'bg-amber-500 text-white',
    orange: 'bg-orange-500 text-white',
    green: 'bg-emerald-600 text-white',
    slate: 'bg-primary/10 text-primary'
  };

  return (
    <div className="space-y-6">
      <PageHeader title={`Bună, ${firstName}`} documentTitle="Acasă" description="Consultațiile, mesajele și pacienții tăi — într-un singur loc." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* Ce urmează */}
          {isLoading ? <Skeleton className="h-48 w-full rounded-2xl" /> : (
            <section className={cn('rounded-2xl border p-5 shadow-sm sm:p-6', heroTones[hero.tone])}>
              <div className="flex items-start gap-4">
                <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', heroIconTones[hero.tone])}><hero.icon className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-500">{hero.eyebrow}</p>
                  <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{hero.title}</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{hero.description}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 sm:pl-16">
                {hero.request?.status === 'rescheduled' && <Button onClick={() => { if (hero.request) void acceptProposal(hero.request); }} disabled={accepting}>{accepting ? 'Se confirmă…' : 'Acceptă ora propusă'}</Button>}
                {hero.request?.status === 'accepted' && hero.request.doctor_started_at && <Button asChild><Link to={`/consultations/${hero.request.id}/video`}><Video className="h-4 w-4" />Intră în apel</Link></Button>}
                {hero.request && <Button asChild variant="outline" className="bg-white"><Link to={`/patient/chat?request=${hero.request.id}`}><MessageSquare className="h-4 w-4" />Mesaje</Link></Button>}
                {hero.request && <Button asChild variant="ghost"><Link to="/patient/consultations">Detalii<ArrowRight className="h-4 w-4" /></Link></Button>}
                {!hero.request && !hasRequestablePatient && <Button asChild><Link to="/patient/profile"><UserPlus className="h-4 w-4" />Adaugă pacientul</Link></Button>}
                {!hero.request && hasRequestablePatient && doctorsEnabled && <Button asChild><Link to="/patient/doctors"><Plus className="h-4 w-4" />Programează o consultație</Link></Button>}
              </div>
            </section>
          )}

          {/* Servicii */}
          {(doctorsEnabled || operatorsEnabled) && (
            <section className="grid gap-3 sm:grid-cols-2">
              {doctorsEnabled && (
                <ServiceCard
                  to={hasRequestablePatient ? '/patient/doctors' : '/patient/profile'}
                  icon={Stethoscope}
                  title="Consultație cu un medic"
                  description="Alege specialistul, descrie simptomele și programează ora. Video sau cu examinare acasă."
                />
              )}
              {operatorsEnabled && (
                <ServiceCard
                  to={hasRequestablePatient ? '/patient/operators' : '/patient/profile'}
                  icon={Home}
                  title="Examinare la domiciliu"
                  description="Un operator vine la pacient, face măsurătorile, iar rezultatele ajung la medic."
                />
              )}
            </section>
          )}

          {/* În curs */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader title="Consultații în curs" actions={<Link to="/patient/consultations" className="text-sm font-semibold text-primary hover:underline">Toate</Link>} />
            <div className="mt-4">
              {isLoading ? <ListSkeleton rows={2} /> : active.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nu ai consultații în curs. Istoricul complet este în „Consultații”.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {active.slice(0, 4).map((request) => (
                    <li key={request.id}>
                      <Link to={`/patient/chat?request=${request.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-slate-50">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{request.type === 'operator' ? <Activity className="h-5 w-5" /> : <Stethoscope className="h-5 w-5" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold text-slate-900">{consultationTitle(request)}</span>
                            <StatusBadge request={request} perspective="patient" />
                          </span>
                          <span className="block truncate text-sm text-slate-500">{[request.patient_profile?.name, request.doctor?.name, request.scheduled_at && dateTime(request.scheduled_at)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {paymentsEnabled && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><Wallet className="h-4 w-4" />Portofel</p>
                <Link to="/patient/wallet" className="text-sm font-semibold text-primary hover:underline">Detalii</Link>
              </div>
              {isLoading ? <Skeleton className="mt-3 h-8 w-32" /> : <p className="tabular mt-2 text-3xl font-bold tracking-tight text-slate-950">{money(wallet?.wallet.balance)} <span className="text-base font-medium text-slate-500">{wallet?.wallet.currency ?? 'MDL'}</span></p>}
              {(wallet?.points_wallet?.balance ?? 0) > 0 && <p className="mt-1 text-sm text-amber-700">+ {money(wallet?.points_wallet?.balance)} MDL bonusuri</p>}
              <Button asChild variant="outline" className="mt-4 w-full"><Link to="/patient/wallet?topup=1"><Plus className="h-4 w-4" />Alimentează</Link></Button>
            </section>
          )}

          <Link to="/patient/profile" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/30">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Users className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">Pacienții mei</span>
              <span className="block text-sm text-slate-500">{isLoading ? '…' : profiles.length === 0 ? 'Niciun pacient adăugat' : `${profiles.length} ${profiles.length === 1 ? 'profil' : 'profiluri'}${profiles[0]?.first_name ? `: ${profiles.slice(0, 3).map((profile) => profile.first_name).filter(Boolean).join(', ')}` : ''}`}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
          </Link>

          {affiliateEnabled && (
            <Link to="/patient/profile?tab=referrals" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/30">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Gift className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">Invită și câștigă</span>
                <span className="block text-sm text-slate-500">Primești bonus când persoanele invitate alimentează contul.</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function ServiceCard({ to, icon: Icon, title, description }: { to: string; icon: React.ElementType; title: string; description: string }) {
  return (
    <Link to={to} className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="mt-4 text-base font-semibold text-slate-950">{title}</span>
      <span className="mt-1 text-sm leading-6 text-slate-500">{description}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Începe<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}
