import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Award, Check, CheckCircle2, ChevronLeft, ChevronRight, Home, Lock, Search, Star, Stethoscope, UserRound, Video } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { ConsultationComplaintFields } from '../../components/ConsultationComplaintFields';
import { BonusSlider, PrepareDoctorCard, ShortfallNotice, SlotPicker, longDateTime, mdl } from '../../components/patient/BookingParts';
import { apiRequest } from '../../lib/api';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

interface Doctor {
  id: string;
  name: string;
  email: string;
  specialty?: string | null;
  specialty_id?: number | null;
  experience_years: number;
  consultation_price: number;
  video_price?: number | null;
  video_duration_minutes?: number | null;
  platforms: string[];
  service_catalog?: unknown[] | null;
  required_investigations?: unknown[] | null;
  investigation_requirements?: { required: InvestigationLine[]; optional: InvestigationLine[] } | null;
  rating: string | number;
  reviews_count: number;
  is_available: boolean;
  accepts_points?: boolean;
}

interface InvestigationLine {
  id: number;
  name: string;
  default_price: number;
  requires_device?: boolean;
}

interface CostLine {
  id: number;
  name: string;
  requirement: string;
  price: number;
}

interface CostPreview {
  eligible: boolean;
  reason?: string;
  message?: string;
  operator?: { id: string; name?: string; region?: string | null };
  payment?: {
    total: number;
    real_amount: number;
    points_amount: number;
    promo_amount: number;
    promo_eligible: boolean;
    max_points_percent: number;
    promo_max_payment_percent: number;
  };
  wallet?: { balance: number; points_balance: number; promo_balance: number; shortfall: number };
  cost?: {
    doctor_base: number;
    investigations: CostLine[];
    investigations_total: number;
    travel_fee: number;
    total: number;
  };
}

interface Specialty {
  id: number;
  name: string;
}

interface PatientProfile {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  patient_code?: string | null;
  region?: string | null;
  locality?: string | null;
  region_id?: number | null;
  locality_id?: number | null;
  address?: string | null;
  has_complete_address?: boolean;
  status?: string | null;
  active_until?: string | null;
  can_request_consultation?: boolean;
  request_unavailable_reason?: string | null;
}

type BookingDraft = {
  doctorId: string;
  patientProfileId: string;
  kind: 'with_exam' | 'video';
  symptoms: string;
  illnessHistory: string;
  scheduledAt: string;
  selectedOptionalIds: number[];
  pointsPercent: number;
};

const DRAFT_KEY = 'booking_draft';

interface DoctorReview {
  id: number;
  patient?: string | null;
  rating: number;
  comment?: string | null;
}

