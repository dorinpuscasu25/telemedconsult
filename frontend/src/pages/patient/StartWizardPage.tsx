import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Check, Loader2, Lock, X } from 'lucide-react';
import { Skeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PatientBasicsFields, emptyPatientBasics, isPatientBasicsComplete, patientBasicsPayload, type CatalogRegion, type PatientBasics } from '../../components/patient/PatientBasicsFields';
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

  const perProfile = (item: CardPackage) => item.profile_slots === 1 ? 'Doar pentru tine' : `${mdl(item.price / item.profile_slots)} MDL / profil${item.profile_slots >= 4 ? ' · pentru familie' : ''}`;
  const totalNote = selectedPackage ? `${selectedPackage.name} ${mdl(selectedPackage.price)}${willTopup ? ` + portofel ${mdl(topupAmount)}` : ''} MDL` : '';
  const payNote = paysFromBalance ? `Se plătește din portofel · sold ${mdl(balance)} MDL` : `${totalNote} · plată securizată MAIB`;
  const showPaymentOk = step === 'patient' && paymentResult === 'ok' && Boolean(activePurchase);
  const stepIndex = step === 'package' ? 0 : 1;
  const later = '/patient';

  return (
    <div className="min-h-dvh bg-white lg:bg-slate-50">
      {/* Telefon: logo (sau înapoi) + „Mai târziu”, apoi pașii. Desktop: o bară de 68 px cu pașii la mijloc. */}
      <header className="border-b border-slate-100 bg-white px-5 pb-4 pt-[calc(16px+env(safe-area-inset-top))] lg:border-slate-200 lg:px-8 lg:py-0">
        <div className="flex flex-col gap-[18px] lg:h-[68px] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between">
            {step === 'patient' && !showPaymentOk
              ? <Link to={later} aria-label="Înapoi" className="-ml-2 grid h-9 w-9 place-items-center text-slate-700 lg:hidden"><ArrowLeft className="h-5 w-5" /></Link>
              : <span className="lg:hidden"><Logo /></span>}
            <span className="hidden lg:block"><Logo large /></span>
            <Link to={later} className="text-sm text-slate-500 hover:text-slate-800 lg:hidden">Mai târziu</Link>
          </div>
          <Steps index={stepIndex} />
          <Link to={later} className="hidden text-sm text-slate-500 hover:text-slate-800 lg:block">Termin mai târziu</Link>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-110px)] w-full max-w-[760px] flex-col px-5 pb-8 pt-6 lg:min-h-0 lg:px-0 lg:pt-14">
        {error && <div role="alert" className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {!data ? <Skeleton className="h-80 w-full rounded-2xl" /> : step === 'package' ? (
          paymentResult === 'fail' ? (
            /* 3c */
            <ResultScreen tone="fail" title="Plata nu a trecut" text="Banca a refuzat tranzacția. De pe card nu s-a retras nimic. Verifică soldul cardului sau încearcă alt card.">
              {selectedPackage && (
                <div className="flex justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-sm">
                  <span className="text-slate-500">{selectedPackage.name}{willTopup ? ` + ${mdl(topupAmount)} MDL în portofel` : ''}</span>
                  <span className="font-semibold text-slate-950">{mdl(total)} MDL</span>
                </div>
              )}
              <div className="mt-auto flex flex-col gap-2.5 pt-6 lg:mt-2 lg:flex-row-reverse lg:justify-start">
                <button type="button" disabled={busy} onClick={() => void pay()} className="h-12 rounded-[10px] bg-blue-600 px-6 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Se deschide plata…' : `Încearcă din nou · ${mdl(total)} MDL`}</button>
                <button type="button" onClick={clearPaymentParam} className="h-12 rounded-[10px] border border-slate-200 bg-white px-6 text-[15px] font-medium text-slate-950 hover:bg-slate-50">Schimbă pachetul</button>
              </div>
            </ResultScreen>
          ) : paymentResult === 'pending' ? (
            <ResultScreen tone="pending" title="Banca confirmă plata" text="Pagina se actualizează singură când banca răspunde. Nu plătești de două ori dacă o închizi.">
              {pendingChecks >= PENDING_RETRIES && <button type="button" onClick={() => setPendingChecks(0)} className="h-12 rounded-[10px] border border-slate-200 bg-white text-[15px] font-medium text-slate-950 lg:w-fit lg:px-6">Verifică din nou</button>}
            </ResultScreen>
          ) : (
            /* 3a / 3d */
            <section className="flex flex-1 flex-col gap-5 lg:gap-7">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold leading-[1.2] tracking-tight text-slate-950 lg:text-[30px]">Alege pachetul</h1>
                <p className="text-sm leading-[1.5] text-slate-500 lg:text-[15px]">Un profil este o persoană din familie, cu fișa ei medicală, activ un an.</p>
              </div>
              <div role="radiogroup" aria-label="Pachet" className="flex flex-col gap-2.5 lg:grid lg:grid-cols-3 lg:gap-3.5">
                {packages.map((item) => {
                  const selected = item.id === selectedPackage?.id;
                  const radio = <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px]', selected ? 'border-blue-600' : 'border-slate-300')}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</span>;
                  return (
                    <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setPackageId(item.id)}
                      className={cn('flex items-center gap-3.5 rounded-2xl p-4 text-left lg:flex-col lg:items-stretch lg:gap-[18px] lg:p-5', selected ? 'border-[1.5px] border-blue-600 bg-blue-50' : 'border border-slate-200 bg-white hover:border-slate-300')}>
                      <span className="lg:hidden">{radio}</span>
                      <span className="flex flex-1 flex-col gap-0.5 lg:hidden"><span className="text-base font-semibold text-slate-950">{item.name}</span><span className="text-[13px] text-slate-500">{perProfile(item)}</span></span>
                      <span className="text-lg font-bold tracking-tight text-slate-950 lg:hidden">{mdl(item.price)} <span className="text-xs font-medium text-slate-500">MDL</span></span>
                      <span className="hidden items-center justify-between lg:flex"><span className="text-base font-semibold text-slate-950">{item.name}</span>{radio}</span>
                      <span className="hidden flex-col gap-1 lg:flex">
                        <span className="text-[30px] font-bold tracking-tight text-slate-950">{mdl(item.price)} <span className="text-sm font-medium text-slate-500">MDL / an</span></span>
                        <span className="min-h-[18px] text-[13px] text-slate-500">{perProfile(item)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {topupAmount > 0 && (
                <button type="button" role="checkbox" aria-checked={includeTopup} onClick={() => setIncludeTopup((value) => !value)} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 text-left lg:border lg:border-slate-200 lg:bg-white lg:px-[18px] lg:py-4">
                  <span className={cn('mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border-[1.5px] text-white', includeTopup ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white')}>{includeTopup && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium leading-[1.4] text-slate-950 lg:text-[15px]">Adaugă și {mdl(topupAmount)} MDL în portofel pentru prima consultație</span>
                    <span className="text-[13px] leading-[1.4] text-slate-500">Banii rămân în portofel până îi folosești.</span>
                  </span>
                </button>
              )}

              <div className="mt-auto flex flex-col gap-2.5 lg:mt-0 lg:flex-row-reverse lg:items-center lg:justify-between lg:pt-1">
                <button type="button" disabled={busy || !selectedPackage} onClick={() => void pay()} className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-6 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  <Lock className="h-4 w-4" />{busy ? 'Se deschide plata…' : `Plătește ${mdl(total)} MDL`}
                </button>
                <span className="text-center text-xs text-slate-500 lg:text-sm">{payNote}</span>
              </div>
            </section>
          )
        ) : showPaymentOk && activePurchase ? (
          /* 3b */
          <ResultScreen tone="ok" title="Plata a reușit" text="Acum adaugă persoana pentru care faci programarea.">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
              <div className="flex justify-between gap-3 border-b border-slate-100 px-4 py-3.5"><span className="text-slate-500">Pachet {activePurchase.profile_slots === 1 ? '1 profil' : `${activePurchase.profile_slots} profiluri`}</span><span className="font-medium text-slate-950">activ până la {new Date(activePurchase.expires_at).toLocaleDateString('ro-RO')}</span></div>
              <div className={cn('flex justify-between gap-3 px-4 py-3.5', bonusBalance > 0 && 'border-b border-slate-100')}><span className="text-slate-500">În portofel</span><span className="font-medium text-slate-950">{mdl(balance)} MDL</span></div>
              {bonusBalance > 0 && <div className="flex justify-between gap-3 px-4 py-3.5"><span className="text-slate-500">Bonus</span><span className="font-medium text-slate-950">{mdl(bonusBalance)} MDL</span></div>}
            </div>
            <button type="button" onClick={clearPaymentParam} className="mt-auto h-12 rounded-[10px] bg-blue-600 px-6 text-[15px] font-semibold text-white hover:bg-blue-700 lg:mt-2 lg:w-fit">Continuă: adaugă pacientul</button>
          </ResultScreen>
        ) : (
          /* 4a / 4b */
          <form onSubmit={savePatient} className="flex flex-col gap-[22px] lg:gap-6">
            <h1 className="text-2xl font-bold leading-[1.2] tracking-tight text-slate-950 lg:text-[30px]">Pentru cine e consultația?</h1>
            <div className="flex flex-col gap-[22px] lg:gap-5 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-6">
              <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 lg:w-[360px]">
                {[{ value: true, label: 'Pentru mine' }, { value: false, label: 'Pentru altcineva' }].map((option) => (
                  <button key={option.label} type="button" role="radio" aria-checked={forMe === option.value} onClick={() => chooseForMe(option.value)}
                    className={cn('h-10 rounded-[9px] text-sm font-medium lg:h-[38px]', forMe === option.value ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>
                    {option.label}
                  </button>
                ))}
              </div>
              <PatientBasicsFields value={patient} onChange={setPatient} regions={regions} />
            </div>
            <div className="mt-1 flex flex-col gap-3 lg:mt-0 lg:flex-row lg:items-center lg:justify-between">
              <Link to={later} className="hidden h-11 items-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 hover:bg-slate-50 lg:flex">Înapoi</Link>
              <button type="submit" disabled={busy || !isPatientBasicsComplete(patient)} className="h-12 rounded-[10px] bg-blue-600 px-6 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Se salvează…' : 'Continuă la medici'}</button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function Logo({ large = false }: { large?: boolean }) {
  return (
    <Link to="/patient" className="flex items-center gap-2 lg:gap-2.5">
      <span className={cn('grid place-items-center bg-blue-600 text-white', large ? 'h-8 w-8 rounded-[9px]' : 'h-7 w-7 rounded-lg')}><Activity className={large ? 'h-[18px] w-[18px]' : 'h-4 w-4'} /></span>
      <span className={cn('font-bold text-slate-950', large ? 'text-[15px]' : 'text-sm')}>telemedconsult<span className="text-blue-600">.md</span></span>
    </Link>
  );
}

/** Pașii: Pachet → Pacient → Programare. Segmente de 4 px; făcut și curent albastru. */
function Steps({ index }: { index: number }) {
  const labels = ['Pachet', 'Pacient', 'Programare'];
  return (
    <ol className="grid grid-cols-3 gap-1.5 lg:flex lg:w-[420px] lg:gap-2.5" aria-label="Pașii de pornire">
      {labels.map((label, position) => {
        const done = position < index;
        const on = position <= index;
        return (
          <li key={label} className="flex flex-col gap-1.5 lg:flex-1" aria-current={position === index ? 'step' : undefined}>
            <span className={cn('h-1 rounded-sm', on ? 'bg-blue-600' : 'bg-slate-200')} />
            <span className={cn('flex items-center gap-1 text-xs', on ? 'font-semibold text-blue-600' : 'font-medium text-slate-400')}>
              {done && <Check className="h-3 w-3 lg:hidden" strokeWidth={3} />}
              <span className="lg:hidden">{label}</span>
              <span className="hidden lg:inline">{done ? `✓ ${label}` : `${position + 1} · ${label}`}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 3b / 3c: întoarcerea de la plată. */
function ResultScreen({ tone, title, text, children }: { tone: 'ok' | 'fail' | 'pending'; title: string; text: string; children?: ReactNode }) {
  return (
    <section className="flex flex-1 flex-col gap-6 pt-4 lg:pt-0">
      <span className={cn('grid h-14 w-14 place-items-center rounded-full', tone === 'ok' ? 'bg-green-50 text-green-600' : tone === 'fail' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600')}>
        {tone === 'ok' ? <Check className="h-7 w-7" /> : tone === 'fail' ? <X className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-[1.2] tracking-tight text-slate-950 lg:text-[30px]">{title}</h1>
        <p className="text-[15px] leading-[1.5] text-slate-500">{text}</p>
      </div>
      {children}
    </section>
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


export default StartWizardPage;
