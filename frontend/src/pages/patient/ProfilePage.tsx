import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Copy, CreditCard, Download, FileUp, Gift, LockKeyhole, Plus, Trash2, User, UsersRound, WalletCards } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';
import { dateOnly, money } from '../../lib/format';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

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

type ReferralResponse = {
  enabled: boolean;
  code: string;
  referral_link: string;
  /** Procentul din fiecare alimentare a invitatului care ajunge la invitator. */
  commission_rate: number;
  /** Alimentările sub această sumă nu generează comision. */
  minimum_topup: number;
  /** true = comision doar la prima alimentare a invitatului. */
  first_deposit_only: boolean;
  currency: string;
  rules: string | null;
  stats: {
    invited_count: number;
    active_count: number;
    pending_count: number;
    earned_total: number;
    commission_count: number;
  };
  latest_referrals: Array<{
    id: number;
    name: string;
    email: string;
    status: 'earning' | 'waiting_topup';
    earned_total: number;
    commission_count: number;
    created_at: string;
  }>;
  latest_commissions: Array<{
    id: number;
    deposit_amount: number;
    commission_amount: number;
    rate_percent: number;
    currency: string;
    created_at: string;
  }>;
};

type ProfileTab = 'patients' | 'cards' | 'referrals' | 'account';

const emptyPatient = {
  first_name: '',
  last_name: '',
  birth_date: '',
  gender: 'Altul',
  country: 'Republica Moldova',
  region_id: '',
  locality_id: '',
  address: '',
  emergency_contact: '',
  medical_summary: ''
};

