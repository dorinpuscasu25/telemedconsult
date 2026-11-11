import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, LockKeyhole, Plus, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/format';
import { MEDICAL_SECTIONS } from '../../lib/medical-record';
import { recordProgress, sectionTitle } from '../../lib/patient-alerts';
import { cn } from '../../components/ui/utils';
import { PatientBasicsFields, isPatientBasicsComplete } from '../../components/patient/PatientBasicsFields';
import { patientAge } from '../../lib/medical-record';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { PageHeader } from '../../components/app/PageHeader';
import { ReferralPanel, type ReferralResponse } from '../../components/ReferralPanel';

type PatientProfile = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  patient_code?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  country?: string | null;
  region?: string | null;
  region_id?: number | null;
  locality?: string | null;
  locality_id?: number | null;
  address?: string | null;
  medical_summary?: string | null;
  life_history?: Array<{ category: string; note: string; added_at: string }>;
  status?: string | null;
  active_until?: string | null;
  can_request_consultation?: boolean;
  request_unavailable_reason?: string | null;
  has_complete_address?: boolean;
  needs_data?: boolean;
  medical_record?: Record<string, unknown> | null;
  investigations?: Array<{ id: number; title: string; type: string; notes?: string | null; created_at: string }>;
};

type CatalogLocality = { id: number; name: string; type: string };
type CatalogRegion = { id: number; name: string; type: string; country: string; localities: CatalogLocality[] };

type CardPackage = {
  id: number;
  name: string;
  description?: string | null;
  profile_slots: number;
  price: number;
  validity_days: number;
  bonus_points?: number;
};

type CardPurchase = {
  id: number;
  profile_slots: number;
  used_slots: number;
  available_slots: number;
  expires_at: string;
  amount: number;
};

type ProfileResponse = {
  user: { id: string; name: string; email: string; phone?: string | null; telegram_chat_id?: string | null };
  patient_profiles: PatientProfile[];
  card_packages: CardPackage[];
  card_purchases: CardPurchase[];
};


type ProfileTab = 'patients' | 'cards' | 'referrals' | 'account';

const emptyPatient = {
  first_name: '',
  last_name: '',
  birth_date: '',
  gender: '',
  residential_environment: '',
  country: 'Republica Moldova',
  region_id: '',
  locality_id: '',
  address: '',
  emergency_contact: '',
  medical_summary: ''
};

/** Linkurile vechi spre fișa unui pacient (?patient_profile=…&section=…) deschid pagina pacientului. */
export function ProfilePage() {
  const [searchParams] = useSearchParams();
  const legacyProfile = searchParams.get('patient_profile');
  if (legacyProfile) {
    return <Navigate to={patientPageLink(legacyProfile, searchParams.get('section'), searchParams.get('request'))} replace />;
  }
  return <ProfilePageContent />;
}

