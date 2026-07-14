import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Plus, Trash2, Video } from 'lucide-react';
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
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

interface Specialty {
  id: number;
  name: string;
}

interface Platform {
  name: string;
  value: string;
}

interface DoctorProfileResponse {
  user: {
    name: string;
    email: string;
    phone?: string | null;
  };
  profile?: {
    specialty_id?: number | null;
    license_number?: string | null;
    bio?: string | null;
    experience_years?: number | null;
    consultation_price?: number | null;
    video_price?: number | null;
    video_duration_minutes?: number | null;
    google_meet_account?: string | null;
    service_catalog?: Array<{ name: string }> | null;
    required_investigations?: Array<{ name: string }> | null;
    required_investigation_ids?: number[] | null;
    optional_investigation_ids?: number[] | null;
    platforms?: Platform[] | null;
    is_available?: boolean;
  } | null;
  vacations: Vacation[];
  availability: AvailabilitySlot[];
  specialties: Specialty[];
}

interface CatalogInvestigation {
  id: number;
  name: string;
  default_price: number;
  requires_device: boolean;
}

interface Vacation {
  id: number;
  starts_on: string;
  ends_on: string;
  reason?: string | null;
}

interface AvailabilitySlot {
  id?: number;
  weekday: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

const weekdays = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const defaultAvailability: AvailabilitySlot[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  starts_at: '09:00',
  ends_at: '18:00',
  is_active: true
}));

