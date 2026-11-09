import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, Check, CheckCircle2, CreditCard, Gift, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PatientBasicsFields, emptyPatientBasics, isPatientBasicsComplete, patientBasicsPayload, type CatalogRegion, type PatientBasics } from '../../components/patient/PatientBasicsFields';
import { WELCOME_BONUS_KEY } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';
import { bookingAfterOnboarding, clearNext, peekNext } from '../../lib/onboarding-next';

type CardPackage = { id: number; name: string; description?: string | null; profile_slots: number; price: number; validity_days: number; bonus_points?: number };
type CardPurchase = { id: number; profile_slots: number; used_slots: number; available_slots: number; expires_at: string };
type ProfileResponse = {
  user: { name: string };
  patient_profiles: Array<{ id: number; can_request_consultation?: boolean }>;
  card_packages: CardPackage[];
  card_purchases: CardPurchase[];
  onboarding?: { first_consultation_topup: number };
};
type WalletResponse = { wallet: { balance: number }; points_wallet?: { balance: number }; promo_wallet?: { balance: number } };
type CheckoutResponse = { mode: 'purchased' | 'redirect'; pay?: { payUrl?: string } };
type Step = 'package' | 'patient';
type PaymentResult = 'ok' | 'pending' | 'fail';

const CHECKOUT_KEY = 'onboarding_checkout';
const PENDING_RETRIES = 5;

/**
 * Asistentul de pornire: pachet → pacient → programare. Pachetul și, opțional,
 * suma pentru prima consultație se plătesc într-o singură plată; la întoarcerea
 * de la MAIB pachetul e deja activ și asistentul trece la pasul „Pacient”.
 */