function ProfilePageContent() {
  const navigate = useNavigate();
  const { isEnabled } = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [referralData, setReferralData] = useState<ReferralResponse | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', phone: '' });
  const [patientForm, setPatientForm] = useState(emptyPatient);
  const [regionsCatalog, setRegionsCatalog] = useState<CatalogRegion[]>([]);
  const [isPatientOpen, setIsPatientOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => profileTab(searchParams.get('tab')));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [walletTopUpAmount, setWalletTopUpAmount] = useState<number | null>(null);

  const loadProfile = () => {
    apiRequest<ProfileResponse>('/patient/profile').then((response) => {
      setData(response);
      setAccountForm({
        name: response.user.name || '',
        phone: response.user.phone || ''
      });
    });
  };

  const loadReferral = () => {
    apiRequest<ReferralResponse>('/patient/referrals')
      .then(setReferralData)
      .catch(() => setReferralData(null));
  };

  useEffect(() => {
    loadProfile();
    loadReferral();
    apiRequest<{ data: CatalogRegion[] }>('/catalog/regions', { auth: false })
      .then((response) => setRegionsCatalog(response.data ?? []))
      .catch(() => setRegionsCatalog([]));
  }, []);

  useEffect(() => {
    const requestedTab = profileTab(searchParams.get('tab'));
    const permittedTab = requestedTab === 'referrals' && !isEnabled('affiliate_program')
      ? 'patients'
      : requestedTab === 'cards' && (!isEnabled('patient_cards') || !isEnabled('payments'))
        ? 'patients'
        : requestedTab;

    setActiveTab(permittedTab);
    if (permittedTab !== requestedTab) setSearchParams({}, { replace: true });
  }, [isEnabled, searchParams, setSearchParams]);

  const changeTab = (tab: string) => {
    const requestedTab = profileTab(tab);
    const nextTab = requestedTab === 'referrals' && !isEnabled('affiliate_program')
      ? 'patients'
      : requestedTab === 'cards' && (!isEnabled('patient_cards') || !isEnabled('payments'))
        ? 'patients'
        : requestedTab;
    const nextParams = new URLSearchParams(searchParams);

    setActiveTab(nextTab);

    if (nextTab === 'patients') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', nextTab);
    }

    setSearchParams(nextParams, { replace: true });
  };


  const notify = (text: string) => {
    setMessage(text);
    setError('');
    setWalletTopUpAmount(null);
  };

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setMessage('');
    setWalletTopUpAmount(null);
  };

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiRequest('/patient/profile', {
        method: 'PUT',
        body: JSON.stringify(accountForm)
      });
      notify('Cont salvat.');
      loadProfile();
    } catch (err) {
      fail(err, 'Nu am putut salva contul.');
    }
  };

  const buyPackage = async (pack: CardPackage) => {
    try {
      await apiRequest('/patient/card-purchases', {
        method: 'POST',
        body: JSON.stringify({ package_id: pack.id })
      });
      notify('Pachet activ. Acum adaugă pacientul.');
      loadProfile();
      changeTab('patients');
      setIsPatientOpen(true);
    } catch (err) {
      const data = apiErrorData(err);
      if (data?.code === 'insufficient_wallet_balance') {
        setError(typeof data.message === 'string' ? data.message : 'Balanță insuficientă pentru cartelă.');
        setMessage('');
        setWalletTopUpAmount(Number(data.missing_amount || data.required_amount || pack.price));
        return;
      }

      fail(err, 'Nu am putut cumpăra cartela.');
    }
  };

  const savePatient = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = await apiRequest<{ patient_profile: PatientProfile }>('/patient/profiles', {
        method: 'POST',
        body: JSON.stringify({
          ...patientForm,
          address: patientForm.address || null,
          gender: patientForm.gender || null,
          residential_environment: patientForm.residential_environment || null,
          region_id: patientForm.region_id ? Number(patientForm.region_id) : null,
          locality_id: patientForm.locality_id ? Number(patientForm.locality_id) : null
        })
      });
      setIsPatientOpen(false);
      setPatientForm(emptyPatient);
      if (isEnabled('doctors')) {
        navigate(`/patient/doctors?patient_profile=${created.patient_profile.id}`);
        return;
      }
      notify('Profil pacient creat.');
      loadProfile();
    } catch (err) {
      if (apiErrorData(err)?.code === 'package_required') {
        setIsPatientOpen(false);
        changeTab('cards');
      }
      fail(err, 'Nu am putut crea profilul.');
    }
  };




  const profiles = data?.patient_profiles ?? [];
  const packages = data?.card_packages ?? [];
  const purchases = data?.card_purchases ?? [];
  const availableSlots = purchases.reduce((sum, item) => sum + item.available_slots, 0);
  const activeCardPurchases = purchases.filter((item) => new Date(item.expires_at).getTime() > Date.now());
  const totalSlots = activeCardPurchases.reduce((sum, item) => sum + item.profile_slots, 0);
  const activePurchase = [...activeCardPurchases].sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0];
  const hasRequestablePatient = profiles.some((profile) => profile.can_request_consultation);
  // Pachetul e obligatoriu cât timp cartelele și plățile sunt pornite; altfel pacienții se adaugă liber.
  const canBuyPatientPackages = isEnabled('patient_cards') && isEnabled('payments');
  const canAddPatient = !canBuyPatientPackages || availableSlots > 0;
  const patientNextStep = !canAddPatient && profiles.length === 0
    ? {
        step: 'Primul pas',
        title: 'Alege un pachet ca să adaugi pacienți',
        description: 'Un profil este o persoană din familie, cu fișa ei medicală, activ un an. După plată adaugi pacientul și alegi medicul.',
        action: 'Alege pachetul',
        onClick: () => changeTab('cards')
      }
    : profiles.length === 0
      ? {
          step: 'Pasul următor',
          title: 'Adaugă primul pacient',
          description: 'Completează datele persoanei care va beneficia de consultații sau examinări.',
          action: 'Adaugă pacient',
          onClick: () => setIsPatientOpen(true)
        }
      : {
          step: 'Verificare necesară',
          title: 'Finalizează datele pacientului',
          description: 'Selectează pacientul și verifică informațiile necesare pentru activarea serviciilor medicale.',
          action: 'Verifică pacientul',
          onClick: () => document.getElementById('patient-profiles')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        };
  const pageHeading = {
    patients: {
      title: 'Pacienții mei',
      description: 'Adaugă și gestionează persoanele pentru care soliciți servicii medicale.'
    },
    cards: {
      title: 'Pachete pentru pacienți',
      description: 'Alege pachetul potrivit pentru a activa unul sau mai multe profiluri de pacient.'
    },
    referrals: {
      title: 'Program de afiliere',
      description: referralData
        ? `Primești ${referralData.commission_rate}% din ${referralData.first_deposit_only ? 'prima sumă alimentată' : 'fiecare sumă alimentată'} de persoanele pe care le inviți.`
        : 'Invită persoane pe platformă și urmărește comisioanele primite.'
    },
    account: {
      title: 'Datele contului',
      description: 'Actualizează numele și datele tale de contact.'
    }
  }[activeTab];

  useEffect(() => {
    if (activeTab === 'patients') document.title = 'Pacienții mei · telemedconsult.md';
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {activeTab === 'patients' ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] font-bold tracking-tight text-slate-950 lg:text-[28px]">Pacienții mei</h1>
            {canBuyPatientPackages && activePurchase && <span className="text-sm text-slate-500">Pachet {activePurchase.profile_slots === 1 ? '1 profil' : `${activePurchase.profile_slots} profiluri`} · activ până la {new Date(activePurchase.expires_at).toLocaleDateString('ro-RO')}</span>}
          </div>
          {canBuyPatientPackages && canAddPatient && <button type="button" onClick={() => changeTab('cards')} className="text-sm font-medium text-blue-600 hover:underline">Cumpără pachet</button>}
        </div>
      ) : <PageHeader title={pageHeading.title} description={pageHeading.description} />}

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error || message}</span>
            {walletTopUpAmount !== null && (
              <Button variant="outline" className="rounded-xl bg-white" onClick={() => navigate(`/patient/wallet?topup=${Math.max(10, Math.ceil(walletTopUpAmount))}`)}>
                Alimentează portofelul
              </Button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'patients' && data && !hasRequestablePatient && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{patientNextStep.step}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{patientNextStep.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{patientNextStep.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Button onClick={patientNextStep.onClick}>
                {canAddPatient ? <Plus className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {patientNextStep.action}
              </Button>
            </div>
          </div>
        </section>
      )}

      <Tabs value={activeTab} onValueChange={changeTab}>
        {activeTab === 'cards' && (
          <TabsList className="mb-6 grid h-auto w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-white/70 p-1">
            <TabsTrigger value="patients">Profiluri pacient</TabsTrigger>
            {canBuyPatientPackages && <TabsTrigger value="cards">Cumpără pachet</TabsTrigger>}
          </TabsList>
        )}

        <TabsContent id="patient-profiles" value="patients" className="scroll-mt-24 space-y-4">
          {profiles.length > 0 && !canAddPatient && canBuyPatientPackages && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="min-w-0 flex-1"><span className="font-semibold">Ai folosit toate locurile din pachet.</span> Pentru încă un pacient ai nevoie de un pachet nou.</span>
              <button type="button" onClick={() => changeTab('cards')} className="h-9 rounded-[10px] border border-amber-300 bg-white px-3 font-medium">Cumpără pachet</button>
            </div>
          )}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {profiles.map((profile) => <PatientCard key={profile.id} profile={profile} />)}
            {canAddPatient && (
              <li>
                <button type="button" onClick={() => setIsPatientOpen(true)} className="flex h-full w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-slate-300 p-4 text-left transition hover:border-slate-400 sm:min-h-[220px] sm:flex-col sm:justify-center sm:p-[18px] sm:text-center">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 sm:h-12 sm:w-12"><Plus className="h-5 w-5" /></span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-slate-950">Adaugă pacient</span>
                    {canBuyPatientPackages && <span className="text-[13px] text-slate-500">{availableSlots} {availableSlots === 1 ? 'loc liber' : 'locuri libere'}{totalSlots ? ` din ${totalSlots}` : ''}</span>}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </TabsContent>

        <TabsContent value="cards" className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Alege un pachet</CardTitle>
              <CardDescription>Pachetul îți permite să adaugi pacienți și să soliciți servicii medicale pentru ei.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {packages.map((pack) => (
                <div key={pack.id} className="flex min-h-[240px] flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="space-y-3">
                    <div className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      Deblochează accesul
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{pack.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{pack.profile_slots} profiluri • {pack.validity_days} zile</p>
                      {(pack.bonus_points ?? 0) > 0 && <p className="mt-2 inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">+{money(pack.bonus_points)} puncte bonus cadou</p>}
                    </div>
                    {pack.description && <p className="text-sm leading-6 text-slate-600">{pack.description}</p>}
                    <p className="text-xs font-medium text-slate-500">
                      După cumpărare vei putea crea {pack.profile_slots === 1 ? 'un profil de pacient' : `${pack.profile_slots} profiluri de pacient`}.
                    </p>
                  </div>
                  <Button className="mt-5 rounded-xl" onClick={() => buyPackage(pack)}>
                    <WalletCards className="mr-2 h-4 w-4" />
                    Cumpără cu {pack.price} MDL
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Pachetele tale</CardTitle>
              <CardDescription>Vezi câte locuri pentru pacienți mai ai disponibile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {purchases.length === 0 && <p className="text-sm text-slate-500">Nu ai cumpărat niciun pachet încă.</p>}
              {purchases.map((purchase) => (
                <div key={purchase.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-950">{purchase.used_slots}/{purchase.profile_slots} profiluri folosite</p>
                  <p className="text-sm text-slate-500">Disponibile: {purchase.available_slots} • expiră {new Date(purchase.expires_at).toLocaleDateString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Cont utilizator</CardTitle>
              <CardDescription>Emailul rămâne cheia de autentificare.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveAccount} className="space-y-4">
                <Field label="Nume cont">
                  <Input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} className="rounded-xl" required />
                </Field>
                <Field label="Telefon">
                  <Input value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} className="rounded-xl" />
                </Field>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Notificări Telegram</p>
                    <p className="text-xs text-slate-500">
                      {data?.user?.telegram_chat_id ? 'Contul tău este conectat la botul platformei.' : 'Primește notificările instant, direct în Telegram.'}
                    </p>
                  </div>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate('/patient/telegram')}>
                    {data?.user?.telegram_chat_id ? 'Gestionează' : 'Conectează'}
                  </Button>
                </div>
                <Button className="rounded-xl">Salvează</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="space-y-6">
          {!referralData && (
            <Card className="border-slate-200/70 bg-white shadow-sm">
              <CardContent className="p-6 text-sm text-slate-500">Se încarcă programul de afiliere...</CardContent>
            </Card>
          )}

          {referralData && <ReferralPanel data={referralData} audience="patient" />}
        </TabsContent>
      </Tabs>

      <Dialog open={isPatientOpen} onOpenChange={setIsPatientOpen}>
        <DialogContent className="sm:max-w-[620px] rounded-2xl border-0 bg-white shadow-xl">
          <form onSubmit={savePatient}>
            <DialogHeader>
              <DialogTitle>Profil pacient nou</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <PatientBasicsFields value={patientForm} onChange={(next) => setPatientForm({ ...patientForm, ...next })} regions={regionsCatalog} />
              </div>
              <Field label="Mediul de trai"><select className="h-11 w-full rounded-xl border bg-white px-3" value={patientForm.residential_environment} onChange={(event) => setPatientForm({ ...patientForm, residential_environment: event.target.value })}><option value="">Necompletat</option><option value="rural">Rural</option><option value="urban">Urban</option></select></Field>
              <p className="flex items-end rounded-xl bg-slate-50 p-3 text-sm">Vârsta: {patientAge(patientForm.birth_date)}</p>
              <Field label="Strada și numărul (opțional)">
                <Input value={patientForm.address} onChange={(event) => setPatientForm({ ...patientForm, address: event.target.value })} className="rounded-xl" />
                {isEnabled('with_exam_consultations') && <p className="text-xs text-slate-500">Necesară doar pentru examinarea la domiciliu.</p>}
              </Field>
              <div className="md:col-span-2">
                <Field label="Istoricul vieții"><Textarea placeholder="Naștere și dezvoltare, boli anterioare, accidente, operații și antecedente familiale. Detaliile se completează în compartimentele fișei." value={patientForm.medical_summary} onChange={(event) => setPatientForm({ ...patientForm, medical_summary: event.target.value })} className="rounded-xl" /></Field>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsPatientOpen(false)}>Anulare</Button>
              <Button className="rounded-xl" disabled={!isPatientBasicsComplete(patientForm)}>Creează profil</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function displayName(profile: PatientProfile) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || `Profil #${profile.id}`;
}


function profileTab(value: string | null): ProfileTab {
  return value === 'cards' || value === 'referrals' || value === 'account' ? value : 'patients';
}

function apiErrorData(err: unknown): Record<string, unknown> | null {
  if (err && typeof err === 'object' && 'data' in err) {
    return (err as { data?: Record<string, unknown> }).data ?? null;
  }

  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function patientPageLink(profileId: string, section: string | null, request: string | null): string {
  const base = `/patient/patients/${profileId}`;
  if (section && MEDICAL_SECTIONS.some((item) => item.key === section)) return `${base}?tab=fisa&section=${section}`;
  if (section && ['analysis', 'imaging', 'functional', 'investigation'].includes(section)) return `${base}?tab=documente`;
  if (section && ['consultations', 'chat', 'objective'].includes(section)) return `${base}?tab=consultatii${request ? `&request=${request}` : ''}`;
  return request ? `${base}?tab=consultatii&request=${request}` : base;
}

/** Textul butonului spre secțiunea care lipsește, ca în design („Adaugă alergiile”). */
const NEXT_SECTION_ACTION: Record<string, string> = {
  birth: 'Completează nașterea',
  vaccinations: 'Adaugă vaccinările',
  surgeries: 'Adaugă intervențiile',
  drug_allergies: 'Adaugă alergiile',
  chronic_conditions: 'Adaugă bolile cronice',
  family_history: 'Completează antecedentele',
  lifestyle: 'Completează stilul de viață',
  disease_history: 'Adaugă bolile și traumatismele'
};

/** Un pacient (D1): inițiale, cercul fișei, vârsta și codul, un singur buton spre ce lipsește. */
function PatientCard({ profile }: { profile: PatientProfile }) {
  const navigate = useNavigate();
  const progress = recordProgress(profile);
  const name = displayName(profile);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  const full = !progress.nextKey;
  const age = profile.birth_date ? patientAge(profile.birth_date) : null;
  const code = formatPatientCode(profile.patient_code);
  const action = full ? 'Vezi fișa' : NEXT_SECTION_ACTION[progress.nextKey ?? ''] ?? `Completează: ${sectionTitle(progress.nextKey)}`;
  const target = full ? `/patient/patients/${profile.id}?tab=fisa` : `/patient/patients/${profile.id}?tab=fisa&section=${progress.nextKey}`;
  const ring = <ProgressRing done={progress.done} total={progress.total} />;
  const button = (
    <button type="button" onClick={() => navigate(target)} className={cn('rounded-[10px] px-3.5 text-sm font-semibold', full ? 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700')}>{action}</button>
  );

  return (
    <li className="rounded-2xl border border-slate-200 bg-white">
      {/* Telefon (D1a) */}
      <div className="flex flex-col gap-3.5 p-4 sm:hidden">
        <Link to={`/patient/patients/${profile.id}`} className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 text-[15px] font-semibold text-blue-700">{initials}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-base font-semibold text-slate-950">{name}</span><span className="truncate text-xs text-slate-500">{[age, code && <span key="code" className="font-mono">{code}</span>].filter(Boolean).reduce<React.ReactNode[]>((parts, part, index) => (index ? [...parts, ' · ', part] : [part]), [])}</span></span>
          {ring}
        </Link>
        <div className="flex items-center justify-between gap-2.5"><span className="text-[13px] text-slate-500">Fișa: {progress.done} din {progress.total}</span><span className="[&>button]:h-[38px]">{button}</span></div>
      </div>
      {/* Desktop (D1b) */}
      <div className="hidden h-full flex-col gap-4 p-[18px] sm:flex">
        <Link to={`/patient/patients/${profile.id}`} className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{initials}</span>{ring}</Link>
        <Link to={`/patient/patients/${profile.id}`} className="flex flex-col gap-[3px]">
          <span className="text-base font-semibold text-slate-950">{name}</span>
          {age && <span className="text-[13px] text-slate-500">{age}</span>}
          {code && <span className="font-mono text-xs text-slate-400">{code}</span>}
          {!profile.can_request_consultation && profile.request_unavailable_reason && <span className="mt-1 text-xs font-medium text-amber-700">{profile.request_unavailable_reason}</span>}
        </Link>
        <span className="mt-auto flex flex-col [&>button]:h-10">{button}</span>
      </div>
    </li>
  );
}

/** Cercul fișei: albastru cât timp lipsesc secțiuni, verde când e completă. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 22;
  const full = done >= total;
  return (
    <span className="relative h-[52px] w-[52px] shrink-0">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="22" fill="none" stroke="#E2E8F0" strokeWidth="5" />
        <circle cx="26" cy="26" r="22" fill="none" stroke={full ? '#16A34A' : '#2563EB'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(done / total) * circumference} ${circumference}`} transform="rotate(-90 26 26)" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold text-slate-950">{done}/{total}</span>
    </span>
  );
}

/** Codul pacientului (15 cifre), grupat câte trei pentru citire: 151 013 289 123 411. */
function formatPatientCode(code?: string | null): string {
  return code ? code.replace(/(\d{3})(?=\d)/g, '$1 ') : '';
}
