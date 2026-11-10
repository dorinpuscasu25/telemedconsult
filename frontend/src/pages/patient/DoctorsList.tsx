import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, CreditCard, Home, Info, Lock, MapPin, Send, Star, Stethoscope, Video, X } from 'lucide-react';
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
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
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
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
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

  const patientPicker = (className: string) => pinnedProfile && (
    <Select value={patientProfileId} onValueChange={setPatientProfileId}>
      <SelectTrigger aria-label="Schimbă pacientul" className={cn('h-12 gap-2.5 rounded-[10px] border border-slate-200 bg-white px-3 text-left shadow-none [&>svg:last-child]:hidden', className)}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-600">{initials(patientProfileName(pinnedProfile))}</span>
        <span className="flex min-w-0 flex-1 flex-col"><span className="text-[11px] text-slate-500">Pentru</span><span className="truncate text-sm font-medium text-slate-950">{patientProfileName(pinnedProfile)}</span></span>
        <span className="text-[13px] font-medium text-blue-600 lg:hidden">Schimbă</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </SelectTrigger>
      <SelectContent align="end" className="w-64">
        {requestablePatientProfiles.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{patientProfileName(profile)}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col">
      {/* 5a / 5b: în asistent, bara cu pașii ține locul antetului. */}
      {fromWizard && (
        <div className="-mx-4 -mt-5 border-b border-slate-200 bg-white px-5 pb-0 pt-[calc(16px+env(safe-area-inset-top))] lg:-mx-8 lg:-mt-7 lg:flex lg:h-[68px] lg:items-center lg:px-8 lg:pt-0">
          <ol className="grid grid-cols-3 gap-1.5 lg:flex lg:w-[420px] lg:gap-2.5" aria-label="Pașii de pornire">
            {['Pachet', 'Pacient', 'Programare'].map((label, index) => (
              <li key={label} className="flex flex-col gap-1.5 lg:flex-1" aria-current={index === 2 ? 'step' : undefined}>
                <span className="h-1 rounded-sm bg-blue-600" />
                <span className="text-xs font-semibold text-blue-600">{index < 2 ? `✓ ${label}` : <><span className="lg:hidden">{label}</span><span className="hidden lg:inline">3 · {label}</span></>}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Telefon: blocul alb de sus. Desktop: titlul în stânga, pacientul în dreapta. */}
      <div className={cn('-mx-4 flex flex-col gap-4 border-b border-slate-200 bg-white px-5 pb-4 pt-4 lg:mx-0 lg:flex-row lg:items-end lg:justify-between lg:border-0 lg:bg-transparent lg:p-0', fromWizard ? 'lg:pt-8' : '-mt-5 lg:mt-0')}>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold leading-[1.2] tracking-tight text-slate-950 lg:text-[28px]">Alege medicul</h1>
          <span className="hidden text-sm text-slate-500 lg:block">Prețurile sunt pentru o consultație.</span>
        </div>
        {patientPicker('w-full lg:h-[46px] lg:w-[300px]')}
      </div>

      {isLoading ? <div className="pt-4 lg:pt-6"><ListSkeleton rows={3} /></div> : doctors.length === 0 ? (
        <div className="pt-4 lg:pt-6">
          <EmptyState icon={Stethoscope} title="Nu există medici disponibili momentan" description="Revino puțin mai târziu — medicii noi sunt adăugați după verificare." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 pt-4 lg:grid-cols-2 lg:gap-4 lg:pt-6">
          {doctors.map((doctor) => {
            const exam = withExamEnabled ? `${doctor.consultation_price} MDL` : null;
            const video = videoEnabled ? `${doctor.video_price ?? 500} MDL` : null;
            const book = () => openRequestDialog(doctor, videoEnabled ? 'video' : 'with_exam');
            return (
              <article key={doctor.id} className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 lg:gap-4 lg:p-5">
                <button type="button" className="flex items-center gap-3 text-left lg:gap-3.5" onClick={() => { setDetailDoctor(doctor); setIsDetailOpen(true); }}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-200 text-[15px] font-semibold text-slate-700 lg:h-[52px] lg:w-[52px] lg:text-base">{initialsOf(doctor.name)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-semibold text-slate-950">{doctor.name}</span>
                    <span className="truncate text-[13px] text-slate-500">{doctor.specialty || 'Medic'}<span className="hidden lg:inline">{doctor.experience_years > 0 ? ` · ${doctor.experience_years} ani experiență` : ''}</span></span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-slate-950"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{Number(doctor.rating || 0).toFixed(1)}<span className="text-xs font-normal text-slate-400">({doctor.reviews_count})</span></span>
                </button>
                <div className="grid grid-cols-2 gap-2 lg:flex lg:items-stretch lg:gap-2.5">
                  {video && <PriceTile label="Video" value={video} />}
                  {exam && <PriceTile label="Cu examinare acasă" value={exam} />}
                  {(video || exam) && <button type="button" onClick={book} className="hidden rounded-[10px] bg-blue-600 px-[18px] text-sm font-semibold text-white hover:bg-blue-700 lg:block">Programează</button>}
                </div>
                {(video || exam) && <button type="button" onClick={book} className="h-11 rounded-[10px] bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 lg:hidden">Programează</button>}
                {!video && !exam && <p className="text-sm text-slate-500">Consultațiile sunt momentan dezactivate.</p>}
              </article>
            );
          })}
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

      {/* Programarea, în trei pași (6a–6g, W4): ecran întreg pe telefon, dialog pe desktop. */}
      <Dialog open={isRequestOpen} onOpenChange={(open) => !open && !isSubmitting && closeRequest()}>
        <DialogContent className="flex flex-col gap-0 p-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-h-[min(92dvh,860px)] sm:max-w-[560px] sm:p-0 [&>button:last-child]:hidden">
          {selectedDoctor && !isSuccess && (
            <form onSubmit={(event) => { if (step < 3) { event.preventDefault(); goNext(); return; } void handleRequest(event); }} className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-col gap-3.5 border-b border-slate-100 px-5 pb-3.5 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {step > 1 && <button type="button" aria-label="Înapoi" onClick={() => { setError(''); setStep((current) => (current - 1) as 1 | 2 | 3); }} className="-ml-1.5 grid h-10 w-8 place-items-center text-slate-700 sm:hidden"><ChevronLeft className="h-5 w-5" /></button>}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <DialogDescription className="text-xs text-slate-500">Pasul {step} din 3{step > 1 ? ` · ${selectedDoctor.name}` : ''}</DialogDescription>
                      <DialogTitle className="truncate text-base font-semibold text-slate-950">{step === 1 ? selectedDoctor.name : step === 2 ? 'Ce te deranjează și când' : 'Confirmă cererea'}</DialogTitle>
                    </div>
                  </div>
                  <button type="button" onClick={closeRequest} aria-label="Închide" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><X className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-3 gap-1" aria-hidden="true">
                  {[1, 2, 3].map((item) => <span key={item} className={cn('h-1 rounded-sm', item <= step ? 'bg-blue-600' : 'bg-slate-200')} />)}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-[22px]">
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
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-slate-900">Pacient</span>
                      {requestablePatientProfiles.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                          <p className="flex items-center gap-2 font-semibold text-slate-900"><Lock className="h-4 w-4" />Adaugă mai întâi pacientul</p>
                          <Button asChild type="button" variant="outline" size="sm" className="mt-3"><Link to="/patient/start">Adaugă pacientul</Link></Button>
                        </div>
                      ) : requestablePatientProfiles.length === 1 ? (
                        <div className="flex h-11 items-center rounded-[10px] border border-slate-200 px-3 text-[15px] text-slate-900">{patientProfileName(requestablePatientProfiles[0])}</div>
                      ) : (
                        <Select value={patientProfileId} onValueChange={setPatientProfileId}>
                          <SelectTrigger className="h-11 rounded-[10px] text-[15px]">{selectedProfile ? patientProfileName(selectedProfile) : <span className="text-muted-foreground">Alege pacientul</span>}</SelectTrigger>
                          <SelectContent>{requestablePatientProfiles.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{patientProfileName(profile)}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>

                    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Tipul consultației">
                      <span className="text-sm font-medium text-slate-900">Tipul consultației</span>
                      {!withExamEnabled && !videoEnabled && <p className="text-sm text-slate-500">Consultațiile sunt momentan dezactivate.</p>}
                      {videoEnabled && (
                        <KindCard selected={effectiveKind === 'video'} onSelect={() => setConsultationKind('video')} title="Video" description="Discuți cu medicul de acasă, pe telefon sau calculator." price={`${selectedDoctor.video_price ?? 500} MDL`} />
                      )}
                      {withExamEnabled && (
                        <KindCard selected={effectiveKind === 'with_exam'} onSelect={() => setConsultationKind('with_exam')} title="Cu examinare la domiciliu" description="Vine un operator cu aparatul medical, apoi medicul dă concluzia." price={`${selectedDoctor.consultation_price} MDL`}>
                          {needsAddress && selectedProfile && (
                            <div className="flex flex-col gap-3 border-t border-blue-100 p-3.5">
                              <p className="flex items-center gap-1.5 text-[13px] text-slate-600"><MapPin className="h-4 w-4" />Unde vine operatorul?{selectedProfile.locality ? ` ${[selectedProfile.locality, selectedProfile.region].filter(Boolean).join(', ')}` : ''}</p>
                              {missingRegion ? (
                                <p className="text-sm text-amber-800">Profilul nu are raionul și localitatea. <Link to={`/patient/patients/${selectedProfile.id}`} className="font-semibold underline">Completează-le în fișă</Link>, apoi revino.</p>
                              ) : (
                                <>
                                  <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-slate-900">Strada și numărul</span><Input autoComplete="street-address" placeholder="str. Cartușa 12, ap. 4" value={street} onChange={(event) => setStreet(event.target.value)} className="h-11 rounded-[10px] text-[15px]" /></label>
                                  <label className="flex flex-col gap-1.5"><span className="text-sm font-medium text-slate-900">Telefon</span><Input type="tel" autoComplete="tel" placeholder="+373 __ ___ ___" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="h-11 rounded-[10px] text-[15px]" /></label>
                                  <span className="text-xs text-slate-500">Se salvează în profil, ca să nu le completezi data viitoare.</span>
                                </>
                              )}
                            </div>
                          )}
                        </KindCard>
                      )}
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <ConsultationComplaintFields symptomsFirst history={illnessHistory} symptoms={symptoms} onHistoryChange={setIllnessHistory} onSymptomsChange={setSymptoms} />
                    <SlotPicker doctorId={String(selectedDoctor.id)} value={scheduledAt} onChange={setScheduledAt} />
                    {effectiveKind === 'with_exam' && optionalInvestigations.length > 0 && (
                      <fieldset>
                        <legend className="mb-2 text-sm font-medium text-slate-900">Investigații opționale</legend>
                        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                          {optionalInvestigations.map((investigation) => (
                            <label key={investigation.id} className="flex cursor-pointer items-center gap-3 px-3.5 py-3 text-sm">
                              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={selectedOptionalIds.includes(investigation.id)} onChange={() => toggleOptional(investigation.id)} />
                              <span className="flex-1 text-slate-800">{investigation.name}</span>
                              <span className="tabular-nums text-slate-500">+{investigation.default_price} MDL</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">{initialsOf(selectedDoctor.name)}</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-slate-950">{selectedDoctor.name} · {effectiveKind === 'with_exam' ? 'Cu examinare' : 'Video'}</span>
                        <span className="text-[13px] text-slate-500">{[scheduledAt ? capitalize(longDateTime(scheduledAt)) : 'Cât mai curând', effectiveKind === 'with_exam' && selectedProfile?.address ? selectedProfile.address : selectedProfile?.first_name ? `pentru ${selectedProfile.first_name}` : null].filter(Boolean).join(' · ')}</span>
                      </div>
                    </div>

                    {previewLoading ? <ListSkeleton rows={2} /> : preview && !preview.eligible ? (
                      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{preview.message || 'Verifică datele solicitării înainte de confirmare.'}</p>
                    ) : preview?.eligible && preview.payment && (
                      <>
                        <div className="flex flex-col rounded-2xl border border-slate-200">
                          {effectiveKind === 'with_exam' && preview.cost ? (
                            <>
                              <CostLine label="Consultația medicului" value={preview.cost.doctor_base} first />
                              {preview.cost.investigations.map((line) => <CostLine key={line.id} label={`${line.name}${line.requirement === 'optional' ? ' (opțional)' : ''}`} value={line.price} />)}
                              <CostLine label="Deplasarea operatorului" value={preview.cost.travel_fee} />
                            </>
                          ) : (
                            <CostLine label={`Consultație video${selectedDoctor.video_duration_minutes ? ` · ${selectedDoctor.video_duration_minutes} min` : ''}`} value={preview.payment.total} first />
                          )}
                          {preview.payment.promo_amount > 0 && <CostLine label="Bonus promoțional (automat)" value={-preview.payment.promo_amount} accent />}
                          <div className="flex justify-between border-t border-slate-200 px-4 py-3.5 text-base font-semibold text-slate-950"><span>Total</span><span className="tabular-nums">{mdl(preview.payment.total)} MDL</span></div>
                          {shortfall > 0 && preview.wallet && <div className="flex justify-between px-4 pb-3.5 text-sm text-slate-600"><span>În portofel</span><span className="tabular-nums">{mdl(preview.wallet.balance)} MDL</span></div>}
                        </div>

                        {selectedDoctor.accepts_points && (
                          <BonusSlider total={preview.payment.total} realAmount={preview.payment.real_amount} maxPercent={maxPointsPercent} pointsBalance={preview.wallet?.points_balance ?? 0} percent={pointsPercent} onPercentChange={setPointsPercent} doctorName={selectedDoctor.name} />
                        )}

                        {shortfall > 0 && preview.wallet ? (
                          <ShortfallNotice shortfall={shortfall} />
                        ) : (
                          <div className="flex gap-2.5 rounded-xl bg-blue-50 px-3.5 py-3 text-[13px] leading-[1.45] text-blue-950">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                            <span>Rezervăm {mdl(preview.payment.real_amount)} MDL din Bani{preview.payment.points_amount > 0 ? ` și ${mdl(preview.payment.points_amount)} bonusuri` : ''} până după consultație. Dacă medicul refuză sau se anulează, revin în portofel.{preview.wallet ? ` Rămân ${mdl(Math.max(0, preview.wallet.balance - preview.payment.real_amount))} MDL.` : ''}</span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="flex shrink-0 gap-2 border-t border-slate-100 px-5 py-4">
                {step > 1 && <Button type="button" variant="outline" className="hidden h-12 sm:inline-flex" onClick={() => { setError(''); setStep((current) => (current - 1) as 1 | 2 | 3); }}>Înapoi</Button>}
                {step < 3 ? (
                  <Button type="submit" className="h-12 flex-1 text-[15px] font-semibold sm:ml-auto sm:flex-none sm:px-8" disabled={step === 1 ? !canContinueStep1 || savingAddress || missingRegion : !canContinueStep2}>{savingAddress ? 'Se salvează…' : 'Continuă'}</Button>
                ) : (
                  <Button type="submit" className="h-12 flex-1 text-[15px] font-semibold sm:ml-auto sm:flex-none sm:px-6" disabled={isSubmitting || isToppingUp || autoSubmit || !effectiveKind || !patientProfileId || previewLoading || !preview?.eligible}>
                    {shortfall > 0 && !isSubmitting && !isToppingUp && !autoSubmit && <CreditCard className="h-4 w-4" />}
                    {isSubmitting || autoSubmit ? 'Se trimite…' : isToppingUp ? 'Se deschide plata…' : shortfall > 0 ? `Alimentează ${mdl(Math.ceil(shortfall))} MDL și trimite cererea` : 'Trimite cererea'}
                  </Button>
                )}
              </div>
            </form>
          )}
          {selectedDoctor && isSuccess && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="flex justify-end px-3 pt-3"><button type="button" onClick={closeRequest} aria-label="Închide" className="grid h-10 w-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
              <div className="flex flex-1 flex-col gap-[22px] px-5 pb-8 pt-3">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-green-50 text-green-600"><Check className="h-6 w-6" /></span>
                <div className="flex flex-col gap-2">
                  <DialogTitle className="text-[26px] font-bold leading-[1.2] tracking-tight">Cererea a fost trimisă</DialogTitle>
                  <DialogDescription className="text-[15px] leading-normal text-slate-500">Te anunțăm când {selectedDoctor.name} confirmă.</DialogDescription>
                </div>
                <div className="flex flex-col rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">{initialsOf(selectedDoctor.name)}</span>
                    <span className="flex flex-col gap-0.5"><span className="text-[15px] font-semibold text-slate-950">{selectedDoctor.name}</span><span className="text-[13px] text-slate-500">{selectedDoctor.specialty || 'Medic'}</span></span>
                  </div>
                  <div className="flex justify-between gap-3 px-4 py-3 text-sm"><span className="text-slate-500">Când</span><span className="text-right font-medium text-slate-900">{scheduledAt ? capitalize(longDateTime(scheduledAt)) : 'Cât mai curând'}</span></div>
                  <div className="flex justify-between gap-3 px-4 pb-3 text-sm"><span className="text-slate-500">Tip</span><span className="font-medium text-slate-900">{effectiveKind === 'with_exam' ? 'Cu examinare' : 'Video'}{selectedProfile?.first_name ? ` · pentru ${selectedProfile.first_name}` : ''}</span></div>
                </div>
                {patientProfileId && <PrepareDoctorCard patientProfileId={patientProfileId} />}
                <div className="min-h-2 flex-1" />
                <div className="flex flex-col gap-2.5">
                  {isEnabled('telegram_notifications')
                    ? <Button asChild className="h-12 text-[15px] font-semibold"><Link to="/patient/telegram"><Send className="h-4 w-4" />Primește notificări pe Telegram</Link></Button>
                    : conversationId && <Button className="h-12 text-[15px] font-semibold" onClick={() => navigate(`/patient/chat?conversation=${conversationId}`)}>Deschide mesajele</Button>}
                  <button type="button" onClick={() => navigate('/patient')} className="p-2.5 text-center text-sm text-slate-600 hover:text-slate-900">Mergi la Acasă</button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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

/** Tipul consultației ca buton radio, cu prețul în dreapta; varianta aleasă poate cere date în plus (adresa). */
function KindCard({ selected, onSelect, title, description, price, children }: { selected: boolean; onSelect: () => void; title: string; description: string; price: string; children?: React.ReactNode }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl', selected ? 'border-[1.5px] border-blue-600' : 'border border-slate-200')}>
      <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={cn('flex w-full items-start gap-3 p-3.5 text-left', selected && 'bg-blue-50')}>
        <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px]', selected ? 'border-blue-600' : 'border-slate-300')}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-semibold text-slate-950">{title}</span><span className={cn('text-[13px] leading-[1.4]', selected ? 'text-slate-600' : 'text-slate-500')}>{description}</span></span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-slate-950">{price}</span>
      </button>
      {selected && children}
    </div>
  );
}

function CostLine({ label, value, first = false, accent = false }: { label: string; value: number; first?: boolean; accent?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 px-4 py-3 text-sm', !first && 'border-t border-slate-100')}>
      <span className="text-slate-600">{label}</span>
      <span className={cn('tabular-nums', accent ? 'text-green-600' : 'text-slate-900')}>{value < 0 ? '−' : ''}{mdl(Math.abs(value))} MDL</span>
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function PriceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-slate-50 px-3 py-2.5 lg:flex-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-[15px] font-semibold text-slate-950">{value}</span>
    </div>
  );
}
