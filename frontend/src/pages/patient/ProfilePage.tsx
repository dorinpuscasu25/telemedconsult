import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type PatientProfile = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  identity_number?: string | null;
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
  reward_amount: number;
  currency: string;
  rules: string;
  stats: {
    invited_count: number;
    rewarded_count: number;
    pending_count: number;
    earned_total: number;
  };
  latest_referrals: Array<{
    id: number;
    name: string;
    email: string;
    status: 'pending' | 'rewarded' | 'ineligible';
    reward_amount: number;
    created_at: string;
  }>;
};

const emptyPatient = {
  first_name: '',
  last_name: '',
  identity_number: '',
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
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [referralData, setReferralData] = useState<ReferralResponse | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', phone: '', telegram_chat_id: '' });
  const [patientForm, setPatientForm] = useState(emptyPatient);
  const [regionsCatalog, setRegionsCatalog] = useState<CatalogRegion[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PatientProfile | null>(null);
  const [lifeForm, setLifeForm] = useState({ category: 'Alergii', note: '' });
  const [investigationForm, setInvestigationForm] = useState({ title: '', type: 'investigation', notes: '' });
  const [isPatientOpen, setIsPatientOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('patients');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [walletTopUpAmount, setWalletTopUpAmount] = useState<number | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);

  const loadProfile = () => {
    apiRequest<ProfileResponse>('/patient/profile').then((response) => {
      setData(response);
      setAccountForm({
        name: response.user.name || '',
        phone: response.user.phone || '',
        telegram_chat_id: response.user.telegram_chat_id || ''
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
        setError(data.message || 'Balanță insuficientă pentru cartelă.');
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Pacienții mei</h1>
        <p className="mt-1 text-sm text-slate-500">Cumperi o cartelă, adaugi pacientul, apoi poți solicita consultații și examinări.</p>
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

      {!hasRequestablePatient && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-amber-700">Accesul la consultații este blocat momentan</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Pentru a folosi platforma trebuie mai întâi să cumperi un pachet și să adaugi un pacient.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900">
                  Contul tău este doar proprietarul portofelului. Serviciile medicale se pornesc doar pentru un profil de pacient activ, iar profilurile se pot crea numai dintr-un pachet cumpărat.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Button className="rounded-xl" onClick={() => setActiveTab('cards')}>
                <CreditCard className="mr-2 h-4 w-4" />
                Cumpără pachet
              </Button>
              <Button variant="outline" className="rounded-xl bg-white" onClick={() => navigate('/patient/wallet')}>
                Alimentează portofelul
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <OnboardingStep
              done={hasPurchasedCards}
              title="1. Cumpără pachet"
              text="Pachetul deblochează unul sau mai multe sloturi de pacient."
            />
            <OnboardingStep
              done={availableSlots > 0 || profiles.length > 0}
              title="2. Adaugă pacient"
              text="Completezi nume, IDNP și datele de bază ale pacientului."
            />
            <OnboardingStep
              done={hasRequestablePatient}
              title="3. Solicită servicii"
              text="După profil activ poți alege medic sau operator."
            />
          </div>
        </section>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 grid h-auto w-full max-w-3xl grid-cols-2 gap-1 rounded-xl bg-white/70 p-1 sm:grid-cols-4">
          <TabsTrigger value="patients">Pacienții mei</TabsTrigger>
          <TabsTrigger value="cards">Pachete</TabsTrigger>
          <TabsTrigger value="referrals">Afiliere</TabsTrigger>
          <TabsTrigger value="account">Cont</TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Profiluri pacient</CardTitle>
                  <CardDescription>Sloturi disponibile: {availableSlots}</CardDescription>
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
                  <p className="mt-1">Cumpără întâi un pachet din wallet. Pachetul creează sloturile pe care le folosești pentru profilurile de pacient.</p>
                  <Button variant="outline" className="mt-3 rounded-xl border-amber-300 bg-white" onClick={() => setActiveTab('cards')}>
                    Vezi pachetele
                  </Button>
                </div>
              )}
              {profiles.length > 0 && availableSlots <= 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold text-slate-950">Ai folosit toate sloturile disponibile.</p>
                  <p className="mt-1">Pentru încă un pacient trebuie să cumperi un pachet nou. Profilurile existente rămân în istoric.</p>
                  <Button variant="outline" className="mt-3 rounded-xl border-amber-300 bg-white" onClick={() => setActiveTab('cards')}>
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
              <CardTitle>Pachete de tip subscription</CardTitle>
              <CardDescription>Acesta este pasul obligatoriu: fără pachet activ nu poți crea pacient și nu poți solicita consultații.</CardDescription>
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
              <CardTitle>Cartele cumpărate</CardTitle>
              <CardDescription>Sloturile nefolosite pot crea profiluri noi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {purchases.length === 0 && <p className="text-sm text-slate-500">Nu ai cumpărat cartele încă.</p>}
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
                <Field label="Telegram chat id">
                  <Input value={accountForm.telegram_chat_id} onChange={(event) => setAccountForm({ ...accountForm, telegram_chat_id: event.target.value })} className="rounded-xl" />
                </Field>
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
              <Card className="overflow-hidden border-0 bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-xl shadow-blue-200/60">
                <CardContent className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                      <Gift className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">Program de afiliere</p>
                    <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Invită un pacient și primești {referralData.reward_amount} {referralData.currency}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
                      Bonusul intră automat în portofelul tău după ce pacientul invitat își creează contul și confirmă adresa de email.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/15 px-6 py-4 text-center backdrop-blur-sm">
                    <p className="text-sm text-blue-100">Câștig total</p>
                    <p className="mt-1 text-3xl font-bold">{referralData.stats.earned_total} {referralData.currency}</p>
                  </div>
                </CardContent>
              </Card>

              {!referralData.enabled && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Programul de afiliere este momentan dezactivat. Linkul tău rămâne rezervat și va putea fi folosit după reactivare.
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <ReferralStat icon={UsersRound} label="Persoane invitate" value={referralData.stats.invited_count} />
                <ReferralStat icon={CheckCircle2} label="Bonusuri acordate" value={referralData.stats.rewarded_count} />
                <ReferralStat icon={WalletCards} label="În așteptare" value={referralData.stats.pending_count} />
              </div>

              <Card className="border-slate-200/70 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Linkul tău personal</CardTitle>
                  <CardDescription>Trimite acest link. Codul tău este {referralData.code}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input readOnly value={referralData.referral_link} className="h-11 min-w-0 rounded-xl bg-slate-50" />
                    <Button type="button" disabled={!referralData.enabled} onClick={copyReferralLink} className="h-11 shrink-0 rounded-xl px-5">
                      {copiedReferral ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copiedReferral ? 'Copiat' : 'Copiază linkul'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

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
                    {referralData.latest_referrals.length === 0 && (
                      <p className="text-sm text-slate-500">Nu ai invitații încă. Copiază linkul și trimite-l unei persoane care are nevoie de un cont de pacient.</p>
                    )}
                    {referralData.latest_referrals.map((referral) => (
                      <div key={referral.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{referral.name}</p>
                          <p className="text-sm text-slate-500">{referral.email} • {new Date(referral.created_at).toLocaleDateString('ro-MD')}</p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${referral.status === 'rewarded' ? 'bg-emerald-100 text-emerald-700' : referral.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                          {referral.status === 'rewarded' ? `+${referral.reward_amount} ${referralData.currency}` : referral.status === 'pending' ? 'În așteptare' : 'Neeligibil'}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
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
              <Field label="IDNP"><Input value={patientForm.identity_number} onChange={(event) => setPatientForm({ ...patientForm, identity_number: event.target.value })} required className="rounded-xl" /></Field>
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

function OnboardingStep({ done, title, text }: { done: boolean; title: string; text: string }) {
  return (
    <div className={`rounded-xl border p-4 ${done ? 'border-emerald-200 bg-white text-slate-700' : 'border-amber-200 bg-white/70 text-amber-900'}`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 ${done ? 'text-emerald-600' : 'text-amber-500'}`} />
        <p className="font-semibold text-slate-950">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-5">{text}</p>
    </div>
  );
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
