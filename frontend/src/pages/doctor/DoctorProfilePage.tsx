import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Check, ChevronRight, Eye, GripVertical, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { cn } from '../../components/ui/utils';
import { useDialogs } from '../../components/app/DialogProvider';
import { NotificationBell } from '../../components/NotificationBell';
import { ServiceEditor, Toggle, type CatalogInvestigation } from '../../components/doctor/ServiceEditor';
import { ServiceIcon } from '../../components/doctor/ServiceIcon';
import { PublicDoctorHeader, ServiceChoices } from '../../components/doctor/DoctorPublicProfile';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { investigationsText, mdl, serviceMeta, type DoctorServiceItem } from '../../lib/doctor';
import { usePageTitle } from '../../lib/use-page-title';

interface Specialty { id: number; name: string }
interface Vacation { id: number; starts_on: string; ends_on: string; reason?: string | null }
interface Slot { id?: number; weekday: number; starts_at: string; ends_at: string; is_active: boolean }

interface ProfileResponse {
  user: { name: string; email: string; phone?: string | null };
  profile?: {
    clinic_name?: string | null; clinic_details?: string | null; accepts_points?: boolean; specialty_id?: number | null; license_number?: string | null;
    bio?: string | null; experience_years?: number | null; is_available?: boolean; rating?: string | number | null; reviews_count?: number | null;
    payout_bank?: string | null; payout_iban?: string | null;
  } | null;
  vacations: Vacation[];
  availability: Slot[];
  specialties: Specialty[];
  services?: DoctorServiceItem[];
  institution?: { name: string; address?: string | null } | null;
  has_signature?: boolean;
  has_clinic_logo?: boolean;
  avatar?: string | null;
}

