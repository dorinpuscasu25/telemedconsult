import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageSquare, Search, Star, Video } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

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
  identity_number?: string | null;
  region?: string | null;
  locality?: string | null;
  status?: string | null;
  active_until?: string | null;
  can_request_consultation?: boolean;
  request_unavailable_reason?: string | null;
}

interface DoctorReview {
  id: number;
  patient?: string | null;
  rating: number;
  comment?: string | null;
}

export function DoctorsList() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [specFilter, setSpecFilter] = useState('toate');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [detailDoctor, setDetailDoctor] = useState<Doctor | null>(null);
  const [doctorReviews, setDoctorReviews] = useState<DoctorReview[]>([]);
  const [patientProfileId, setPatientProfileId] = useState('');
  const [consultationKind, setConsultationKind] = useState<'with_exam' | 'video'>('with_exam');
  const [symptoms, setSymptoms] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<CostPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    apiRequest<{data: Doctor[]}>('/catalog/doctors', { auth: false }).then((response) => setDoctors(response.data));
    apiRequest<{data: Specialty[]}>('/catalog/specialties', { auth: false }).then((response) => setSpecialties(response.data));
    apiRequest<{patient_profiles: PatientProfile[]}>('/patient/profile')
      .then((response) => {
        const profiles = response.patient_profiles ?? [];
        const requestableProfiles = profiles.filter(canRequestConsultation);
        setPatientProfiles(profiles);
        setPatientProfileId(requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!detailDoctor || !isDetailOpen) return;
    apiRequest(`/catalog/doctors/${detailDoctor.id}/view`, { method: 'POST', auth: false }).catch(() => undefined);
    apiRequest<{data: DoctorReview[]}>(`/catalog/doctors/${detailDoctor.id}/reviews`, { auth: false })
      .then((response) => setDoctorReviews(response.data))
      .catch(() => setDoctorReviews([]));
  }, [detailDoctor, isDetailOpen]);

  const filteredDoctors = useMemo(() => doctors.filter((doctor) => {
    const matchesSearch = doctor.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpec = specFilter === 'toate' || String(doctor.specialty_id) === specFilter;
    return matchesSearch && matchesSpec;
  }), [doctors, searchTerm, specFilter]);

  const openRequestDialog = (doctor: Doctor, kind: 'with_exam' | 'video' = 'with_exam') => {
    const requestableProfiles = patientProfiles.filter(canRequestConsultation);
    setSelectedDoctor(doctor);
    setConsultationKind(kind);
    setSymptoms('');
    setScheduledAt('');
    setError('');
    setIsSuccess(false);
    setSelectedOptionalIds([]);
    setPreview(null);
    setPatientProfileId(requestableProfiles[0]?.id ? String(requestableProfiles[0].id) : '');
    setIsRequestOpen(true);
  };

  useEffect(() => {
    if (!isRequestOpen || !selectedDoctor || !patientProfileId) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    apiRequest<CostPreview>('/requests/preview', {
      method: 'POST',
      body: JSON.stringify({
        consultation_kind: consultationKind,
        patient_profile_id: Number(patientProfileId),
        doctor_id: selectedDoctor.id,
        selected_services: selectedOptionalIds
      })
    })
      .then((response) => { if (!cancelled) setPreview(response); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });

    return () => { cancelled = true; };
  }, [isRequestOpen, selectedDoctor, patientProfileId, consultationKind, selectedOptionalIds]);

  const toggleOptional = (id: number) => {
    setSelectedOptionalIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDoctor) return;
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
          type: consultationKind === 'video' ? 'video' : 'doctor',
          consultation_kind: consultationKind,
          patient_profile_id: patientProfileId ? Number(patientProfileId) : null,
          doctor_id: selectedDoctor.id,
          specialty_id: selectedDoctor.specialty_id,
          symptoms,
          selected_services: selectedOptionalIds,
          scheduled_at: scheduledAt || null
        })
      });

      if (response.conversation?.id) {
        navigate(`/patient/chat?conversation=${response.conversation.id}`);
        return;
      }
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite solicitarea.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeRequest = () => {
    setIsRequestOpen(false);
    setSelectedDoctor(null);
    setError('');
    setIsSuccess(false);
  };

  const requestablePatientProfiles = patientProfiles.filter(canRequestConsultation);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Găsește un medic</h1>
        <p className="text-slate-500">Alege specialistul, profilul pacientului și tipul consultației.</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Caută după nume..." className="h-12 rounded-xl border-slate-200/60 bg-white/80 pl-10" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        </div>
        <Select value={specFilter} onValueChange={setSpecFilter}>
          <SelectTrigger className="h-12 w-full rounded-xl border-slate-200/60 bg-white/80 sm:w-[220px]">
            <SelectValue placeholder="Specializare" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="toate">Toate specializările</SelectItem>
            {specialties.map((specialty) => (
              <SelectItem key={specialty.id} value={String(specialty.id)}>{specialty.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredDoctors.length === 0 && (
          <Card className="border-slate-200/70 bg-white shadow-sm md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-slate-500">Nu există medici aprobați.</CardContent>
          </Card>
        )}
        {filteredDoctors.map((doctor, index) => (
          <motion.div key={doctor.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <Card className="glass-card flex h-full cursor-pointer flex-col overflow-hidden border-0 transition-shadow hover:shadow-lg" onClick={() => { setDetailDoctor(doctor); setIsDetailOpen(true); }}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                    <AvatarFallback>{doctor.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold leading-tight text-slate-900">{doctor.name}</h3>
                    <p className="text-sm font-medium text-primary">{doctor.specialty || 'Medic'}</p>
                    <p className="mt-1 text-xs text-slate-500">Exp: {doctor.experience_years} ani</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 pb-4">
                <div className="mb-4 flex flex-wrap gap-1">
                  {doctor.platforms.map((platform) => (
                    <Badge key={platform} variant="secondary" className="bg-slate-100 text-[10px] text-slate-600">{platform}</Badge>
                  ))}
                </div>
                <div className="mb-4 flex items-center justify-between text-sm">
                  <div className="flex items-center font-medium text-amber-500">
                    <Star className="mr-1 h-4 w-4 fill-current" />
                    {doctor.rating}
                    <span className="ml-1 font-normal text-slate-400">({doctor.reviews_count})</span>
                  </div>
                  <div className="text-right font-bold text-slate-900">
                    {doctor.consultation_price} MDL
                    <div className="text-xs font-medium text-slate-500">Video {doctor.video_price || 300} MDL</div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2 pt-0">
                <Button className="flex-1 rounded-xl bg-gradient-to-r from-primary to-purple-600" onClick={(event) => { event.stopPropagation(); openRequestDialog(doctor, 'with_exam'); }}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Consultație
                </Button>
                <Button variant="outline" size="icon" className="rounded-xl" onClick={(event) => { event.stopPropagation(); openRequestDialog(doctor, 'video'); }}>
                  <Video className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={isDetailOpen} onOpenChange={(open) => !open && setIsDetailOpen(false)}>
        <DialogContent className="z-50 rounded-2xl border-0 bg-white sm:max-w-[560px]">
          {detailDoctor && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{detailDoctor.name}</DialogTitle>
                <DialogDescription>{detailDoctor.specialty || 'Medic'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-5 py-4">
                <InfoList title="Investigații obligatorii" items={normalizeList(detailDoctor.required_investigations)} empty="Nu sunt setate." />
                <InfoList title="Servicii oferite" items={normalizeList(detailDoctor.service_catalog)} empty="Nu sunt setate." />
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex justify-between text-sm">
                    <span>Consultație cu examinare</span>
                    <strong>{detailDoctor.consultation_price} MDL</strong>
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span>Video / preliminară</span>
                    <strong>{detailDoctor.video_price || 300} MDL</strong>
                  </div>
                </div>
                <InfoList title="Recenzii recente" items={doctorReviews.map((review) => `${review.rating}/5 ${review.comment || ''}`)} empty="Nu există recenzii încă." />
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setIsDetailOpen(false)}>Închide</Button>
                <Button className="rounded-xl" onClick={() => { setIsDetailOpen(false); openRequestDialog(detailDoctor); }}>Solicită consultație</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isRequestOpen} onOpenChange={(open) => !open && closeRequest()}>
        <DialogContent className="z-50 rounded-2xl border-0 bg-white sm:max-w-[540px]">
          {selectedDoctor && !isSuccess && (
            <form onSubmit={handleRequest}>
              <DialogHeader>
                <DialogTitle>Solicită consultație</DialogTitle>
                <DialogDescription>{selectedDoctor.name} • {selectedDoctor.specialty}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-5">
                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                <Field label="Profil pacient">
                  {requestablePatientProfiles.length > 0 ? (
                    <Select value={patientProfileId} onValueChange={setPatientProfileId}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Alege pacientul" /></SelectTrigger>
                      <SelectContent>
                        {requestablePatientProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={String(profile.id)}>
                            {patientProfileName(profile)} {profile.region ? `• ${profile.region}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">Consultația este blocată până activezi un pacient.</p>
                      <p className="mt-1">Ca să poți continua, cumpără un pachet din wallet, apoi adaugă profilul pacientului. Fără pachet activ nu se poate crea pacient și fără pacient nu se poate achita consultația.</p>
                      <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={() => navigate('/patient/profile')}>
                        Cumpără pachet → adaugă pacient
                      </Button>
                    </div>
                  )}
                </Field>
                <Field label="Tip consultație">
                  <Select value={consultationKind} onValueChange={(value) => setConsultationKind(value as 'with_exam' | 'video')}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="with_exam">Cu examinare la domiciliu</SelectItem>
                      <SelectItem value="video">Video / preliminară</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Descrie problema">
                  <Textarea value={symptoms} onChange={(event) => setSymptoms(event.target.value)} required className="min-h-[120px] rounded-xl" />
                </Field>
                <Field label="Data și ora preferată">
                  <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required className="rounded-xl" />
                </Field>
                {consultationKind === 'with_exam' && (selectedDoctor.investigation_requirements?.optional?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Investigații opționale</p>
                    <div className="space-y-1">
                      {(selectedDoctor.investigation_requirements?.optional ?? []).map((investigation) => (
                        <label key={investigation.id} className="flex items-center justify-between gap-3 text-sm text-slate-600">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedOptionalIds.includes(investigation.id)}
                              onChange={() => toggleOptional(investigation.id)}
                            />
                            {investigation.name}
                          </span>
                          <span className="text-slate-400">{investigation.default_price} MDL</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {consultationKind === 'with_exam' ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    {previewLoading && <p className="text-slate-500">Se calculează costul...</p>}
                    {!previewLoading && preview && !preview.eligible && (
                      <p className="font-medium text-amber-700">{preview.message}</p>
                    )}
                    {!previewLoading && preview?.eligible && preview.cost && (
                      <div className="space-y-1.5">
                        {preview.operator?.name && (
                          <p className="text-slate-600">Operator asignat: <strong className="text-slate-900">{preview.operator.name}</strong>{preview.operator.region ? ` • ${preview.operator.region}` : ''}</p>
                        )}
                        <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                          <Row label="Consultație medic" value={preview.cost.doctor_base} />
                          {preview.cost.investigations.map((line) => (
                            <Row key={line.id} label={`${line.name}${line.requirement === 'optional' ? ' (opțional)' : ''}`} value={line.price} />
                          ))}
                          <Row label="Deplasare operator" value={preview.cost.travel_fee} />
                          <div className="flex items-center justify-between border-t border-slate-300 pt-1.5 text-base font-semibold text-slate-900">
                            <span>Total</span><span>{preview.cost.total} MDL</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
                    Cost estimat: <strong>{selectedDoctor.video_price || 300} MDL</strong>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="rounded-xl" onClick={closeRequest}>Anulare</Button>
                <Button
                  disabled={isSubmitting || !patientProfileId || (consultationKind === 'with_exam' && (previewLoading || preview?.eligible === false))}
                  className="rounded-xl"
                >
                  {isSubmitting ? 'Se trimite...' : 'Confirmă și achită'}
                </Button>
              </DialogFooter>
            </form>
          )}
          {selectedDoctor && isSuccess && (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
              <h2 className="mb-2 text-2xl font-bold text-slate-900">Solicitare trimisă</h2>
              <p className="mb-5 text-slate-500">Cererea a fost salvată.</p>
              <Button onClick={() => navigate('/patient/chat')} className="rounded-xl">Deschide chat</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span>{value} MDL</span>
    </div>
  );
}

function InfoList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h4 className="mb-2 font-semibold text-slate-900">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-sm text-slate-500">{empty}</span>}
        {items.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
      </div>
    </div>
  );
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'name' in item) return String((item as { name?: unknown }).name || '');
    return '';
  }).filter(Boolean);
}

function patientProfileName(profile: PatientProfile) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || `Profil #${profile.id}`;
}

function canRequestConsultation(profile: PatientProfile) {
  if (typeof profile.can_request_consultation === 'boolean') return profile.can_request_consultation;
  if (profile.status && profile.status !== 'active') return false;
  if (profile.active_until && new Date(profile.active_until).getTime() <= Date.now()) return false;

  return Boolean(profile.first_name && profile.last_name && profile.identity_number);
}