export function ProfilePage() {
  const navigate = useNavigate();
  const { isEnabled } = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [referralData, setReferralData] = useState<ReferralResponse | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', phone: '' });
  const [patientForm, setPatientForm] = useState(emptyPatient);
  const [regionsCatalog, setRegionsCatalog] = useState<CatalogRegion[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PatientProfile | null>(null);
  const [lifeForm, setLifeForm] = useState({ category: 'Alergii', note: '' });
  const [investigationForm, setInvestigationForm] = useState({ title: '', type: 'investigation', notes: '' });
  const [isPatientOpen, setIsPatientOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => profileTab(searchParams.get('tab')));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [walletTopUpAmount, setWalletTopUpAmount] = useState<number | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);

  const loadProfile = () => {
    apiRequest<ProfileResponse>('/patient/profile').then((response) => {
      setData(response);
      setAccountForm({
        name: response.user.name || '',
        phone: response.user.phone || ''
      });
      setSelectedProfile((current) => {
        if (current && response.patient_profiles.some((profile) => profile.id === current.id)) {
          return response.patient_profiles.find((profile) => profile.id === current.id) || null;
        }
        return response.patient_profiles[0] || null;
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

  const localitiesForSelectedRegion =
    regionsCatalog.find((region) => String(region.id) === patientForm.region_id)?.localities ?? [];
  const selectedRegionName = regionsCatalog.find((region) => String(region.id) === patientForm.region_id)?.name ?? '';
  const selectedLocalityName =
    localitiesForSelectedRegion.find((locality) => String(locality.id) === patientForm.locality_id)?.name ?? '';

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
        body: JSON.stringify({ ...accountForm, gender: 'Altul' })
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
      notify('Cartelă cumpărată din portofel.');
      loadProfile();
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
      await apiRequest('/patient/profiles', {
        method: 'POST',
        body: JSON.stringify({
          ...patientForm,
          region_id: patientForm.region_id ? Number(patientForm.region_id) : null,
          locality_id: patientForm.locality_id ? Number(patientForm.locality_id) : null
        })
      });
      setIsPatientOpen(false);
      setPatientForm(emptyPatient);
      notify('Profil pacient creat.');
      loadProfile();
    } catch (err) {
      fail(err, 'Nu am putut crea profilul.');
    }
  };

  const appendLifeHistory = async () => {
    if (!selectedProfile || !lifeForm.note.trim()) return;
    try {
      await apiRequest(`/patient/profiles/${selectedProfile.id}/life-history`, {
        method: 'POST',
        body: JSON.stringify(lifeForm)
      });
      setLifeForm({ ...lifeForm, note: '' });
      notify('Istoric adăugat.');
      loadProfile();
    } catch (err) {
      fail(err, 'Nu am putut adăuga istoricul.');
    }
  };

  const uploadInvestigation = async () => {
    if (!selectedProfile || !investigationForm.title.trim()) return;
    const form = new FormData();
    form.append('title', investigationForm.title);
    form.append('type', investigationForm.type);
    form.append('notes', investigationForm.notes);
    const file = fileRef.current?.files?.[0];
    if (file) form.append('file', file);

    try {
      await apiRequest(`/patient/profiles/${selectedProfile.id}/investigations`, {
        method: 'POST',
        body: form
      });
      setInvestigationForm({ title: '', type: 'investigation', notes: '' });
      if (fileRef.current) fileRef.current.value = '';
      notify('Investigație salvată.');
      loadProfile();
    } catch (err) {
      fail(err, 'Nu am putut salva investigația.');
    }
  };

  const exportProfile = async (profile: PatientProfile) => {
    try {
      const exported = await apiRequest(`/patient/profiles/${profile.id}/export`);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `patient-profile-${profile.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      fail(err, 'Nu am putut exporta datele.');
    }
  };

  const deleteProfile = async (profile: PatientProfile) => {
    if (!window.confirm('Ștergi profilul de pacient?')) return;
    try {
      await apiRequest(`/patient/profiles/${profile.id}`, { method: 'DELETE' });
      notify('Profil șters.');
      loadProfile();
    } catch (err) {
      fail(err, 'Nu am putut șterge profilul.');
    }
  };

  const copyReferralLink = async () => {
    if (!referralData?.referral_link) return;

    try {
      await navigator.clipboard.writeText(referralData.referral_link);
      setCopiedReferral(true);
      window.setTimeout(() => setCopiedReferral(false), 2000);
    } catch (err) {
      fail(err, 'Nu am putut copia linkul. Selectează-l și copiază-l manual.');
    }
  };

  const profiles = data?.patient_profiles ?? [];
  const packages = data?.card_packages ?? [];
  const purchases = data?.card_purchases ?? [];
  const availableSlots = purchases.reduce((sum, item) => sum + item.available_slots, 0);
  const hasPurchasedCards = purchases.length > 0;
  const hasRequestablePatient = profiles.some((profile) => profile.can_request_consultation);
  const canBuyPatientPackages = isEnabled('patient_cards') && isEnabled('payments');
  const patientNextStep = !canBuyPatientPackages && !hasRequestablePatient
    ? {
        step: 'Indisponibil momentan',
        title: 'Pachetele pentru pacienți sunt dezactivate',
        description: 'Administratorul a dezactivat temporar cumpărarea pachetelor. Profilurile deja active rămân disponibile.',
        action: 'Deschide contul meu',
        onClick: () => changeTab('account')
      }
    : profiles.length === 0 && !hasPurchasedCards
    ? {
        step: 'Primul pas',
        title: 'Adaugă primul pacient gratuit',
        description: 'Primul profil de pacient este gratuit. Pentru profilurile următoare vei putea cumpăra un pachet.',
        action: 'Adaugă pacient',
        onClick: () => setIsPatientOpen(true)
      }
    : profiles.length === 0 && availableSlots > 0
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">{pageHeading.title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{pageHeading.description}</p>
      </div>

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

      {activeTab === 'patients' && !hasRequestablePatient && (
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
                {hasPurchasedCards ? <Plus className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {patientNextStep.action}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate('/patient/wallet')}>
                Deschide portofelul
              </Button>
            </div>
          </div>
        </section>
      )}

      <Tabs value={activeTab} onValueChange={changeTab}>
        {(activeTab === 'patients' || activeTab === 'cards') && (
          <TabsList className="mb-6 grid h-auto w-full max-w-md grid-cols-2 gap-1 rounded-xl bg-white/70 p-1">
            <TabsTrigger value="patients">Profiluri pacient</TabsTrigger>
            {canBuyPatientPackages && <TabsTrigger value="cards">Cumpără pachet</TabsTrigger>}
          </TabsList>
        )}

        <TabsContent id="patient-profiles" value="patients" className="scroll-mt-24 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Profiluri pacient</CardTitle>
                  <CardDescription>Locuri disponibile pentru pacienți: {availableSlots}</CardDescription>
                </div>
                <Button className="rounded-xl" disabled={availableSlots <= 0} onClick={() => setIsPatientOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adaugă
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {profiles.length === 0 && (
                <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                  <p className="font-semibold text-slate-950">Nu poți adăuga pacient fără pachet activ.</p>
                  <p className="mt-1">Cumpără mai întâi un pachet. Fiecare pachet îți permite să adaugi unul sau mai mulți pacienți.</p>
                  <Button variant="outline" className="mt-3 rounded-xl border-amber-300 bg-white" onClick={() => changeTab('cards')}>
                    Vezi pachetele
                  </Button>
                </div>
              )}
              {profiles.length > 0 && availableSlots <= 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold text-slate-950">Ai folosit toate locurile disponibile.</p>
                  <p className="mt-1">Pentru încă un pacient trebuie să cumperi un pachet nou. Profilurile existente rămân în istoric.</p>
                  <Button variant="outline" className="mt-3 rounded-xl border-amber-300 bg-white" onClick={() => changeTab('cards')}>
                    Cumpără pachet
                  </Button>
                </div>
              )}
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => setSelectedProfile(profile)}
                  className={`w-full rounded-xl border p-4 text-left transition ${selectedProfile?.id === profile.id ? 'border-primary bg-primary/5' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-950">{displayName(profile)}</p>
                      <p className="text-sm text-slate-500">{profile.region || 'Regiune neselectată'} • {profile.locality || 'Localitate neselectată'}</p>
                      <p className="mt-1 text-xs text-slate-400">Valabil până: {profile.active_until ? new Date(profile.active_until).toLocaleDateString() : 'nelimitat'}</p>
                      {profile.request_unavailable_reason && (
                        <p className="mt-1 text-xs font-medium text-amber-700">{profile.request_unavailable_reason}</p>
                      )}
                      {!profile.request_unavailable_reason && profile.has_complete_address === false && (
                        <p className="mt-1 text-xs font-medium text-amber-700">Completează adresa (raion, localitate, stradă) pentru consultații cu examinare la domiciliu.</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{selectedProfile ? displayName(selectedProfile) : 'Fișa pacientului'}</CardTitle>
                  <CardDescription>Istoric viață, investigații și export GDPR.</CardDescription>
                </div>
                {selectedProfile && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="rounded-xl" onClick={() => exportProfile(selectedProfile)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-xl text-red-600" onClick={() => deleteProfile(selectedProfile)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {!selectedProfile && <p className="text-sm text-slate-500">Selectează un profil.</p>}
              {selectedProfile && (
                <>
                  <section className="space-y-3">
                    <h3 className="font-semibold text-slate-950">Istoricul vieții</h3>
                    <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
                      <Select value={lifeForm.category} onValueChange={(category) => setLifeForm({ ...lifeForm, category })}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Vaccinuri">Vaccinuri</SelectItem>
                          <SelectItem value="Alergii">Alergii</SelectItem>
                          <SelectItem value="Antecedente">Antecedente</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={lifeForm.note} onChange={(event) => setLifeForm({ ...lifeForm, note: event.target.value })} placeholder="Adaugă informație" className="rounded-xl" />
                      <Button onClick={appendLifeHistory} className="rounded-xl">Adaugă</Button>
                    </div>
                    <div className="space-y-2">
                      {(selectedProfile.life_history ?? []).length === 0 && <p className="text-sm text-slate-500">Nu există intrări încă.</p>}
                      {(selectedProfile.life_history ?? []).map((item, index) => (
                        <div key={`${item.added_at}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <span className="font-semibold text-slate-900">{item.category}:</span> {item.note}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h3 className="font-semibold text-slate-950">Investigații</h3>
                    <div className="grid gap-3">
                      <Input value={investigationForm.title} onChange={(event) => setInvestigationForm({ ...investigationForm, title: event.target.value })} placeholder="Titlu investigație" className="rounded-xl" />
                      <Textarea value={investigationForm.notes} onChange={(event) => setInvestigationForm({ ...investigationForm, notes: event.target.value })} placeholder="Note" className="rounded-xl" />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input ref={fileRef} type="file" className="rounded-xl bg-white" />
                        <Button onClick={uploadInvestigation} className="rounded-xl">
                          <FileUp className="mr-2 h-4 w-4" />
                          Salvează
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(selectedProfile.investigations ?? []).length === 0 && <p className="text-sm text-slate-500">Nu există investigații.</p>}
                      {(selectedProfile.investigations ?? []).map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <p className="font-semibold text-slate-900">{item.title}</p>
                          {item.notes && <p className="text-slate-600">{item.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </CardContent>
          </Card>
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
          <Card className="max-w-2xl border-slate-200/70 bg-white shadow-sm">
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

          {referralData && (
            <>
              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
                        <Gift className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">
                          Comisionul tău din {referralData.first_deposit_only ? 'prima alimentare' : 'fiecare alimentare'}
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-slate-950">{referralData.commission_rate}%</p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3 sm:text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Câștig total</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{money(referralData.stats.earned_total)} {referralData.currency}</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-3">
                    <ReferralStep number="1" title="Copiază linkul" text="Folosește linkul personal afișat mai jos." />
                    <ReferralStep number="2" title="Trimite-l unei persoane" text="Persoana își creează un cont nou de pacient." />
                    <ReferralStep
                      number="3"
                      title="Primești comisionul"
                      text={`Când alimentează portofelul, ${referralData.commission_rate}% din sumă intră automat în portofelul tău.`}
                    />
                  </div>

                  <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
                    Primești <strong>{referralData.commission_rate}%</strong> din{' '}
                    {referralData.first_deposit_only ? 'prima sumă alimentată' : 'fiecare sumă alimentată'} de persoana invitată.
                    {referralData.minimum_topup > 0 && ` Sunt eligibile alimentările de cel puțin ${money(referralData.minimum_topup)} ${referralData.currency}.`}
                    {' '}Comisionul se acordă doar pentru plăți confirmate, nu la simpla înregistrare.
                  </p>
                </CardContent>
              </Card>

              {!referralData.enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Programul de afiliere este momentan dezactivat. Linkul tău rămâne rezervat și va putea fi folosit după reactivare.
                </div>
              )}

              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Linkul tău personal de invitație</CardTitle>
                  <CardDescription>Copiază linkul și trimite-l persoanei pe care vrei să o inviți.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input readOnly value={referralData.referral_link} className="h-11 min-w-0 rounded-xl bg-slate-50" />
                    <Button type="button" disabled={!referralData.enabled} onClick={copyReferralLink} className="h-11 shrink-0 rounded-xl px-5">
                      {copiedReferral ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copiedReferral ? 'Link copiat' : 'Copiază linkul'}
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Codul tău de invitație: <span className="font-semibold text-slate-700">{referralData.code}</span></p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <ReferralStat icon={UsersRound} label="Persoane invitate" value={referralData.stats.invited_count} />
                <ReferralStat icon={CheckCircle2} label="Au alimentat portofelul" value={referralData.stats.active_count} />
                <ReferralStat icon={WalletCards} label="Fără alimentare încă" value={referralData.stats.pending_count} />
              </div>

              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <Card className="border-slate-200/70 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Regulament</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{referralData.rules}</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/70 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Ultimele invitații</CardTitle>
                    <CardDescription>Datele sunt mascate pentru protejarea confidențialității.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(referralData.latest_referrals ?? []).length === 0 && (
                      <p className="text-sm text-slate-500">Nu ai invitații încă. Copiază linkul și trimite-l unei persoane care are nevoie de un cont de pacient.</p>
                    )}
                    {(referralData.latest_referrals ?? []).map((referral) => (
                      <div key={referral.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{referral.name}</p>
                          <p className="text-sm text-slate-500">{referral.email} • {dateOnly(referral.created_at)}</p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${referral.status === 'earning' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {referral.status === 'earning'
                            ? `+${money(referral.earned_total)} ${referralData.currency}`
                            : 'Nu a alimentat încă'}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Comisioane primite</CardTitle>
                  <CardDescription>Fiecare alimentare a persoanelor invitate generează un comision separat.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(referralData.latest_commissions ?? []).length === 0 && (
                    <p className="text-sm text-slate-500">Încă nu ai primit comisioane. Comisionul apare aici după prima alimentare confirmată a unei persoane invitate.</p>
                  )}
                  {(referralData.latest_commissions ?? []).map((commission) => (
                    <div key={commission.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Alimentare de {money(commission.deposit_amount)} {commission.currency}
                        </p>
                        <p className="text-sm text-slate-500">
                          {dateOnly(commission.created_at)} • cotă {commission.rate_percent}%
                        </p>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        +{money(commission.commission_amount)} {commission.currency}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isPatientOpen} onOpenChange={setIsPatientOpen}>
        <DialogContent className="sm:max-w-[620px] rounded-2xl border-0 bg-white shadow-xl">
          <form onSubmit={savePatient}>
            <DialogHeader>
              <DialogTitle>Profil pacient nou</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-5 md:grid-cols-2">
              <Field label="Prenume"><Input value={patientForm.first_name} onChange={(event) => setPatientForm({ ...patientForm, first_name: event.target.value })} required className="rounded-xl" /></Field>
              <Field label="Nume"><Input value={patientForm.last_name} onChange={(event) => setPatientForm({ ...patientForm, last_name: event.target.value })} required className="rounded-xl" /></Field>
              <Field label="Data nașterii"><Input type="date" value={patientForm.birth_date} onChange={(event) => setPatientForm({ ...patientForm, birth_date: event.target.value })} className="rounded-xl" /></Field>
              <Field label="Țară"><Input value={patientForm.country} onChange={(event) => setPatientForm({ ...patientForm, country: event.target.value })} required className="rounded-xl" /></Field>
              <Field label="Raion / municipiu">
                <Select value={patientForm.region_id} onValueChange={(value) => setPatientForm({ ...patientForm, region_id: value, locality_id: '' })}>
                  <SelectTrigger className="rounded-xl">
                    {selectedRegionName || <span className="text-muted-foreground">Alege raionul</span>}
                  </SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {regionsCatalog.map((region) => (
                      <SelectItem key={region.id} value={String(region.id)}>{region.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Localitate">
                <Select value={patientForm.locality_id} onValueChange={(value) => setPatientForm({ ...patientForm, locality_id: value })}>
                  <SelectTrigger className="rounded-xl">
                    {selectedLocalityName || (
                      <span className="text-muted-foreground">{patientForm.region_id ? 'Alege localitatea' : 'Alege întâi raionul'}</span>
                    )}
                  </SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {localitiesForSelectedRegion.map((locality) => (
                      <SelectItem key={locality.id} value={String(locality.id)}>{locality.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Adresă (stradă și număr)"><Input value={patientForm.address} onChange={(event) => setPatientForm({ ...patientForm, address: event.target.value })} required className="rounded-xl" /></Field>
              <div className="md:col-span-2">
                <Field label="Sumar medical"><Textarea value={patientForm.medical_summary} onChange={(event) => setPatientForm({ ...patientForm, medical_summary: event.target.value })} className="rounded-xl" /></Field>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsPatientOpen(false)}>Anulare</Button>
              <Button className="rounded-xl">Creează profil</Button>
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

function ReferralStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <Card className="border-slate-200/70 bg-white shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-950">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferralStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <p className="font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">{text}</p>
      </div>
    </div>
  );
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