export function DoctorsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProfileId = searchParams.get('patient_profile');
  const { isEnabled, isLoading: featuresLoading } = useFeatureFlags();
  const withExamEnabled = !featuresLoading && isEnabled('with_exam_consultations') && isEnabled('operators');
  const videoEnabled = !featuresLoading && isEnabled('video_consultations');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [specFilter, setSpecFilter] = useState('toate');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [detailDoctor, setDetailDoctor] = useState<Doctor | null>(null);
  const [doctorReviews, setDoctorReviews] = useState<DoctorReview[]>([]);
  const [patientProfileId, setPatientProfileId] = useState('');
  const [consultationKind, setConsultationKind] = useState<'with_exam' | 'video'>('video');
  const [pendingReview, setPendingReview] = useState<{ id: string; doctor_name?: string | null } | null>(null);
  const effectiveKind = consultationKind === 'with_exam' && withExamEnabled ? 'with_exam' : consultationKind === 'video' && videoEnabled ? 'video' : videoEnabled ? 'video' : withExamEnabled ? 'with_exam' : null;
  const [symptoms, setSymptoms] = useState('');
  const [illnessHistory, setIllnessHistory] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<CostPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pointsPercent, setPointsPercent] = useState(0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [account, setAccount] = useState<{ name: string; phone: string }>({ name: '', phone: '' });
  const [street, setStreet] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const resumeHandled = useRef(false);

  useEffect(() => {
    apiRequest<{data: Doctor[]}>('/catalog/doctors', { auth: false })
      .then((response) => setDoctors(response.data ?? []))
      .catch(() => setDoctors([]))
      .finally(() => setIsLoading(false));
    apiRequest<{data: Specialty[]}>('/catalog/specialties', { auth: false })
      .then((response) => setSpecialties(response.data ?? []))
      .catch(() => setSpecialties([]));
    loadProfiles()
      .then((profiles) => {
        const requestableProfiles = profiles.filter(canRequestConsultation);
        const requestedProfile = profiles.find((profile) => String(profile.id) === requestedProfileId && profile.can_request_consultation);
        setPatientProfileId(requestedProfile ? String(requestedProfile.id) : requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
      })
      .catch(() => undefined)
      .finally(() => setProfilesLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProfileId]);

  const loadProfiles = useCallback(async () => {
    const response = await apiRequest<{ patient_profiles: PatientProfile[]; user?: { name?: string; phone?: string | null } }>('/patient/profile');
    const profiles = response.patient_profiles ?? [];
    setPatientProfiles(profiles);
    setAccount({ name: response.user?.name ?? '', phone: response.user?.phone ?? '' });
    return profiles;
  }, []);

  useEffect(() => {
    if (!detailDoctor || !isDetailOpen) return;
    apiRequest(`/catalog/doctors/${detailDoctor.id}/view`, { method: 'POST', auth: false }).catch(() => undefined);
    apiRequest<{data: DoctorReview[]}>(`/catalog/doctors/${detailDoctor.id}/reviews`, { auth: false })
      .then((response) => setDoctorReviews(response.data ?? []))
      .catch(() => setDoctorReviews([]));
  }, [detailDoctor, isDetailOpen]);

  const filteredDoctors = useMemo(() => doctors.filter((doctor) => {
    const matchesSearch = doctor.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpec = specFilter === 'toate' || String(doctor.specialty_id) === specFilter;
    return matchesSearch && matchesSpec;
  }), [doctors, searchTerm, specFilter]);

  const openRequestDialog = (doctor: Doctor, kind: 'with_exam' | 'video' = 'video') => {
    const availableKind = kind === 'with_exam' && withExamEnabled
      ? 'with_exam'
      : kind === 'video' && videoEnabled
        ? 'video'
        : withExamEnabled
          ? 'with_exam'
          : videoEnabled
            ? 'video'
            : null;
    if (!availableKind) return;

    const requestableProfiles = patientProfiles.filter(canRequestConsultation);
    setSelectedDoctor(doctor);
    setConsultationKind(availableKind);
    setSymptoms('');
    setIllnessHistory('');
    setScheduledAt('');
    setError('');
    setIsSuccess(false);
    setSelectedOptionalIds([]);
    setPreview(null);
    setPointsPercent(0);
    // Pacientul fixat sus în listă (din asistent sau ales cu „Schimbă”) rămâne cel preselectat.
    const requested = requestableProfiles.find((profile) => String(profile.id) === patientProfileId)
      ?? requestableProfiles.find((profile) => String(profile.id) === requestedProfileId);
    setPatientProfileId(requested ? String(requested.id) : requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
    setStep(1);
    setPendingReview(null);
    setConversationId(null);
    setAutoSubmit(false);
    setStreet('');
    setContactPhone(account.phone);
    setIsRequestOpen(true);
    // Evaluarea restantă blochează cererea: o arătăm de la început, nu la trimitere.
    apiRequest<{ data: Array<{ id: string; doctor_name?: string | null }> }>('/patient/reviewable-requests')
      .then((response) => setPendingReview(response.data?.[0] ?? null))
      .catch(() => setPendingReview(null));
  };

  useEffect(() => {
    if (!isRequestOpen || !selectedDoctor || !patientProfileId || !effectiveKind) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreview(null);
    setPreviewLoading(true);
    apiRequest<CostPreview>('/requests/preview', {
      method: 'POST',
      body: JSON.stringify({
        consultation_kind: effectiveKind,
        patient_profile_id: Number(patientProfileId),
        doctor_id: selectedDoctor.id,
        selected_services: effectiveKind === 'with_exam' ? selectedOptionalIds : [],
        points_percent: pointsPercent
      })
    })
      .then((response) => { if (!cancelled) setPreview(response); })
      .catch((err) => { if (!cancelled) setPreview({ eligible: false, message: err instanceof Error ? err.message : 'Costul nu a putut fi calculat.' }); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });

    return () => { cancelled = true; };
  }, [isRequestOpen, selectedDoctor, patientProfileId, effectiveKind, selectedOptionalIds, pointsPercent, previewVersion]);

  const toggleOptional = (id: number) => {
    setSelectedOptionalIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleRequest = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!selectedDoctor || !effectiveKind) return;
    if ((preview?.wallet?.shortfall ?? 0) > 0) {
      await topUpAndResume();
      return;
    }
    if (!patientProfileId) {
      setError('Alege un profil de pacient activ înainte de confirmare.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiRequest<{conversation?: { id: number }}>('/requests', {
        method: 'POST',
        body: JSON.stringify({
          type: effectiveKind === 'video' ? 'video' : 'doctor',
          consultation_kind: effectiveKind,
          patient_profile_id: patientProfileId ? Number(patientProfileId) : null,
          doctor_id: selectedDoctor.id,
          specialty_id: selectedDoctor.specialty_id,
          symptoms,
          current_illness_history: illnessHistory,
          selected_services: effectiveKind === 'with_exam' ? selectedOptionalIds : [],
          points_percent: pointsPercent,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
        })
      });

      clearDraft();
      setConversationId(response.conversation?.id ?? null);
      setIsSuccess(true);
    } catch (err) {
      if (apiErrorCode(err) === 'insufficient_wallet_balance') setPreviewVersion((version) => version + 1);
      setError(err instanceof Error ? err.message : 'Nu am putut trimite solicitarea.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Banii lipsă se alimentează din programare; după plată, MAIB întoarce aici și cererea pleacă singură.
  const topUpAndResume = async () => {
    const shortfall = preview?.wallet?.shortfall ?? 0;
    if (!selectedDoctor || !effectiveKind || shortfall <= 0) return;
    setError('');
    setIsToppingUp(true);
    try {
      saveDraft({ doctorId: String(selectedDoctor.id), patientProfileId, kind: effectiveKind, symptoms, illnessHistory, scheduledAt, selectedOptionalIds, pointsPercent });
      const response = await apiRequest<{ pay?: { payUrl?: string } }>('/wallet/top-up', {
        method: 'POST',
        body: JSON.stringify({ amount: Math.max(10, Math.ceil(shortfall)), return_to: '/patient/doctors?resume=booking' })
      });
      if (!response.pay?.payUrl) throw new Error('Nu am primit linkul de plată.');
      window.location.href = response.pay.payUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut iniția plata.');
      setIsToppingUp(false);
    }
  };

  // Strada și telefonul se cer doar pentru examinarea la domiciliu și se salvează în profil.
  const saveAddressAndContinue = async () => {
    if (!selectedProfile) return;
    if (!street.trim()) { setError('Completează strada și numărul.'); return; }
    if (!contactPhone.trim()) { setError('Completează telefonul de contact.'); return; }
    setError('');
    setSavingAddress(true);
    try {
      await apiRequest(`/patient/profiles/${selectedProfile.id}`, { method: 'PUT', body: JSON.stringify({ address: street.trim() }) });
      if (contactPhone.trim() !== account.phone) {
        await apiRequest('/patient/profile', { method: 'PUT', body: JSON.stringify({ name: account.name, phone: contactPhone.trim() }) });
      }
      await loadProfiles();
      setPreviewVersion((version) => version + 1);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva adresa.');
    } finally {
      setSavingAddress(false);
    }
  };

  const closeRequest = () => {
    setIsRequestOpen(false);
    setSelectedDoctor(null);
    setError('');
    setIsSuccess(false);
  };

  const requestablePatientProfiles = patientProfiles.filter(canRequestConsultation);
  const selectedProfile = requestablePatientProfiles.find((profile) => String(profile.id) === patientProfileId);
  const pinnedProfile = !isRequestOpen || selectedProfile ? selectedProfile : undefined;
  const fromWizard = searchParams.get('from') === 'start';
  const optionalInvestigations = selectedDoctor?.investigation_requirements?.optional ?? [];
  const canContinueStep1 = Boolean(patientProfileId && effectiveKind);
  const needsAddress = effectiveKind === 'with_exam' && Boolean(selectedProfile) && selectedProfile?.has_complete_address === false;
  const missingRegion = needsAddress && (!selectedProfile?.region_id || !selectedProfile?.locality_id);
  const shortfall = preview?.wallet?.shortfall ?? 0;
  const canContinueStep2 = Boolean(symptoms.trim() && scheduledAt);
  const maxPointsPercent = preview?.payment?.max_points_percent ?? 100;

  // Întoarcerea de la MAIB: redeschide programarea la confirmare, cu datele completate.
  useEffect(() => {
    if (resumeHandled.current || isLoading || !profilesLoaded) return;
    const resume = searchParams.get('resume') === 'booking';
    const doctorParam = searchParams.get('doctor');
    if (!resume && !doctorParam) return;
    resumeHandled.current = true;
    const nextParams = new URLSearchParams(searchParams);
    ['resume', 'payment', 'doctor'].forEach((key) => nextParams.delete(key));
    setSearchParams(nextParams, { replace: true });

    if (!resume) {
      const doctor = doctors.find((item) => String(item.id) === doctorParam);
      if (doctor) openRequestDialog(doctor, videoEnabled ? 'video' : 'with_exam');
      return;
    }

    const draft = readDraft();
    const doctor = draft ? doctors.find((item) => String(item.id) === draft.doctorId) : undefined;
    if (!draft || !doctor) return;
    const payment = searchParams.get('payment');
    openRequestDialog(doctor, draft.kind);
    setPatientProfileId(draft.patientProfileId);
    setSymptoms(draft.symptoms);
    setIllnessHistory(draft.illnessHistory);
    setScheduledAt(draft.scheduledAt);
    setSelectedOptionalIds(draft.selectedOptionalIds);
    setPointsPercent(draft.pointsPercent);
    setStep(3);
    if (payment === 'ok') setAutoSubmit(true);
    else if (payment === 'fail') setError('Plata nu a trecut. De pe card nu s-a retras nimic. Poți încerca din nou.');
    else if (payment === 'pending') setError('Banca încă confirmă plata. Apasă din nou peste câteva secunde.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, profilesLoaded, doctors, searchParams]);

  useEffect(() => {
    if (!autoSubmit || previewLoading || !preview || pendingReview) return;
    setAutoSubmit(false);
    if (preview.eligible && (preview.wallet?.shortfall ?? 0) === 0) void handleRequest();
    else if ((preview.wallet?.shortfall ?? 0) > 0) setError('Banca încă confirmă plata. Apasă din nou peste câteva secunde.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, preview, previewLoading, pendingReview]);

  const goNext = () => {
    setError('');
    if (pendingReview) { setError('Evaluează mai întâi consultația anterioară.'); return; }
    if (step === 1 && !canContinueStep1) { setError('Alege pacientul și tipul consultației.'); return; }
    if (step === 1 && needsAddress) { void saveAddressAndContinue(); return; }
    if (step === 2 && !canContinueStep2) { setError('Descrie acuzele și alege data și ora dorită.'); return; }
    setStep((current) => (current < 3 ? (current + 1) as 1 | 2 | 3 : current));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alege un medic"
        description="Compară specialiștii, prețurile și recenziile, apoi programează consultația în trei pași."
      />

      {fromWizard && (
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Pașii de pornire">
          <li className="flex items-center gap-1.5 text-emerald-700"><Check className="h-4 w-4" />Pachet</li>
          <li className="flex items-center gap-1.5 text-emerald-700"><Check className="h-4 w-4" />Pacient</li>
          <li className="flex items-center gap-1.5 font-semibold text-slate-950" aria-current="step"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-xs text-white">3</span>Programare</li>
        </ol>
      )}

      {pinnedProfile && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials(patientProfileName(pinnedProfile))}</AvatarFallback></Avatar>
          <p className="min-w-0 flex-1 truncate text-sm text-slate-600">Pentru <span className="font-semibold text-slate-950">{patientProfileName(pinnedProfile)}</span></p>
          {requestablePatientProfiles.length > 1 ? (
            <Select value={patientProfileId} onValueChange={setPatientProfileId}>
              <SelectTrigger className="h-9 w-auto gap-2 rounded-xl border-0 bg-transparent font-semibold text-primary shadow-none hover:bg-primary/5" aria-label="Schimbă pacientul">Schimbă</SelectTrigger>
              <SelectContent align="end" className="w-56">
                {requestablePatientProfiles.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{patientProfileName(profile)}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Button asChild variant="ghost" size="sm" className="text-primary"><Link to="/patient/profile">Schimbă</Link></Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Caută după numele medicului" aria-label="Caută după numele medicului" className="h-12 pl-10" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Specialitate">
          {[{ id: 'toate', name: 'Toate specialitățile' }, ...specialties.map((item) => ({ id: String(item.id), name: item.name }))].map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={specFilter === item.id}
              onClick={() => setSpecFilter(item.id)}
              className={cn('h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition', specFilter === item.id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')}>
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <ListSkeleton rows={3} /> : filteredDoctors.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={doctors.length === 0 ? 'Nu există medici disponibili momentan' : 'Niciun medic nu corespunde filtrului'}
          description={doctors.length === 0 ? 'Revino puțin mai târziu — medicii noi sunt adăugați după verificare.' : 'Încearcă altă specialitate sau alt nume.'}
          action={doctors.length > 0 && <Button variant="outline" onClick={() => { setSearchTerm(''); setSpecFilter('toate'); }}>Resetează filtrele</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDoctors.map((doctor) => (
            <article key={doctor.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
              <button type="button" className="flex items-start gap-4 text-left" onClick={() => { setDetailDoctor(doctor); setIsDetailOpen(true); }}>
                <Avatar className="size-14 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">{initialsOf(doctor.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-slate-950">{doctor.name}</span>
                  <span className="block text-sm font-medium text-primary">{doctor.specialty || 'Medic'}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(doctor.rating || 0).toFixed(1)}<span className="font-normal text-slate-400">({doctor.reviews_count})</span></span>
                    {doctor.experience_years > 0 && <span className="inline-flex items-center gap-1"><Award className="h-3.5 w-3.5" />{doctor.experience_years} ani experiență</span>}
                  </span>
                </span>
              </button>

              <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
                {withExamEnabled && <PriceRow icon={Home} label="Cu examinare la domiciliu" value={`de la ${doctor.consultation_price} MDL`} />}
                {videoEnabled && <PriceRow icon={Video} label={`Video · ${doctor.video_duration_minutes ?? 10} min`} value={`${doctor.video_price ?? 500} MDL`} />}
                {!withExamEnabled && !videoEnabled && <p className="text-slate-500">Consultațiile sunt momentan dezactivate.</p>}
              </dl>

              <div className="mt-auto flex gap-2 pt-4">
                <Button variant="ghost" className="flex-1" onClick={() => { setDetailDoctor(doctor); setIsDetailOpen(true); }}>Vezi profilul</Button>
                {(withExamEnabled || videoEnabled) && <Button className="flex-1" onClick={() => openRequestDialog(doctor, videoEnabled ? 'video' : 'with_exam')}>Programează</Button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Profilul medicului */}
      <Dialog open={isDetailOpen} onOpenChange={(open) => !open && setIsDetailOpen(false)}>
        <DialogContent className="sm:max-w-[600px]">
          {detailDoctor && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="size-16 shrink-0"><AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initialsOf(detailDoctor.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <DialogTitle className="text-2xl">{detailDoctor.name}</DialogTitle>
                    <DialogDescription className="font-medium text-primary">{detailDoctor.specialty || 'Medic'}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat value={Number(detailDoctor.rating || 0).toFixed(1)} label="rating" />
                  <Stat value={String(detailDoctor.reviews_count)} label="recenzii" />
                  <Stat value={detailDoctor.experience_years ? `${detailDoctor.experience_years} ani` : '—'} label="experiență" />
                </div>
                <div className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm">
                  {withExamEnabled && <PriceRow icon={Home} label="Consultație cu examinare la domiciliu" value={`${detailDoctor.consultation_price} MDL`} />}
                  {videoEnabled && <PriceRow icon={Video} label={`Consultație video · ${detailDoctor.video_duration_minutes ?? 10} min`} value={`${detailDoctor.video_price ?? 500} MDL`} />}
                  {!withExamEnabled && !videoEnabled && <p className="text-slate-500">Consultațiile sunt momentan dezactivate.</p>}
                  {withExamEnabled && <p className="pt-1 text-xs text-slate-500">La examinarea la domiciliu se adaugă investigațiile și deplasarea operatorului. Vezi costul exact înainte de confirmare.</p>}
                </div>
                <InfoList title="Investigații incluse la examinare" items={normalizeList(detailDoctor.required_investigations)} empty="Nu sunt setate." />
                <InfoList title="Servicii oferite" items={normalizeList(detailDoctor.service_catalog)} empty="Nu sunt setate." />
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-900">Recenzii recente</h4>
                  {doctorReviews.length === 0 ? <p className="text-sm text-slate-500">Nu există recenzii încă.</p> : (
                    <ul className="space-y-2">
                      {doctorReviews.slice(0, 4).map((review) => (
                        <li key={review.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                          <span className="flex items-center gap-1">{Array.from({ length: 5 }).map((_, index) => <Star key={index} className={cn('h-3.5 w-3.5', index < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />)}</span>
                          {review.comment && <p className="mt-1 text-slate-700">{review.comment}</p>}
                          {review.patient && <p className="mt-1 text-xs text-slate-400">{review.patient}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Închide</Button>
                {(withExamEnabled || videoEnabled) && <Button onClick={() => { setIsDetailOpen(false); openRequestDialog(detailDoctor, videoEnabled ? 'video' : 'with_exam'); }}>Programează o consultație</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Programarea, în trei pași */}
      <Dialog open={isRequestOpen} onOpenChange={(open) => !open && !isSubmitting && closeRequest()}>
        <DialogContent className="flex flex-col gap-0 p-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-h-[min(92dvh,860px)] sm:max-w-[600px] sm:p-0">
          {selectedDoctor && !isSuccess && (
            <form onSubmit={(event) => { if (step < 3) { event.preventDefault(); goNext(); return; } void handleRequest(event); }} className="flex min-h-0 flex-1 flex-col">
              <DialogHeader className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-5 sm:px-6">
                <DialogTitle>{['Pacient și tip', 'Ce te deranjează și când', 'Confirmă cererea'][step - 1]}</DialogTitle>
                <DialogDescription>Pasul {step} din 3 · {selectedDoctor.name}</DialogDescription>
                <Stepper step={step} />
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                {pendingReview && (
                  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                    <Star className="h-5 w-5 shrink-0 text-orange-500" />
                    <p className="min-w-0 flex-1"><span className="font-semibold">Ai de evaluat consultația{pendingReview.doctor_name ? ` cu ${pendingReview.doctor_name}` : ''}.</span> Evaluarea e necesară înainte de o cerere nouă și durează un minut.</p>
                    <Button asChild type="button" size="sm"><Link to="/patient">Evaluează acum</Link></Button>
                  </div>
                )}

                {step === 1 && (
                  <>
                    <fieldset className="space-y-2">
                      <legend className="mb-2 text-sm font-semibold text-slate-900">Pentru cine este consultația?</legend>
                      {requestablePatientProfiles.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {requestablePatientProfiles.map((profile) => (
                            <ChoiceCard key={profile.id} selected={patientProfileId === String(profile.id)} onSelect={() => setPatientProfileId(String(profile.id))}>
                              <span className="flex items-center gap-3">
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRound className="h-4 w-4" /></span>
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-slate-900">{patientProfileName(profile)}</span>
                                  {(profile.locality || profile.region) && <span className="block truncate text-xs text-slate-500">{profile.locality || profile.region}</span>}
                                </span>
                              </span>
                            </ChoiceCard>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          <p className="flex items-center gap-2 font-semibold text-slate-900"><Lock className="h-4 w-4" />Adaugă mai întâi pacientul</p>
                          <p className="mt-1">Consultația se face pentru un profil de pacient activ (tu sau un membru al familiei). Îl adaugi din „Pacienții mei”.</p>
                          <Button asChild type="button" variant="outline" size="sm" className="mt-3"><Link to="/patient/profile">Deschide Pacienții mei</Link></Button>
                        </div>
                      )}
                    </fieldset>

                    <fieldset className="space-y-2">
                      <legend className="mb-2 text-sm font-semibold text-slate-900">Tipul consultației</legend>
                      {!withExamEnabled && !videoEnabled ? <p className="text-sm text-slate-500">Consultațiile sunt momentan dezactivate.</p> : (
                        <div className="grid gap-2">
                          {withExamEnabled && (
                            <ChoiceCard selected={effectiveKind === 'with_exam'} onSelect={() => setConsultationKind('with_exam')} disabled={!videoEnabled && effectiveKind === 'with_exam'}>
                              <KindOption icon={Home} title="Cu examinare la domiciliu" description="Un operator vine la pacient, face măsurătorile, apoi medicul dă concluzia." price={`de la ${selectedDoctor.consultation_price} MDL`} />
                            </ChoiceCard>
                          )}
                          {videoEnabled && (
                            <ChoiceCard selected={effectiveKind === 'video'} onSelect={() => setConsultationKind('video')} disabled={!withExamEnabled && effectiveKind === 'video'}>
                              <KindOption icon={Video} title="Consultație video" description={`Discuție online cu medicul, ${selectedDoctor.video_duration_minutes ?? 10} minute.`} price={`${selectedDoctor.video_price ?? 500} MDL`} />
                            </ChoiceCard>
                          )}
                        </div>
                      )}
                    </fieldset>

                    {needsAddress && selectedProfile && (
                      <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <legend className="sr-only">Adresa pentru operator</legend>
                        <p className="text-sm font-semibold text-slate-900">Unde vine operatorul?{selectedProfile.locality ? <span className="font-normal text-slate-500"> · {[selectedProfile.locality, selectedProfile.region].filter(Boolean).join(', ')}</span> : null}</p>
                        {missingRegion ? (
                          <p className="text-sm text-amber-800">Profilul nu are raionul și localitatea. <Link to={`/patient/profile?patient_profile=${selectedProfile.id}`} className="font-semibold underline">Completează-le în fișă</Link>, apoi revino.</p>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="booking-street">Strada și numărul</Label>
                              <Input id="booking-street" autoComplete="street-address" placeholder="str. Cartușa 12, ap. 4" value={street} onChange={(event) => setStreet(event.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="booking-phone">Telefon</Label>
                              <Input id="booking-phone" type="tel" autoComplete="tel" placeholder="+373 __ ___ ___" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                              <p className="text-xs text-slate-500">Se salvează în profil, ca să nu le completezi data viitoare.</p>
                            </div>
                          </>
                        )}
                      </fieldset>
                    )}
                  </>
                )}

                {step === 2 && (
                  <>
                    <ConsultationComplaintFields symptomsFirst history={illnessHistory} symptoms={symptoms} onHistoryChange={setIllnessHistory} onSymptomsChange={setSymptoms} />
                    <SlotPicker doctorId={String(selectedDoctor.id)} value={scheduledAt} onChange={setScheduledAt} />
                    {effectiveKind === 'with_exam' && optionalInvestigations.length > 0 && (
                      <fieldset>
                        <legend className="mb-2 text-sm font-semibold text-slate-900">Investigații opționale</legend>
                        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                          {optionalInvestigations.map((investigation) => (
                            <label key={investigation.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-3 text-sm">
                              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={selectedOptionalIds.includes(investigation.id)} onChange={() => toggleOptional(investigation.id)} />
                              <span className="flex-1 text-slate-800">{investigation.name}</span>
                              <span className="tabular text-slate-500">+{investigation.default_price} MDL</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                      <SummaryRow label="Pacient" value={selectedProfile ? patientProfileName(selectedProfile) : '—'} onEdit={() => setStep(1)} />
                      <SummaryRow label="Tip" value={effectiveKind === 'with_exam' ? 'Cu examinare la domiciliu' : 'Consultație video'} onEdit={() => setStep(1)} />
                      <SummaryRow label="Data dorită" value={scheduledAt ? longDateTime(scheduledAt) : '—'} onEdit={() => setStep(2)} />
                      <SummaryRow label="Acuze" value={<span className="line-clamp-2">{symptoms}</span>} onEdit={() => setStep(2)} />
                    </dl>

                    <section className="rounded-xl border border-slate-200 p-4 text-sm">
                      <h3 className="mb-3 font-semibold text-slate-900">Cost</h3>
                      {previewLoading && <ListSkeleton rows={1} />}
                      {!previewLoading && effectiveKind === 'with_exam' && preview?.eligible && preview.cost && (
                        <div className="space-y-1.5">
                          <Row label="Consultația medicului" value={preview.cost.doctor_base} />
                          {preview.cost.investigations.map((line) => (
                            <Row key={line.id} label={`${line.name}${line.requirement === 'optional' ? ' (opțional)' : ''}`} value={line.price} />
                          ))}
                          <Row label="Deplasarea operatorului" value={preview.cost.travel_fee} />
                          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-950"><span>Total</span><span className="tabular">{preview.cost.total} MDL</span></div>
                          {preview.operator?.name && <p className="pt-1 text-xs text-slate-500">Operator asignat: <strong className="text-slate-700">{preview.operator.name}</strong>{preview.operator.region ? ` · ${preview.operator.region}` : ''}</p>}
                        </div>
                      )}
                      {!previewLoading && effectiveKind === 'video' && (
                        <div className="flex items-center justify-between text-base font-semibold text-slate-950"><span>Consultație video · {selectedDoctor.video_duration_minutes ?? 10} min</span><span className="tabular">{preview?.payment?.total ?? selectedDoctor.video_price ?? 500} MDL</span></div>
                      )}
                      {!previewLoading && preview && !preview.eligible && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">{preview.message || 'Verifică datele solicitării înainte de confirmare.'}</p>}
                    </section>

                    {selectedDoctor.accepts_points && preview?.eligible && preview.payment && (
                      <BonusSlider total={preview.payment.total} maxPercent={maxPointsPercent} pointsBalance={preview.wallet?.points_balance ?? 0} percent={pointsPercent} onPercentChange={setPointsPercent} />
                    )}

                    {preview?.eligible && preview.payment && (
                      <section className="space-y-1.5 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
                        <h3 className="mb-1 font-semibold">Cum se achită</h3>
                        <Row label="Din portofelul de bază" value={preview.payment.real_amount} />
                        {preview.payment.points_amount > 0 && <Row label="Din bonusuri" value={preview.payment.points_amount} />}
                        {preview.payment.promo_amount > 0 && <><Row label="Bonus promoțional (automat)" value={preview.payment.promo_amount} /><p className="text-xs text-blue-800">Maximum 50% din tariful medicului eligibil. Examinările și deplasarea se achită separat.</p></>}
                        <p className="pt-1 text-xs text-blue-800">Rezervăm suma din portofel până confirmă medicul și o plătim doar după consultație. Dacă medicul refuză, banii revin în portofel.{preview.wallet && shortfall === 0 ? ` Rămân ${mdl(Math.max(0, preview.wallet.balance - preview.payment.real_amount))} MDL.` : ''}</p>
                      </section>
                    )}

                    {preview?.eligible && preview.wallet && shortfall > 0 && <ShortfallNotice balance={preview.wallet.balance} shortfall={shortfall} />}
                  </>
                )}
              </div>

              <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 sm:px-6">
                {step > 1 ? (
                  <Button type="button" variant="ghost" onClick={() => { setError(''); setStep((current) => (current - 1) as 1 | 2 | 3); }}><ChevronLeft className="h-4 w-4" />Înapoi</Button>
                ) : (
                  <Button type="button" variant="ghost" onClick={closeRequest}>Renunță</Button>
                )}
                {step < 3 ? (
                  <Button type="submit" disabled={step === 1 ? !canContinueStep1 || savingAddress || missingRegion : !canContinueStep2}>{savingAddress ? 'Se salvează…' : 'Continuă'}<ChevronRight className="h-4 w-4" /></Button>
                ) : (
                  <Button type="submit" disabled={isSubmitting || isToppingUp || autoSubmit || !effectiveKind || !patientProfileId || previewLoading || !preview?.eligible}>
                    {isSubmitting || autoSubmit ? 'Se trimite…' : isToppingUp ? 'Se deschide plata…' : shortfall > 0 ? `Alimentează ${mdl(Math.ceil(shortfall))} MDL și trimite cererea` : 'Trimite cererea'}
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
          {selectedDoctor && isSuccess && (
            <div className="space-y-5 overflow-y-auto px-5 py-8 sm:px-6">
              <div className="text-center">
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></span>
                <h2 className="text-2xl font-bold text-slate-950">Cererea a fost trimisă</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Te anunțăm când {selectedDoctor.name} confirmă.</p>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm">
                <Avatar className="h-11 w-11"><AvatarFallback className="bg-primary/10 font-semibold text-primary">{initialsOf(selectedDoctor.name)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-950">{selectedDoctor.name}</p>
                  <p className="text-slate-500">{selectedDoctor.specialty || 'Medic'}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-slate-900">{scheduledAt ? longDateTime(scheduledAt) : 'Cât mai curând'}</p>
                  <p className="text-slate-500">{effectiveKind === 'with_exam' ? 'Cu examinare' : 'Video'}{selectedProfile?.first_name ? ` · pentru ${selectedProfile.first_name}` : ''}</p>
                </div>
              </div>
              {patientProfileId && <PrepareDoctorCard patientProfileId={patientProfileId} />}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                {isEnabled('telegram_notifications') ? <Button asChild variant="ghost"><Link to="/patient/telegram">Primește notificări pe Telegram</Link></Button> : <span />}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {conversationId && <Button variant="outline" onClick={() => navigate(`/patient/chat?conversation=${conversationId}`)}>Deschide mesajele</Button>}
                  <Button onClick={() => navigate('/patient')}>Mergi la Acasă</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STEPS = ['Pacient și tip', 'Detalii', 'Confirmare'];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-4 flex items-center gap-2" aria-label="Pași">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < step;
        const current = number === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold', done ? 'bg-primary text-white' : current ? 'bg-primary/10 text-primary ring-2 ring-primary' : 'bg-slate-100 text-slate-400')}>
              {done ? <Check className="h-3.5 w-3.5" /> : number}
            </span>
            <span className={cn('hidden text-xs font-semibold sm:block', current ? 'text-slate-900' : 'text-slate-400')}>{label}</span>
            {number < STEPS.length && <span className={cn('h-px flex-1', done ? 'bg-primary' : 'bg-slate-200')} />}
          </li>
        );
      })}
    </ol>
  );
}

function ChoiceCard({ selected, onSelect, disabled = false, children }: { selected: boolean; onSelect: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn('relative w-full rounded-xl border p-3.5 text-left transition disabled:cursor-default', selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 bg-white hover:border-slate-300')}>
      {children}
      {selected && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-white"><Check className="h-3 w-3" /></span>}
    </button>
  );
}

function KindOption({ icon: Icon, title, description, price }: { icon: React.ElementType; title: string; description: string; price: string }) {
  return (
    <span className="flex items-start gap-3 pr-6">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold text-slate-900">{title}</span>
          <span className="tabular text-sm font-semibold text-slate-900">{price}</span>
        </span>
        <span className="mt-0.5 block text-sm text-slate-500">{description}</span>
      </span>
    </span>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-slate-900">{value}</dd>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-primary hover:underline">Modifică</button>
    </div>
  );
}

function PriceRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-slate-600"><Icon className="h-4 w-4 text-slate-400" />{label}</dt>
      <dd className="tabular shrink-0 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3">
      <p className="tabular text-lg font-bold text-slate-950">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-slate-600">
      <span>{label}</span>
      <span className="tabular">{value} MDL</span>
    </div>
  );
}

function InfoList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-sm text-slate-500">{empty}</span>}
        {items.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
      </div>
    </div>
  );
}

function initialsOf(name: string) {
  return name.replace(/^dr\.?\s*/i, '').split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'name' in item) return String((item as { name?: unknown }).name || '');
    return '';
  }).filter(Boolean);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function patientProfileName(profile: PatientProfile) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || `Profil #${profile.id}`;
}

function canRequestConsultation(profile: PatientProfile) {
  if (typeof profile.can_request_consultation === 'boolean') return profile.can_request_consultation;
  if (profile.status && profile.status !== 'active') return false;
  if (profile.active_until && new Date(profile.active_until).getTime() <= Date.now()) return false;

  return Boolean(profile.first_name && profile.last_name);
}

function saveDraft(draft: BookingDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* fără stocare: programarea se reia de la început */ }
}

function readDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as BookingDraft) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* opțional */ }
}

function apiErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { code?: unknown } }).data;
    return typeof data?.code === 'string' ? data.code : undefined;
  }
  return undefined;
}