export function StartWizardPage() {
  const navigate = useNavigate();
  const { isEnabled } = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [packageId, setPackageId] = useState<number | null>(() => savedCheckout()?.packageId ?? null);
  const [includeTopup, setIncludeTopup] = useState(() => savedCheckout()?.includeTopup ?? true);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(() => paymentParam(searchParams.get('payment')));
  const [pendingChecks, setPendingChecks] = useState(0);
  const [forMe, setForMe] = useState(true);
  const [patient, setPatient] = useState<PatientBasics>(emptyPatientBasics);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [welcomeBonus] = useState(() => readWelcomeBonus());

  // Anunțul de bun-venit apare o singură dată.
  useEffect(() => {
    try { sessionStorage.removeItem(WELCOME_BONUS_KEY); } catch { /* opțional */ }
  }, []);

  const load = useCallback(async () => {
    const [profile, walletResponse] = await Promise.all([
      apiRequest<ProfileResponse>('/patient/profile'),
      apiRequest<WalletResponse>('/wallet').catch(() => null)
    ]);
    setData(profile);
    setWallet(walletResponse);
    return profile;
  }, []);

  useEffect(() => {
    document.title = 'Pornire · telemedconsult.md';
  }, []);

  useEffect(() => {
    void load();
    apiRequest<{ data: CatalogRegion[] }>('/catalog/regions', { auth: false }).then((response) => setRegions(response.data ?? [])).catch(() => setRegions([]));
  }, [load]);

  const packagesRequired = isEnabled('patient_cards') && isEnabled('payments');
  const availableSlots = (data?.card_purchases ?? []).reduce((sum, item) => sum + item.available_slots, 0);
  const hasRequestablePatient = (data?.patient_profiles ?? []).some((profile) => profile.can_request_consultation);
  const step: Step = !packagesRequired || availableSlots > 0 ? 'patient' : 'package';

  // Contul care are deja un pacient nu mai are ce face aici: trece la programare.
  useEffect(() => {
    if (data && hasRequestablePatient && step === 'package') { const next = peekNext(); clearNext(); navigate(next ?? '/patient/doctors', { replace: true }); }
  }, [data, hasRequestablePatient, step, navigate]);

  // Întoarcerea de la MAIB cu „pending”: banca n-a confirmat încă, verificăm de câteva ori.
  useEffect(() => {
    if (paymentResult !== 'pending') return;
    if (availableSlots > 0) { setPaymentResult('ok'); return; }
    if (pendingChecks >= PENDING_RETRIES) return;
    const timer = window.setTimeout(() => { void load().finally(() => setPendingChecks((count) => count + 1)); }, 3000);
    return () => window.clearTimeout(timer);
  }, [paymentResult, pendingChecks, availableSlots, load]);

  useEffect(() => {
    if (!data || !forMe) return;
    const [first = '', ...rest] = (data.user.name || '').trim().split(/\s+/);
    setPatient((current) => ({ ...current, first_name: current.first_name || first, last_name: current.last_name || rest.join(' ') }));
  }, [data, forMe]);

  const packages = data?.card_packages ?? [];
  const selectedPackage = packages.find((item) => item.id === packageId) ?? packages[0];
  const topupAmount = data?.onboarding?.first_consultation_topup ?? 0;
  const willTopup = includeTopup && topupAmount > 0;
  const total = (selectedPackage?.price ?? 0) + (willTopup ? topupAmount : 0);
  const balance = wallet?.wallet.balance ?? 0;
  const paysFromBalance = !willTopup && selectedPackage ? balance >= selectedPackage.price : false;
  const bonusBalance = (wallet?.points_wallet?.balance ?? 0) + (wallet?.promo_wallet?.balance ?? 0);
  const activePurchase = [...(data?.card_purchases ?? [])].filter((item) => item.available_slots > 0).sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];

  const clearPaymentParam = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('payment');
    setSearchParams(next, { replace: true });
    setPaymentResult(null);
  };

  const pay = async () => {
    if (!selectedPackage) return;
    setError('');
    setBusy(true);
    try {
      try { sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ packageId: selectedPackage.id, includeTopup: willTopup })); } catch { /* opțional */ }
      const response = await apiRequest<CheckoutResponse>('/patient/card-purchases/checkout', {
        method: 'POST',
        body: JSON.stringify({ package_id: selectedPackage.id, include_topup: willTopup })
      });
      if (response.mode === 'redirect' && response.pay?.payUrl) {
        window.location.href = response.pay.payUrl;
        return;
      }
      clearPaymentParam();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut iniția plata.');
    } finally {
      setBusy(false);
    }
  };

  const savePatient = async (event: FormEvent) => {
    event.preventDefault();
    if (!isPatientBasicsComplete(patient)) { setError('Completează toate câmpurile.'); return; }
    setError('');
    setBusy(true);
    try {
      const response = await apiRequest<{ patient_profile: { id: number } }>('/patient/profiles', { method: 'POST', body: JSON.stringify(patientBasicsPayload(patient)) });
      try { sessionStorage.removeItem(CHECKOUT_KEY); } catch { /* opțional */ }
      navigate(bookingAfterOnboarding(response.patient_profile.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva pacientul.');
    } finally {
      setBusy(false);
    }
  };

  const chooseForMe = (value: boolean) => {
    setForMe(value);
    if (!value) setPatient((current) => ({ ...current, first_name: '', last_name: '' }));
  };

  return (
    <div className="min-h-dvh bg-[var(--app-background,#f6f8fb)]">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link to="/patient" className="flex items-center gap-2 font-semibold tracking-tight text-slate-950">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white"><Activity className="h-4 w-4" /></span>
            <span>telemedconsult<span className="text-primary">.md</span></span>
          </Link>
          <Button asChild variant="ghost" size="sm"><Link to="/patient">Termin mai târziu</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:py-10">
        <WizardSteps current={step} />

        {welcomeBonus > 0 && step === 'package' && !paymentResult && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <Gift className="h-5 w-5 shrink-0" />
            <p><span className="font-semibold">Ai primit {mdl(welcomeBonus)} MDL bonus.</span> Se scad automat din prima consultație.</p>
          </div>
        )}

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {!data ? <Skeleton className="h-80 w-full rounded-2xl" /> : step === 'package' ? (
          paymentResult === 'fail' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><XCircle className="h-6 w-6" /></span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">Plata nu a trecut</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Banca a refuzat tranzacția. De pe card nu s-a retras nimic. Verifică soldul cardului sau încearcă alt card.</p>
              {selectedPackage && (
                <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-600">{selectedPackage.name}{willTopup ? ` + ${mdl(topupAmount)} MDL în portofel` : ''}</span>
                  <span className="font-semibold text-slate-950">{mdl(total)} MDL</span>
                </div>
              )}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button className="h-11 flex-1" disabled={busy} onClick={() => void pay()}>{busy ? 'Se deschide plata…' : `Încearcă din nou · ${mdl(total)} MDL`}</Button>
                <Button variant="outline" className="h-11" onClick={clearPaymentParam}>Schimbă pachetul</Button>
              </div>
            </section>
          ) : paymentResult === 'pending' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <Loader2 className={cn('mx-auto h-8 w-8 text-primary', pendingChecks < PENDING_RETRIES && 'animate-spin')} />
              <h1 className="mt-4 text-xl font-bold text-slate-950">Banca confirmă plata</h1>
              <p className="mt-2 text-sm text-slate-600">Pagina se actualizează singură când banca răspunde. Nu plătești de două ori dacă o închizi.</p>
              {pendingChecks >= PENDING_RETRIES && <Button variant="outline" className="mt-4" onClick={() => setPendingChecks(0)}>Verifică din nou</Button>}
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Alege pachetul</h1>
              <p className="mt-1 text-sm text-slate-600">Un profil este o persoană din familie, cu fișa ei medicală, activ un an.</p>
              <div role="radiogroup" aria-label="Pachet" className="mt-5 grid gap-3 sm:grid-cols-3">
                {packages.map((item) => {
                  const selected = item.id === selectedPackage?.id;
                  return (
                    <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setPackageId(item.id)}
                      className={cn('flex flex-col rounded-xl border p-4 text-left transition', selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 bg-white hover:border-slate-300')}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-950">{item.name}</span>
                        {selected && <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check className="h-3 w-3" /></span>}
                      </span>
                      <span className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{mdl(item.price)} <span className="text-sm font-medium text-slate-500">MDL / an</span></span>
                      <span className="mt-1 text-xs text-slate-500">{item.profile_slots === 1 ? '1 profil' : `${item.profile_slots} profiluri`} · {mdl(item.price / item.profile_slots)} MDL de persoană</span>
                      {(item.bonus_points ?? 0) > 0 && <span className="mt-2 inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">+{mdl(item.bonus_points)} bonusuri</span>}
                    </button>
                  );
                })}
              </div>

              {topupAmount > 0 && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <Checkbox checked={includeTopup} onCheckedChange={(value) => setIncludeTopup(value === true)} className="mt-0.5" />
                  <span className="text-sm">
                    <span className="block font-semibold text-slate-900">Adaugă și {mdl(topupAmount)} MDL în portofel pentru prima consultație</span>
                    <span className="block text-slate-500">Banii rămân în portofel până îi folosești.</span>
                  </span>
                </label>
              )}

              <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  {paysFromBalance ? `Se plătește din portofel (sold ${mdl(balance)} MDL)` : `${selectedPackage?.name ?? 'Pachet'}${willTopup ? ` + ${mdl(topupAmount)} MDL` : ''} · plată securizată MAIB`}
                </p>
                <Button className="h-11 sm:min-w-56" disabled={busy || !selectedPackage} onClick={() => void pay()}>
                  <CreditCard className="h-4 w-4" />{busy ? 'Se deschide plata…' : `Plătește ${mdl(total)} MDL`}
                </Button>
              </div>
            </section>
          )
        ) : (
          <>
            {paymentResult === 'ok' && activePurchase && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 className="h-5 w-5" />Plata a reușit</p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <Fact label="Pachet" value={`${activePurchase.profile_slots === 1 ? '1 profil' : `${activePurchase.profile_slots} profiluri`}, activ până la ${new Date(activePurchase.expires_at).toLocaleDateString('ro-RO')}`} />
                  <Fact label="În portofel" value={`${mdl(balance)} MDL`} />
                  {bonusBalance > 0 && <Fact label="Bonus" value={`${mdl(bonusBalance)} MDL`} />}
                </dl>
              </section>
            )}
            <form onSubmit={savePatient} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Pentru cine e consultația?</h1>
              <div role="radiogroup" className="mt-4 grid grid-cols-2 gap-2">
                {[{ value: true, label: 'Pentru mine' }, { value: false, label: 'Pentru altcineva' }].map((option) => (
                  <button key={option.label} type="button" role="radio" aria-checked={forMe === option.value} onClick={() => chooseForMe(option.value)}
                    className={cn('h-11 rounded-xl border text-sm font-semibold transition', forMe === option.value ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-5"><PatientBasicsFields value={patient} onChange={setPatient} regions={regions} /></div>
              <p className="mt-4 text-xs text-slate-500">Adresa completă o ceri doar dacă alegi examinarea la domiciliu. Restul fișei îl completezi oricând.</p>
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <Button asChild type="button" variant="ghost"><Link to="/patient">Mai târziu</Link></Button>
                <Button type="submit" className="h-11 sm:min-w-56" disabled={busy || !isPatientBasicsComplete(patient)}>{busy ? 'Se salvează…' : 'Continuă la medici'}</Button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

function WizardSteps({ current }: { current: Step }) {
  const steps: Array<{ id: Step | 'booking'; label: string }> = [
    { id: 'package', label: 'Pachet' },
    { id: 'patient', label: 'Pacient' },
    { id: 'booking', label: 'Programare' }
  ];
  const currentIndex = steps.findIndex((item) => item.id === current);

  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Pașii de pornire">
      {steps.map((item, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={item.id} className="flex flex-1 items-center gap-2">
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold', done ? 'bg-emerald-600 text-white' : active ? 'bg-primary text-white' : 'bg-slate-200 text-slate-500')}>
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span className={cn('truncate font-medium', active ? 'text-slate-950' : 'text-slate-500')} aria-current={active ? 'step' : undefined}>{item.label}</span>
            {index < steps.length - 1 && <span className="hidden h-px flex-1 bg-slate-200 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <dt className="text-xs text-emerald-800">{label}</dt>
      <dd className="font-semibold text-emerald-950">{value}</dd>
    </div>
  );
}

function mdl(value: unknown): string {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function paymentParam(value: string | null): PaymentResult | null {
  return value === 'ok' || value === 'pending' || value === 'fail' ? value : null;
}

function savedCheckout(): { packageId: number; includeTopup: boolean } | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readWelcomeBonus(): number {
  try {
    return Number(sessionStorage.getItem(WELCOME_BONUS_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default StartWizardPage;