type Section = 'pub' | 'inst' | 'serv' | 'prog' | 'conc' | 'pdf' | 'pay';
const SECTIONS: Array<[Section, string]> = [['pub', 'Informații publice'], ['inst', 'Instituție'], ['serv', 'Servicii și prețuri'], ['prog', 'Program'], ['conc', 'Concedii'], ['pdf', 'Documente PDF'], ['pay', 'Plăți']];
const DAYS: Array<[number, string]> = [[1, 'Luni'], [2, 'Marți'], [3, 'Miercuri'], [4, 'Joi'], [5, 'Vineri'], [6, 'Sâmbătă'], [0, 'Duminică']];
const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const shortDate = (value: string) => { const date = new Date(`${value.slice(0, 10)}T12:00:00`); return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`; };
const card = 'flex flex-col rounded-2xl border border-slate-200 bg-white p-6 max-lg:rounded-none max-lg:border-0 max-lg:p-4';
const field = 'h-10 w-full rounded-[10px] border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15';

/**
 * P1/P2: profilul medicului pe secțiuni. Pe desktop, o pagină cu navigare care
 * se aprinde la derulare; pe telefon, o listă de secțiuni care se deschid pe rând.
 */
export function DoctorProfilePage() {
  usePageTitle('Profil');
  const dialogs = useDialogs();
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', specialty_id: '', license_number: '', experience_years: '0', bio: '', clinic_name: '', clinic_details: '', accepts_points: false, is_available: true, payout_bank: '', payout_iban: '' });
  const [adminOpen, setAdminOpen] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<CatalogInvestigation[]>([]);
  const [services, setServices] = useState<DoctorServiceItem[]>([]);
  const [editing, setEditing] = useState<DoctorServiceItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [vacationOpen, setVacationOpen] = useState(false);
  const [active, setActive] = useState<Section>('pub');
  const scroller = useRef<HTMLDivElement | null>(null);
  const mobileSection = searchParams.get('section') as Section | null;

  const load = useCallback(async () => {
    const response = await apiRequest<ProfileResponse>('/doctor/profile');
    setData(response);
    setServices(response.services ?? []);
    setSlots((response.availability ?? []).map((slot) => ({ ...slot, starts_at: slot.starts_at.slice(0, 5), ends_at: slot.ends_at.slice(0, 5) })));
    setForm({
      name: response.user.name ?? '', phone: response.user.phone ?? '', specialty_id: response.profile?.specialty_id ? String(response.profile.specialty_id) : '',
      license_number: response.profile?.license_number ?? '', experience_years: String(response.profile?.experience_years ?? 0), bio: response.profile?.bio ?? '',
      clinic_name: response.profile?.clinic_name ?? '', clinic_details: response.profile?.clinic_details ?? '', accepts_points: Boolean(response.profile?.accepts_points), is_available: response.profile?.is_available ?? true,
      payout_bank: response.profile?.payout_bank ?? '', payout_iban: response.profile?.payout_iban ?? ''
    });
    setDirty(false);
  }, []);

  useEffect(() => {
    load().catch((err) => toast.error(err instanceof Error ? err.message : 'Profilul nu a putut fi încărcat.'));
    apiRequest<{ data: CatalogInvestigation[] }>('/catalog/investigations', { auth: false }).then((response) => setCatalog(response.data ?? [])).catch(() => undefined);
  }, [load]);

  // Linkurile vechi (?vacations=1) și ancorele (#pdf) duc la secțiunea potrivită.
  useEffect(() => {
    if (!data) return;
    const target = searchParams.get('vacations') === '1' ? 'conc' : window.location.hash.slice(1);
    if (SECTIONS.some(([key]) => key === target)) window.setTimeout(() => go(target as Section), 120);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<typeof form>) => { setForm((current) => ({ ...current, ...patch })); setDirty(true); };

  const save = async (patch: Partial<typeof form> = {}) => {
    const next = { ...form, ...patch };
    setSaving(true);
    try {
      await apiRequest('/doctor/profile', { method: 'PUT', body: JSON.stringify({
        name: next.name, phone: next.phone || null, specialty_id: next.specialty_id ? Number(next.specialty_id) : null, license_number: next.license_number || null,
        experience_years: Number(next.experience_years) || 0, bio: next.bio || null, clinic_name: next.clinic_name || null, clinic_details: next.clinic_details || null,
        accepts_points: next.accepts_points, is_available: next.is_available, payout_bank: next.payout_bank || null, payout_iban: next.payout_iban || null
      }) });
      setForm(next);
      setDirty(false);
      void refreshUser();
      toast.success('Profilul a fost salvat.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva profilul.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = () => void save({ is_available: !form.is_available });

  const toggleService = async (service: DoctorServiceItem) => {
    setServices((current) => current.map((item) => item.id === service.id ? { ...item, is_active: !item.is_active } : item));
    try {
      await apiRequest(`/doctor/services/${service.id}`, { method: 'PUT', body: JSON.stringify({ is_active: !service.is_active }) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut schimba serviciul.');
      void load();
    }
  };

  const reorder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...services];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setServices(next);
    try { await apiRequest('/doctor/services/order', { method: 'PUT', body: JSON.stringify({ ids: next.map((item) => Number(item.id)) }) }); } catch { void load(); }
  };

  const saveSlots = async (next: Slot[]) => {
    setSlots(next);
    try {
      await apiRequest('/doctor/availability', { method: 'PUT', body: JSON.stringify({ slots: next.length ? next : [{ weekday: 1, starts_at: '09:00', ends_at: '18:00', is_active: false }] }) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva programul.');
    }
  };

  const removeVacation = async (vacation: Vacation) => {
    if (!(await dialogs.confirm({ title: 'Ștergi acest concediu?', description: 'Pacienții te vor putea programa din nou în acest interval.', confirmLabel: 'Șterge concediul', tone: 'danger' }))) return;
    await apiRequest(`/doctor/vacations/${vacation.id}`, { method: 'DELETE' }).catch(() => undefined);
    void load();
  };

  const upload = async (kind: 'signature' | 'logo', file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) { toast.error('Încarcă o imagine JPG sau PNG, maximum 2 MB.'); return; }
    const body = new FormData();
    body.append(kind === 'logo' ? 'logo' : 'signature', file);
    try {
      await apiRequest(kind === 'logo' ? '/doctor/clinic-logo' : '/doctor/signature', { method: 'POST', body });
      toast.success(kind === 'logo' ? 'Sigla a fost salvată.' : 'Parafa a fost salvată.');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut încărca imaginea.');
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) { toast.error('Încarcă o fotografie JPG, PNG sau WEBP, maximum 3 MB.'); return; }
    const body = new FormData();
    body.append('avatar', file);
    try {
      await apiRequest('/doctor/avatar', { method: 'POST', body });
      toast.success('Fotografia a fost salvată.');
      void refreshUser();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut încărca fotografia.');
    }
  };

  const go = (key: Section) => {
    const node = scroller.current?.querySelector<HTMLElement>(`[data-sec="${key}"]`);
    if (node) window.scrollTo({ top: node.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    setActive(key);
  };

  useEffect(() => {
    const onScroll = () => {
      let current: Section = 'pub';
      scroller.current?.querySelectorAll<HTMLElement>('[data-sec]').forEach((node) => { if (node.getBoundingClientRect().top - 140 <= 0) current = node.dataset.sec as Section; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = 'pay';
      setActive(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const activeServices = services.filter((item) => item.is_active);
  const specialtyName = data?.specialties.find((item) => String(item.id) === form.specialty_id)?.name;
  const minPrice = activeServices.length ? Math.min(...activeServices.map((item) => item.price)) : null;
  const scheduleSummary = useMemo(() => {
    const on = slots.filter((slot) => slot.is_active);
    if (!on.length) return 'Fără program';
    const days = DAYS.filter(([day]) => on.some((slot) => slot.weekday === day)).map(([, label]) => label);
    const first = on[0];
    return `${days.length > 2 ? `${days[0]}–${days[days.length - 1]}` : days.join(', ')}, ${first.starts_at}–${first.ends_at}`;
  }, [slots]);

  if (!data) return <p className="p-6 text-sm text-slate-500">Se încarcă profilul…</p>;

  const publicDoctor = { name: form.name, specialty: specialtyName, experience_years: Number(form.experience_years), rating: data.profile?.rating, reviews_count: data.profile?.reviews_count, institution: data.institution, bio: form.bio, avatar: data.avatar, services: activeServices };

  const sectionContent: Record<Section, { title: string; description: string; action?: ReactNode; body: ReactNode; lock?: boolean }> = {
    pub: {
      title: 'Informații publice',
      description: 'Apar în catalog și în profilul tău.',
      body: (
        <>
          <div className="flex items-center gap-4">
            {data.avatar
              ? <img src={data.avatar} alt="" className="h-16 w-16 rounded-full object-cover" />
              : <span className="grid h-16 w-16 place-items-center rounded-full bg-blue-100 text-xl font-semibold text-blue-700">{form.name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase()}</span>}
            <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = ''; }} />
            <button type="button" onClick={() => avatarInput.current?.click()} className="h-9 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50">{data.avatar ? 'Schimbă fotografia' : 'Adaugă o fotografie'}</button>
          </div>
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Field label="Nume complet"><input value={form.name} onChange={(event) => set({ name: event.target.value })} className={field} /></Field>
            <Field label="Specializare">
              <select value={form.specialty_id} onChange={(event) => set({ specialty_id: event.target.value })} className={cn(field, 'bg-white')}>
                <option value="">Alege specializarea</option>
                {data.specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Experiență (ani)"><input value={form.experience_years} inputMode="numeric" onChange={(event) => set({ experience_years: event.target.value.replace(/\D/g, '') })} className={field} /></Field>
            <Field label="Număr licență"><input value={form.license_number} onChange={(event) => set({ license_number: event.target.value })} className={field} /></Field>
            <Field label={<>Telefon <span className="font-normal text-slate-400">· nu se arată pacienților</span></>}><input value={form.phone} onChange={(event) => set({ phone: event.target.value })} className={field} /></Field>
            <Field label="Email"><input value={data.user.email} readOnly className={cn(field, 'bg-slate-50 text-slate-500')} /></Field>
            <div className="sm:col-span-2"><Field label="Despre tine și ce probleme tratezi"><textarea value={form.bio} rows={3} onChange={(event) => set({ bio: event.target.value })} className={cn(field, 'h-auto min-h-[72px] resize-y py-2.5 leading-normal')} /></Field></div>
          </div>
        </>
      )
    },
    inst: {
      title: 'Instituția medicală',
      description: 'Apare în profilul tău public, sub nume.',
      lock: true,
      action: <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><Lock className="h-3 w-3" />Atribuită de administrator</span>,
      body: data.institution ? (
        <>
          <div className="flex items-center gap-3.5 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-600"><Building2 className="h-5 w-5" /></span>
            <div className="flex flex-col gap-[3px]"><span className="text-[15px] font-semibold text-slate-950">{data.institution.name}</span>{data.institution.address && <span className="text-[13px] text-slate-500">{data.institution.address}</span>}</div>
          </div>
          <span className="text-[13px] text-slate-500">Lucrezi în altă instituție? <button type="button" onClick={() => setAdminOpen(true)} className="font-medium text-blue-600 hover:underline">Scrie administratorului</button> și o schimbă el.</span>
        </>
      ) : <span className="text-sm text-slate-500">Nu ești atribuit unei instituții. Lucrezi printr-una? <button type="button" onClick={() => setAdminOpen(true)} className="font-medium text-blue-600 hover:underline">Scrie administratorului</button>.</span>
    },
    serv: {
      title: 'Servicii și prețuri',
      description: 'Pacientul alege unul dintre serviciile active când te programează.',
      action: <button type="button" onClick={() => { setEditing(null); setEditorOpen(true); }} className="hidden h-[38px] items-center gap-2 whitespace-nowrap rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700 lg:flex"><Plus className="h-4 w-4" />Adaugă serviciu</button>,
      body: (
        <>
          <ServiceRows services={services} onToggle={(service) => void toggleService(service)} onEdit={(service) => { setEditing(service); setEditorOpen(true); }} onMove={(from, to) => void reorder(from, to)} />
          <button type="button" onClick={() => { setEditing(null); setEditorOpen(true); }} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-[15px] font-semibold text-blue-700 lg:hidden"><Plus className="h-4 w-4" />Adaugă serviciu</button>
          <span className="text-[13px] text-slate-500 max-lg:hidden">Trage de rânduri ca să schimbi ordinea din profilul public. Un serviciu oprit nu se mai poate programa, dar consultațiile deja confirmate rămân.</span>
        </>
      )
    },
    prog: {
      title: 'Program săptămânal',
      description: 'Pacienții pot alege ore doar în aceste intervale. Se aplică tuturor serviciilor.',
      action: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50"><Plus className="h-4 w-4" />Adaugă interval</button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">{DAYS.map(([day, label]) => <DropdownMenuItem key={day} onSelect={() => void saveSlots([...slots, { weekday: day, starts_at: '13:00', ends_at: '17:00', is_active: true }])}>{label}</DropdownMenuItem>)}</DropdownMenuContent>
        </DropdownMenu>
      ),
      body: <WeekSchedule slots={slots} onChange={(next) => void saveSlots(next)} />
    },
    conc: {
      title: 'Concedii',
      description: 'În aceste zile nu apari disponibil, oricare ar fi serviciul.',
      action: <button type="button" onClick={() => setVacationOpen(true)} className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50"><Plus className="h-4 w-4" />Adaugă concediu</button>,
      body: data.vacations.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-[18px] text-center text-sm text-slate-500">Nu ai concedii planificate.</div> : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {data.vacations.map((vacation, index) => (
            <div key={vacation.id} className={cn('flex items-center gap-3 px-4 py-3', index > 0 && 'border-t border-slate-100')}>
              <span className="flex flex-1 flex-col gap-0.5"><span className="text-sm font-medium text-slate-950">{shortDate(vacation.starts_on)} – {shortDate(vacation.ends_on)}</span>{vacation.reason && <span className="text-xs text-slate-500">{vacation.reason}</span>}</span>
              <button type="button" aria-label="Șterge concediul" onClick={() => void removeVacation(vacation)} className="grid h-8 w-8 place-items-center text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )
    },
    pdf: {
      title: 'Documente PDF',
      description: 'Se pun automat pe concluziile publicate. Sunt ale tale, nu ale instituției.',
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          <UploadCard title="Parafă și semnătură" missing={!data.has_signature} status={data.has_signature ? 'Încărcată' : 'Lipsește'} text={data.has_signature ? 'Apare pe fiecare concluzie. Poți încărca alta oricând.' : 'Fără parafă nu poți publica concluzii. JPG sau PNG, maximum 2 MB.'} button={data.has_signature ? 'Înlocuiește imaginea' : 'Încarcă imaginea'} onFile={(file) => void upload('signature', file)} />
          <UploadCard title="Sigla pentru antet" status={data.has_clinic_logo ? 'Încărcată' : 'Opțional'} text="Apare sus pe PDF, lângă datele de mai jos. JPG sau PNG, maximum 2 MB." button={data.has_clinic_logo ? 'Înlocuiește sigla' : 'Încarcă sigla'} onFile={(file) => void upload('logo', file)} />
          <Field label="Denumirea din antet"><input value={form.clinic_name} onChange={(event) => set({ clinic_name: event.target.value })} placeholder="Ex: Cabinet Dr. Ana Ciobanu" className={field} /></Field>
          <Field label="Date de contact din antet"><input value={form.clinic_details} onChange={(event) => set({ clinic_details: event.target.value })} placeholder="Adresă, telefon, IDNO" className={field} /></Field>
        </div>
      )
    },
    pay: {
      title: 'Plăți',
      description: 'Se aplică la toate serviciile.',
      body: (
        <>
        <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-[1fr_1.6fr]">
          <Field label="Banca"><input value={form.payout_bank} onChange={(event) => set({ payout_bank: event.target.value })} placeholder="Ex: MAIB" className={field} /></Field>
          <Field label={<>IBAN <span className="font-normal text-slate-400">· aici primești extragerile</span></>}><input value={form.payout_iban} onChange={(event) => set({ payout_iban: event.target.value.toUpperCase() })} placeholder="MD24 AG00 0000 0225 1000 4821" className={cn(field, 'font-mono')} /></Field>
        </div>
        <button type="button" onClick={() => void save({ accepts_points: !form.accepts_points })} className="flex items-start gap-3 text-left">
          <span className={cn('mt-px grid h-5 w-5 shrink-0 place-items-center rounded-md border text-white', form.accepts_points ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white')}>{form.accepts_points && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
          <span className="flex flex-col gap-[3px]"><span className="text-sm font-medium text-slate-950">Accept plăți parțiale din bonusuri</span><span className="text-[13px] text-slate-500">Pacientul poate achita o parte din preț cu bonusuri. Tu primești suma întreagă.</span></span>
        </button>
        </>
      )
    }
  };

  const mobileSubs: Record<Section, [string, boolean]> = {
    pub: [form.bio && form.specialty_id && form.license_number ? 'Complet' : 'Incomplet', !(form.bio && form.specialty_id && form.license_number)],
    inst: [data.institution ? `${data.institution.name} · atribuită de administrator` : 'Neatribuită', false],
    serv: [activeServices.length ? `${activeServices.length} active${services.length - activeServices.length ? ` · ${services.length - activeServices.length} oprit` : ''} · de la ${minPrice} MDL` : 'Niciun serviciu activ', !activeServices.length],
    prog: [scheduleSummary, !slots.some((slot) => slot.is_active)],
    conc: [data.vacations.length ? `${data.vacations.length} planificate` : 'Niciun concediu planificat', false],
    pdf: [data.has_signature ? 'Parafa e încărcată' : 'Lipsește parafa', !data.has_signature],
    pay: [form.payout_iban ? `${form.payout_bank || 'Cont'} ···· ${form.payout_iban.slice(-4)}${form.accepts_points ? ' · accepți bonusuri' : ''}` : 'Lipsește IBAN-ul', !form.payout_iban]
  };

  const renderSection = (key: Section) => {
    const section = sectionContent[key];
    return (
      <section key={key} data-sec={key} className={cn(card, 'gap-4')}>
        <div className="flex items-start justify-between gap-3 max-lg:hidden">
          <div className="flex flex-col gap-1"><span className="text-[17px] font-semibold text-slate-950">{section.title}</span><span className="text-[13px] text-slate-500">{section.description}</span></div>
          {section.action}
        </div>
        <span className="text-[13px] leading-normal text-slate-500 lg:hidden">{section.description}</span>
        {section.body}
      </section>
    );
  };

  const availability = (
    <button type="button" onClick={toggleAvailable} disabled={saving} className="flex h-10 items-center gap-2.5 rounded-[10px] border border-slate-200 bg-white pl-3.5 pr-3 text-sm font-medium text-slate-950 max-lg:h-auto max-lg:w-full max-lg:justify-between max-lg:border-0 max-lg:bg-slate-50 max-lg:px-3.5 max-lg:py-3">
      {form.is_available ? 'Disponibil pentru consultații' : 'Indisponibil'}<Toggle on={form.is_available} />
    </button>
  );

  return (
    <>
      {/* Telefon · P2a sau o secțiune deschisă (P2b) */}
      <div className="-mx-4 -mt-5 min-h-[calc(100dvh-72px)] bg-slate-50 lg:hidden">
        {mobileSection && sectionContent[mobileSection] ? (
          <>
            <div className="flex items-center gap-1 px-2 pb-2.5 pt-[max(12px,env(safe-area-inset-top))]">
              <button type="button" aria-label="Înapoi" onClick={() => setSearchParams({})} className="grid h-10 w-10 place-items-center text-slate-700"><ArrowLeft className="h-[22px] w-[22px]" /></button>
              <span className="flex-1 text-lg font-semibold text-slate-950">{sectionContent[mobileSection].title.replace('Instituția medicală', 'Instituție').replace('Program săptămânal', 'Program')}</span>
              {mobileSection !== 'serv' && <div className="mr-2 [&_button]:h-9">{sectionContent[mobileSection].action}</div>}
            </div>
            <div className="flex flex-col gap-3 px-4 pb-6">
              {mobileSection === 'serv' ? (
                <>
                  <span className="text-[13px] leading-normal text-slate-500">Pacientul alege unul dintre serviciile active când te programează.</span>
                  <MobileServiceRows services={services} onToggle={(service) => void toggleService(service)} onEdit={(service) => { setEditing(service); setEditorOpen(true); }} />
                  <button type="button" onClick={() => { setEditing(null); setEditorOpen(true); }} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-[15px] font-semibold text-blue-700"><Plus className="h-4 w-4" />Adaugă serviciu</button>
                </>
              ) : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{renderSection(mobileSection)}</div>}
              {dirty && <SaveBar saving={saving} onSave={() => void save()} />}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 pb-2.5 pt-[max(16px,env(safe-area-inset-top))]"><h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">Profil</h1><NotificationBell bare /></div>
            <div className="flex flex-col gap-3.5 px-4 pb-4 pt-1">
              <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-100 text-[17px] font-semibold text-blue-700">{(user?.name ?? '').split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase()}</span>
                  <div className="flex flex-1 flex-col gap-0.5"><span className="text-[17px] font-semibold text-slate-950">Dr. {form.name}</span><span className="text-[13px] text-slate-500">{[specialtyName, Number(form.experience_years) ? `${form.experience_years} ani` : null].filter(Boolean).join(' · ')}</span></div>
                </div>
                {availability}
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {SECTIONS.map(([key, label], index) => (
                  <button key={key} type="button" onClick={() => setSearchParams({ section: key })} className={cn('flex w-full items-center gap-3.5 px-4 py-3.5 text-left', index > 0 && 'border-t border-slate-100')}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[15px] font-medium text-slate-950">{label}{key === 'inst' && <Lock className="h-3 w-3 text-slate-400" />}</span>
                      <span className={cn('truncate text-[13px]', mobileSubs[key][1] ? 'font-semibold text-amber-700' : 'text-slate-500')}>{mobileSubs[key][0]}</span>
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] text-slate-400" />
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setPreview(true)} className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-950"><Eye className="h-4 w-4" />Cum te văd pacienții</button>
            </div>
          </>
        )}
      </div>

      {/* Desktop · P1a */}
      <div className="hidden lg:block">
        <div className="flex items-end justify-between gap-4 pb-4">
          <div className="flex flex-col gap-1.5"><h1 className="text-[28px] font-bold tracking-[-.02em] text-slate-950">Profilul meu</h1><span className="text-sm text-slate-500">Ce văd pacienții despre tine, serviciile, programul și documentele PDF.</span></div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setPreview(true)} className="flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50"><Eye className="h-4 w-4" />Cum te văd pacienții</button>
            {availability}
          </div>
        </div>
        <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-7 pb-8">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            {SECTIONS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => go(key)} className={cn('flex h-9 items-center justify-between rounded-lg px-3 text-left text-sm', active === key ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-700 hover:bg-slate-50')}>
                {label}
                {key === 'inst' && <Lock className="h-3 w-3 text-slate-400" />}
                {key === 'serv' && <span className="text-xs font-medium text-slate-500">{activeServices.length}</span>}
              </button>
            ))}
          </nav>
          <div ref={scroller} className="flex min-w-0 flex-col gap-5">
            {SECTIONS.map(([key]) => renderSection(key))}
          </div>
        </div>
        {dirty && <div className="sticky bottom-4 flex justify-end"><SaveBar saving={saving} onSave={() => void save()} /></div>}
      </div>

      <ServiceEditor service={editing} open={editorOpen} catalog={catalog} onOpenChange={setEditorOpen} onSaved={() => { toast.success('Serviciul a fost salvat.'); void load(); }} />
      <AdminMessageDialog open={adminOpen} onOpenChange={setAdminOpen} />
      <VacationDialog open={vacationOpen} onOpenChange={setVacationOpen} onSaved={() => void load()} />
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto bg-slate-50 sm:max-w-2xl">
          <DialogTitle>Cum te văd pacienții</DialogTitle>
          <DialogDescription>Profilul public, cu serviciile active în ordinea ta.</DialogDescription>
          <PublicDoctorHeader doctor={publicDoctor} />
          <span className="text-lg font-semibold text-slate-950">Alege serviciul</span>
          <ServiceChoices services={activeServices} selectedId={activeServices[0]?.id ?? null} onSelect={() => undefined} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-700">{label}</span>{children}</label>;
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,.12)]">
      <span className="flex-1 text-sm text-slate-600">Ai modificări nesalvate.</span>
      <button type="button" onClick={onSave} disabled={saving} className="h-9 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Se salvează…' : 'Salvează'}</button>
    </div>
  );
}

function ServiceRows({ services, onToggle, onEdit, onMove }: { services: DoctorServiceItem[]; onToggle: (service: DoctorServiceItem) => void; onEdit: (service: DoctorServiceItem) => void; onMove: (from: number, to: number) => void }) {
  const dragFrom = useRef<number | null>(null);
  if (!services.length) return <div className="rounded-xl border border-dashed border-slate-300 p-[18px] text-center text-sm text-slate-500 max-lg:hidden">Nu ai încă servicii. Adaugă primul serviciu ca pacienții să te poată programa.</div>;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 max-lg:hidden">
      {services.map((service, index) => (
        <div key={service.id} draggable onDragStart={() => { dragFrom.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragFrom.current !== null) onMove(dragFrom.current, index); dragFrom.current = null; }}
          className={cn('flex items-center gap-3.5 bg-white px-4 py-3.5', index > 0 && 'border-t border-slate-100')}>
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" />
          <span className={cn('grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-700', !service.is_active && 'opacity-50')}><ServiceIcon type={service.type} className="h-[18px] w-[18px]" /></span>
          <div className={cn('flex min-w-0 flex-1 flex-col gap-[3px]', !service.is_active && 'opacity-50')}>
            <span className="text-[15px] font-semibold text-slate-950">{service.name}</span>
            <span className="text-[13px] text-slate-500">{serviceMeta(service)}</span>
            {service.type === 'home' && <span className="text-xs text-slate-600">{investigationsText(service.investigations)}</span>}
          </div>
          <span className={cn('whitespace-nowrap text-[15px] font-bold text-slate-950', !service.is_active && 'opacity-50')}>{mdl(service.price)}</span>
          <button type="button" onClick={() => onToggle(service)} title="Activ / oprit" className="flex w-[84px] items-center justify-end gap-2 p-1 text-xs text-slate-500">{service.is_active ? 'Activ' : 'Oprit'}<Toggle on={service.is_active} /></button>
          <button type="button" aria-label="Editează serviciul" onClick={() => onEdit(service)} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"><Pencil className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function MobileServiceRows({ services, onToggle, onEdit }: { services: DoctorServiceItem[]; onToggle: (service: DoctorServiceItem) => void; onEdit: (service: DoctorServiceItem) => void }) {
  if (!services.length) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {services.map((service, index) => (
        <div key={service.id} className={cn('flex items-center gap-3 py-3.5 pl-4 pr-3.5', index > 0 && 'border-t border-slate-100')}>
          <button type="button" onClick={() => onEdit(service)} className={cn('flex min-w-0 flex-1 flex-col gap-[3px] text-left', !service.is_active && 'opacity-50')}>
            <span className="text-[15px] font-semibold text-slate-950">{service.name}</span>
            <span className="text-[13px] text-slate-500">{serviceMeta(service)}</span>
            <span className="mt-0.5 text-sm font-bold text-slate-950">{mdl(service.price)}</span>
          </button>
          <button type="button" aria-label={service.is_active ? 'Oprește serviciul' : 'Pornește serviciul'} onClick={() => onToggle(service)} className="px-1 py-2.5"><Toggle on={service.is_active} large /></button>
        </div>
      ))}
    </div>
  );
}

function WeekSchedule({ slots, onChange }: { slots: Slot[]; onChange: (slots: Slot[]) => void }) {
  return (
    <div className="flex flex-col">
      {DAYS.map(([day, label], index) => {
        const daySlots = slots.map((slot, position) => ({ slot, position })).filter(({ slot }) => slot.weekday === day);
        const on = daySlots.some(({ slot }) => slot.is_active);
        const toggle = () => {
          if (daySlots.length) onChange(slots.map((slot) => slot.weekday === day ? { ...slot, is_active: !on } : slot));
          else onChange([...slots, { weekday: day, starts_at: '09:00', ends_at: '18:00', is_active: true }]);
        };
        return (
          <div key={day} className={cn('grid grid-cols-[88px_1fr_44px] items-center gap-3 py-2 sm:grid-cols-[120px_1fr_56px]', index > 0 && 'border-t border-slate-100')}>
            <span className={cn('text-sm font-medium', on ? 'text-slate-950' : 'text-slate-400')}>{label}</span>
            {on ? (
              <div className="flex flex-col gap-1.5">
                {daySlots.filter(({ slot }) => slot.is_active).map(({ slot, position }) => (
                  <div key={position} className="flex items-center gap-2 text-sm">
                    <TimeInput value={slot.starts_at} onChange={(value) => onChange(slots.map((item, i) => i === position ? { ...item, starts_at: value } : item))} />
                    <span className="text-slate-400">–</span>
                    <TimeInput value={slot.ends_at} onChange={(value) => onChange(slots.map((item, i) => i === position ? { ...item, ends_at: value } : item))} />
                    {daySlots.length > 1 && <button type="button" aria-label="Șterge intervalul" onClick={() => onChange(slots.filter((_, i) => i !== position))} className="grid h-8 w-8 place-items-center text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
            ) : <span className="text-sm text-slate-400">Liber</span>}
            <button type="button" aria-label={on ? `Liber ${label}` : `Lucrez ${label}`} onClick={toggle} className="justify-self-end"><Toggle on={on} /></button>
          </div>
        );
      })}
    </div>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input type="time" step={1800} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft && draft !== value) onChange(draft); }} className="h-9 rounded-[10px] border border-slate-200 px-2.5 font-mono text-[13px] outline-none focus:border-blue-600" />;
}

function UploadCard({ title, status, text, button, missing = false, onFile }: { title: string; status: string; text: string; button: string; missing?: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <div className={cn('flex flex-col gap-2.5 rounded-xl border p-4', missing ? 'border-amber-200 bg-amber-50' : 'border-slate-200')}>
      <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-950">{title}</span><span className={cn('text-xs', missing ? 'font-semibold text-amber-800' : 'text-slate-500')}>{status}</span></div>
      <span className={cn('text-[13px]', missing ? 'text-amber-900' : 'text-slate-500')}>{text}</span>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ''; }} />
      <button type="button" onClick={() => input.current?.click()} className="h-9 self-start rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50">{button}</button>
    </div>
  );
}

function AdminMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setMessage(''); }, [open]);
  const send = async () => {
    setBusy(true);
    try {
      await apiRequest('/doctor/institution-request', { method: 'POST', body: JSON.stringify({ message }) });
      toast.success('Mesajul a ajuns la administrator.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut trimite mesajul.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] gap-4 rounded-2xl p-6 sm:max-w-[440px]">
        <DialogTitle className="text-lg font-semibold">Scrie administratorului</DialogTitle>
        <DialogDescription>Spune în ce instituție lucrezi; administratorul o schimbă în profilul tău.</DialogDescription>
        <textarea value={message} rows={4} maxLength={1000} onChange={(event) => setMessage(event.target.value)} placeholder="Ex: Lucrez la IMSP CMF nr. 2, str. Ismail 12." className={cn(field, 'h-auto resize-y py-2.5 leading-normal')} />
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium">Anulează</button>
          <button type="button" onClick={() => void send()} disabled={busy || message.trim().length < 5} className="h-10 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-blue-300">Trimite</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VacationDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ starts_on: today, ends_on: today, reason: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setForm({ starts_on: today, ends_on: today, reason: '' }); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    try {
      await apiRequest('/doctor/vacations', { method: 'POST', body: JSON.stringify({ ...form, reason: form.reason || null }) });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut adăuga concediul.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] gap-4 rounded-2xl p-6 sm:max-w-[440px]">
        <DialogTitle className="text-lg font-semibold">Adaugă concediu</DialogTitle>
        <DialogDescription>În aceste zile pacienții nu te pot programa.</DialogDescription>
        <div className="grid grid-cols-2 gap-3">
          <Field label="De la"><input type="date" value={form.starts_on} onChange={(event) => setForm({ ...form, starts_on: event.target.value })} className={field} /></Field>
          <Field label="Până la"><input type="date" value={form.ends_on} onChange={(event) => setForm({ ...form, ends_on: event.target.value })} className={field} /></Field>
        </div>
        <Field label={<>Motiv <span className="font-normal text-slate-400">· opțional</span></>}><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={field} /></Field>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium">Anulează</button>
          <button type="button" onClick={() => void submit()} className="h-10 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white">Adaugă</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