export function DoctorProfilePage() {
  const [searchParams] = useSearchParams();
  const vacationsCardRef = useRef<HTMLDivElement | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    specialty_id: '',
    license_number: '',
    bio: '',
    experience_years: 0,
    consultation_price: 0,
    video_price: 300,
    video_duration_minutes: 15,
    google_meet_account: '',
    service_catalog_text: '',
    required_investigation_ids: [] as number[],
    optional_investigation_ids: [] as number[],
    is_available: true
  });
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [investigationsCatalog, setInvestigationsCatalog] = useState<CatalogInvestigation[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(defaultAvailability);
  const [vacationForm, setVacationForm] = useState({
    starts_on: '',
    ends_on: '',
    reason: ''
  });
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>({ name: '', value: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadProfile = () => {
    apiRequest<DoctorProfileResponse>('/doctor/profile').then((response) => {
      setSpecialties(response.specialties);
      setForm({
        name: response.user.name || '',
        email: response.user.email || '',
        phone: response.user.phone || '',
        specialty_id: response.profile?.specialty_id ? String(response.profile.specialty_id) : '',
        license_number: response.profile?.license_number || '',
        bio: response.profile?.bio || '',
        experience_years: response.profile?.experience_years ?? 0,
        consultation_price: response.profile?.consultation_price ?? 0,
        video_price: response.profile?.video_price ?? 300,
        video_duration_minutes: response.profile?.video_duration_minutes ?? 15,
        google_meet_account: response.profile?.google_meet_account ?? '',
        service_catalog_text: (response.profile?.service_catalog ?? []).map((item) => item.name).join('\n'),
        required_investigation_ids: response.profile?.required_investigation_ids ?? [],
        optional_investigation_ids: response.profile?.optional_investigation_ids ?? [],
        is_available: response.profile?.is_available ?? true
      });
      setPlatforms(response.profile?.platforms ?? []);
      setVacations(response.vacations ?? []);
      setAvailability((response.availability?.length ? response.availability : defaultAvailability).map((slot) => ({
        ...slot,
        starts_at: slot.starts_at.slice(0, 5),
        ends_at: slot.ends_at.slice(0, 5)
      })));
    });
  };

  useEffect(() => {
    loadProfile();
    apiRequest<{ data: CatalogInvestigation[] }>('/catalog/investigations', { auth: false })
      .then((response) => setInvestigationsCatalog(response.data ?? []))
      .catch(() => setInvestigationsCatalog([]));
  }, []);

  const investigationState = (id: number): 'none' | 'required' | 'optional' =>
    form.required_investigation_ids.includes(id)
      ? 'required'
      : form.optional_investigation_ids.includes(id)
        ? 'optional'
        : 'none';

  const setInvestigationState = (id: number, state: 'none' | 'required' | 'optional') => {
    setForm((current) => ({
      ...current,
      required_investigation_ids: state === 'required'
        ? Array.from(new Set([...current.required_investigation_ids, id]))
        : current.required_investigation_ids.filter((item) => item !== id),
      optional_investigation_ids: state === 'optional'
        ? Array.from(new Set([...current.optional_investigation_ids, id]))
        : current.optional_investigation_ids.filter((item) => item !== id)
    }));
  };

  useEffect(() => {
    if (searchParams.get('vacations') !== '1') return;

    const today = new Date().toISOString().slice(0, 10);
    setVacationForm((current) => ({
      ...current,
      starts_on: current.starts_on || today,
      ends_on: current.ends_on || today
    }));

    window.setTimeout(() => {
      vacationsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, [searchParams]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    try {
      await apiRequest('/doctor/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          specialty_id: form.specialty_id ? Number(form.specialty_id) : null,
          experience_years: Number(form.experience_years),
          consultation_price: Number(form.consultation_price),
          video_price: Number(form.video_price),
          video_duration_minutes: Number(form.video_duration_minutes),
          google_meet_account: form.google_meet_account || null,
          service_catalog: textToItems(form.service_catalog_text),
          required_investigation_ids: form.required_investigation_ids,
          optional_investigation_ids: form.optional_investigation_ids,
          platforms
        })
      });
      setMessage('Profilul medicului a fost salvat.');
      loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva profilul.');
    }
  };

  const addPlatform = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPlatform.name || !newPlatform.value) return;
    setPlatforms([...platforms, newPlatform]);
    setNewPlatform({ name: '', value: '' });
    setIsPlatformModalOpen(false);
  };

  const addVacation = async () => {
    setError('');
    setMessage('');

    try {
      await apiRequest('/doctor/vacations', {
        method: 'POST',
        body: JSON.stringify({
          starts_on: vacationForm.starts_on,
          ends_on: vacationForm.ends_on,
          reason: vacationForm.reason || null
        })
      });
      setVacationForm({ starts_on: '', ends_on: '', reason: '' });
      setMessage('Concediul a fost adăugat.');
      loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut adăuga concediul.');
    }
  };

  const deleteVacation = async (vacation: Vacation) => {
    if (!window.confirm('Ștergi acest interval de concediu?')) return;

    setError('');
    setMessage('');

    try {
      await apiRequest(`/doctor/vacations/${vacation.id}`, {
        method: 'DELETE'
      });
      setMessage('Concediul a fost șters.');
      loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge concediul.');
    }
  };

  const saveAvailability = async () => {
    setError('');
    setMessage('');
    try {
      const response = await apiRequest<{message: string; availability: AvailabilitySlot[]}>('/doctor/availability', {
        method: 'PUT',
        body: JSON.stringify({ slots: availability })
      });
      setAvailability(response.availability.map((slot) => ({
        ...slot,
        starts_at: slot.starts_at.slice(0, 5),
        ends_at: slot.ends_at.slice(0, 5)
      })));
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva programul.');
    }
  };

  const updateAvailabilitySlot = (index: number, patch: Partial<AvailabilitySlot>) => {
    setAvailability((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Profil medic</h1>
          <p className="mt-1 text-sm text-slate-500">Date publice și setări salvate în backend.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
          <Label htmlFor="available-mode" className="cursor-pointer font-medium">
            Disponibil pentru consultații
          </Label>
          <Switch
            id="available-mode"
            checked={form.is_available}
            onCheckedChange={(value) => setForm({ ...form, is_available: value })}
          />
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <form onSubmit={saveProfile} className="grid gap-6 lg:grid-cols-[1.3fr_0.8fr]">
        <Card ref={vacationsCardRef} className="scroll-mt-24 border-slate-200/70 bg-white shadow-sm ring-primary/0 transition-shadow">
          <CardHeader>
            <CardTitle>Informații publice</CardTitle>
            <CardDescription>Aceste date sunt afișate pacienților în catalog.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nume complet">
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="h-11 rounded-xl" />
              </Field>
              <Field label="Email">
                <Input value={form.email} disabled className="h-11 rounded-xl bg-slate-50" />
              </Field>
              <Field label="Telefon">
                <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="h-11 rounded-xl" />
              </Field>
              <Field label="Specializare">
                <Select value={form.specialty_id || 'none'} onValueChange={(value) => setForm({ ...form, specialty_id: value === 'none' ? '' : value })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Neselectat</SelectItem>
                    {specialties.map((specialty) => (
                      <SelectItem key={specialty.id} value={String(specialty.id)}>{specialty.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Număr licență">
                <Input value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} className="h-11 rounded-xl" />
              </Field>
              <Field label="Experiență (ani)">
                <Input type="number" min={0} value={form.experience_years} onChange={(event) => setForm({ ...form, experience_years: Number(event.target.value) })} className="h-11 rounded-xl" />
              </Field>
              <Field label="Preț consultație (MDL)">
                <Input type="number" min={0} value={form.consultation_price} onChange={(event) => setForm({ ...form, consultation_price: Number(event.target.value) })} className="h-11 rounded-xl" />
              </Field>
              <Field label="Preț video (MDL)">
                <Input type="number" min={0} value={form.video_price} onChange={(event) => setForm({ ...form, video_price: Number(event.target.value) })} className="h-11 rounded-xl" />
              </Field>
              <Field label="Durată video (min)">
                <Input type="number" min={5} value={form.video_duration_minutes} onChange={(event) => setForm({ ...form, video_duration_minutes: Number(event.target.value) })} className="h-11 rounded-xl" />
              </Field>
              <Field label="Cont Gmail / Meet">
                <Input value={form.google_meet_account} onChange={(event) => setForm({ ...form, google_meet_account: event.target.value })} className="h-11 rounded-xl" />
              </Field>
            </div>
            <Field label="Descriere / spectru de probleme">
              <Textarea value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} className="min-h-32 rounded-xl" />
            </Field>
            <Field label="Servicii oferite (unul pe linie)">
              <Textarea value={form.service_catalog_text} onChange={(event) => setForm({ ...form, service_catalog_text: event.target.value })} className="min-h-24 rounded-xl" />
            </Field>
            <Field label="Investigații pentru consultația cu examinare">
              <p className="mb-2 text-xs text-slate-500">Alege din catalog ce se efectuează la domiciliu. Obligatoriile condiționează consultația; cele opționale pot fi alese de pacient.</p>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                {investigationsCatalog.map((investigation) => {
                  const state = investigationState(investigation.id);
                  return (
                    <div key={investigation.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                      <span className="min-w-0 flex-1 truncate text-slate-700">{investigation.name}</span>
                      <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
                        {([
                          { key: 'none', label: 'Nu' },
                          { key: 'required', label: 'Obligatoriu' },
                          { key: 'optional', label: 'Opțional' }
                        ] as const).map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setInvestigationState(investigation.id, option.key)}
                            className={`px-2.5 py-1 text-xs transition-colors ${
                              state === option.key
                                ? option.key === 'required'
                                  ? 'bg-primary text-white'
                                  : option.key === 'optional'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-200 text-slate-700'
                                : 'bg-white text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {investigationsCatalog.length === 0 && (
                  <p className="px-2 py-2 text-sm text-slate-400">Catalogul de investigații e gol. Adminul îl completează din „Investigații".</p>
                )}
              </div>
            </Field>
            <Button type="submit" className="h-11 rounded-xl">
              Salvează modificările
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CalendarDays className="mr-2 h-5 w-5 text-primary" />
              Program săptămânal
            </CardTitle>
            <CardDescription>Pacienții pot programa consultații doar în aceste intervale.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {availability.map((slot, index) => (
              <div key={`${slot.weekday}-${index}`} className="grid gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
                <Field label="Zi">
                  <Select value={String(slot.weekday)} onValueChange={(value) => updateAvailabilitySlot(index, { weekday: Number(value) })}>
                    <SelectTrigger className="h-10 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {weekdays.map((day, dayIndex) => (
                        <SelectItem key={day} value={String(dayIndex)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="De la">
                  <Input type="time" value={slot.starts_at} onChange={(event) => updateAvailabilitySlot(index, { starts_at: event.target.value })} className="h-10 rounded-xl bg-white" />
                </Field>
                <Field label="Până la">
                  <Input type="time" value={slot.ends_at} onChange={(event) => updateAvailabilitySlot(index, { ends_at: event.target.value })} className="h-10 rounded-xl bg-white" />
                </Field>
                <div className="flex items-center justify-between gap-2 pb-2 sm:justify-end">
                  <Label>Activ</Label>
                  <Switch checked={slot.is_active} onCheckedChange={(value) => updateAvailabilitySlot(index, { is_active: value })} />
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="rounded-xl bg-white" onClick={() => setAvailability([...availability, { weekday: 1, starts_at: '09:00', ends_at: '18:00', is_active: true }])}>
                <Plus className="mr-2 h-4 w-4" />
                Adaugă interval
              </Button>
              <Button type="button" className="rounded-xl" onClick={saveAvailability}>
                Salvează programul
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Contact video</CardTitle>
                <CardDescription>Platforme salvate în profil.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" className="rounded-lg bg-white" onClick={() => setIsPlatformModalOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Adaugă
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {platforms.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                Nicio platformă adăugată.
              </div>
            )}
            {platforms.map((platform, index) => (
              <div key={`${platform.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{platform.name}</p>
                  <p className="truncate text-sm text-slate-500">{platform.value}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setPlatforms(platforms.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CalendarDays className="mr-2 h-5 w-5 text-primary" />
              Concedii
            </CardTitle>
            <CardDescription>Intervalele în care nu apăreți disponibil pentru pacienți.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-600">
              Status public: {form.is_available ? 'disponibil manual' : 'indisponibil manual'}; concediile active opresc automat disponibilitatea.
            </div>
            <div className="space-y-3">
              {vacations.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                  Nu există concedii planificate.
                </div>
              )}
              {vacations.map((vacation) => (
                <div key={vacation.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white p-3">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {new Date(vacation.starts_on).toLocaleDateString()} - {new Date(vacation.ends_on).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-slate-500">{vacation.reason || 'Concediu'}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => deleteVacation(vacation)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-4">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="De la">
                    <Input type="date" value={vacationForm.starts_on} onChange={(event) => setVacationForm({ ...vacationForm, starts_on: event.target.value })} className="h-11 rounded-xl" />
                  </Field>
                  <Field label="Până la">
                    <Input type="date" value={vacationForm.ends_on} onChange={(event) => setVacationForm({ ...vacationForm, ends_on: event.target.value })} className="h-11 rounded-xl" />
                  </Field>
                </div>
                <Field label="Motiv / notă">
                  <Input value={vacationForm.reason} onChange={(event) => setVacationForm({ ...vacationForm, reason: event.target.value })} placeholder="Ex: concediu anual" className="h-11 rounded-xl" />
                </Field>
                <Button type="button" variant="outline" className="h-10 rounded-xl bg-white" onClick={addVacation} disabled={!vacationForm.starts_on || !vacationForm.ends_on}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adaugă concediu
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>

      <Dialog open={isPlatformModalOpen} onOpenChange={setIsPlatformModalOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-2xl border-0 bg-white shadow-xl">
          <form onSubmit={addPlatform}>
            <DialogHeader>
              <DialogTitle className="flex items-center text-xl">
                <Video className="mr-2 h-5 w-5" />
                Platformă contact
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <Field label="Platformă">
                <Select value={newPlatform.name} onValueChange={(value) => setNewPlatform({ ...newPlatform, name: value })}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selectează" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                    <SelectItem value="Viber">Viber</SelectItem>
                    <SelectItem value="Telegram">Telegram</SelectItem>
                    <SelectItem value="Skype">Skype</SelectItem>
                    <SelectItem value="Telefon">Telefon</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date de contact">
                <Input value={newPlatform.value} onChange={(event) => setNewPlatform({ ...newPlatform, value: event.target.value })} required className="h-11 rounded-xl" />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl bg-white" onClick={() => setIsPlatformModalOpen(false)}>
                Anulare
              </Button>
              <Button type="submit" className="rounded-xl">
                Adaugă
              </Button>
            </DialogFooter>
          </form>
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

function textToItems(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}
