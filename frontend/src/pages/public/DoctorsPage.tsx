import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../components/ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { mdl, SERVICE_TYPE_LABEL, whenLabel, type DoctorServiceItem, type ServiceType } from '../../lib/doctor';

type PublicDoctor = {
  id: string;
  name: string;
  specialty?: string | null;
  specialty_id?: number | null;
  rating: string | number;
  reviews_count: number;
  avatar?: string | null;
  institution?: { name: string } | null;
  services?: DoctorServiceItem[];
};
type Specialty = { id: number; name: string };
type Filter = 'all' | ServiceType;

const FILTERS: Array<[Filter, string]> = [['all', 'Toate serviciile'], ['video', 'Video'], ['chat', 'Chat'], ['home', 'La domiciliu']];

/** Unde duce „Programează-te”: direct la programare pentru pacient, altfel prin înregistrare. */
export function bookingTarget(doctorId: string): string {
  return `/patient/doctors?doctor=${encodeURIComponent(doctorId)}`;
}

const initialsOf = (name: string) => name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean).map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
const doctorName = (name: string) => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);
const rating = (value: string | number) => Number(value || 0).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const isToday = (value?: string | null) => Boolean(value) && new Date(value as string).toDateString() === new Date().toDateString();

/**
 * M1/M2: catalogul public. Fără cont se vede lista, cu instituția, tipurile de
 * servicii, prețul de la care pornesc și prima oră liberă. Programarea se face
 * în aplicație: „Programează-te” cere întâi contul și păstrează medicul ales.
 */
export function DoctorsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [nextSlots, setNextSlots] = useState<Record<string, string | null>>({});
  const [chosenSpecialties, setChosenSpecialties] = useState<number[]>([]);
  const [freeToday, setFreeToday] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = searchParams.get('q') ?? '';
  const type = (['video', 'chat', 'home'].includes(searchParams.get('type') ?? '') ? searchParams.get('type') : 'all') as Filter;

  useEffect(() => {
    document.title = 'Medici · telemedconsult.md';
    Promise.all([
      apiRequest<{ data: PublicDoctor[] }>('/catalog/doctors', { auth: false }),
      apiRequest<{ data: Specialty[] }>('/catalog/specialties', { auth: false })
    ])
      .then(([doctorResponse, specialtyResponse]) => {
        const list = doctorResponse.data ?? [];
        setDoctors(list);
        setSpecialties(specialtyResponse.data ?? []);
        // Prima oră liberă din programul fiecărui medic.
        list.forEach((doctor) => {
          apiRequest<{ days: Array<{ slots: Array<{ starts_at: string }> }> }>(`/catalog/doctors/${doctor.id}/slots?days=7`, { auth: false })
            .then((response) => setNextSlots((current) => ({ ...current, [doctor.id]: response.days.flatMap((day) => day.slots)[0]?.starts_at ?? null })))
            .catch(() => setNextSlots((current) => ({ ...current, [doctor.id]: null })));
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca medicii.'))
      .finally(() => setLoading(false));
  }, []);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('ro');
    return doctors.filter((doctor) => {
      const services = doctor.services ?? [];
      if (type !== 'all' && !services.some((service) => service.type === type)) return false;
      if (chosenSpecialties.length && !chosenSpecialties.includes(Number(doctor.specialty_id))) return false;
      if (freeToday && !isToday(nextSlots[doctor.id])) return false;
      return !term || `${doctor.name} ${doctor.specialty ?? ''} ${doctor.institution?.name ?? ''}`.toLocaleLowerCase('ro').includes(term);
    });
  }, [doctors, type, chosenSpecialties, freeToday, nextSlots, query]);

  const book = (doctor: PublicDoctor) => {
    const target = bookingTarget(doctor.id);
    if (isAuthenticated && role === 'patient') navigate(target);
    else if (isAuthenticated) navigate(`/${role}`);
    else navigate(`/register?next=${encodeURIComponent(target)}`);
  };

  const toggleSpecialty = (id: number) => setChosenSpecialties((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const count = visible.length === 1 ? '1 medic' : `${visible.length} medici`;

  const sideFilters = (
    <>
      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold tracking-[.04em] text-slate-500">SPECIALITATE</span>
        {specialties.map((item) => {
          const on = chosenSpecialties.includes(item.id);
          return (
            <button key={item.id} type="button" onClick={() => toggleSpecialty(item.id)} aria-pressed={on} className="flex h-7 items-center gap-2.5 text-left text-sm text-slate-700">
              <span className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] text-white', on ? 'border-blue-600 bg-blue-600' : 'border-slate-300')}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>{item.name}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => setFreeToday((value) => !value)} aria-pressed={freeToday} className="flex items-center justify-between text-sm text-slate-700">
        Liber azi
        <span className={cn('flex h-5 w-9 items-center rounded-full p-0.5', freeToday ? 'bg-blue-600' : 'bg-slate-300')}><span className={cn('h-4 w-4 rounded-full bg-white transition-transform', freeToday && 'translate-x-4')} /></span>
      </button>
    </>
  );

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-2.5 px-4 pb-16 pt-4 md:gap-7 md:px-10 md:pb-[72px] md:pt-10">
      {/* Titlul și căutarea */}
      <div className="hidden items-end justify-between gap-6 md:flex">
        <div className="flex flex-col gap-1.5"><h1 className="text-4xl font-bold tracking-[-.025em]">Medici</h1><span className="text-[15px] text-slate-600">{loading ? 'Se încarcă…' : count}</span></div>
        <SearchBox value={query} onChange={(value) => setParam('q', value)} className="w-[420px]" />
      </div>
      <div className="flex flex-col gap-2.5 md:hidden">
        <div className="flex gap-2">
          <SearchBox value={query} onChange={(value) => setParam('q', value)} className="flex-1" small />
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className="flex h-11 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" />Filtre{(chosenSpecialties.length || freeToday) ? ` · ${chosenSpecialties.length + Number(freeToday)}` : ''}</button>
        </div>
        {filtersOpen && <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-4">{sideFilters}</div>}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setParam('type', key === 'all' ? null : key)}
              className={cn('h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold', type === key ? 'border border-slate-900 bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700')}>{label}</button>
          ))}
        </div>
        <span className="px-0.5 text-[13px] text-slate-500">{loading ? 'Se încarcă…' : count}</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
        <aside className="hidden flex-col gap-7 md:flex">
          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold tracking-[.04em] text-slate-500">TIP SERVICIU</span>
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setParam('type', key === 'all' ? null : key)}
                className={cn('h-10 rounded-[10px] px-3 text-left text-sm', type === key ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-700 hover:bg-white')}>{label}</button>
            ))}
          </div>
          {sideFilters}
        </aside>

        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {loading && [0, 1, 2, 3].map((key) => <div key={key} className="h-[190px] animate-pulse rounded-2xl bg-white" />)}
          {!loading && visible.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2">Niciun medic nu se potrivește filtrelor.</p>}
          {visible.map((doctor) => {
            const services = doctor.services ?? [];
            const types = [...new Set(services.map((service) => service.type))];
            const from = services.length ? Math.min(...services.map((service) => service.price)) : null;
            const next = nextSlots[doctor.id];
            const onlyChat = types.length === 1 && types[0] === 'chat';
            return (
              <article key={doctor.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:gap-3.5 md:p-5">
                <div className="flex items-center gap-3 md:gap-3.5">
                  {doctor.avatar
                    ? <img src={doctor.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover md:h-[52px] md:w-[52px]" />
                    : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700 md:h-[52px] md:w-[52px] md:text-base">{initialsOf(doctor.name)}</span>}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:gap-[3px]">
                    <span className="truncate text-base font-semibold md:text-[17px]">{doctorName(doctor.name)}</span>
                    <span className="truncate text-xs text-slate-500 md:text-[13px] md:text-slate-600">{[doctor.specialty || 'Medic', doctor.institution?.name].filter(Boolean).join(' · ')}</span>
                  </div>
                  {doctor.reviews_count > 0 && <span className="whitespace-nowrap text-[13px] text-slate-600">★ <b className="text-slate-950">{rating(doctor.rating)}</b><span className="hidden md:inline"> ({doctor.reviews_count})</span></span>}
                </div>
                {types.length > 0 && <div className="flex flex-wrap gap-1.5">{types.map((item) => <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{SERVICE_TYPE_LABEL[item]}</span>)}</div>}
                <div className="flex items-center justify-between gap-3 md:border-t md:border-slate-100 md:pt-3.5">
                  <div className="flex min-w-0 flex-col gap-px md:gap-0.5">
                    <span className="text-base font-bold">{from !== null ? `de la ${mdl(from)}` : 'Prețuri în curând'}</span>
                    <span className="truncate text-xs text-slate-500">{onlyChat ? 'Răspuns în 24 h' : next ? `Prima oră liberă: ${whenLabel(next)}` : next === null ? 'Fără ore libere în 7 zile' : ' '}</span>
                  </div>
                  <button type="button" onClick={() => book(doctor)} className="flex h-11 shrink-0 items-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 md:h-10">Programează-te</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {!isAuthenticated && !loading && visible.length > 0 && (
        <p className="text-center text-[13px] text-slate-500 md:text-left">Programarea se face din cont. La „Programează-te” îți creezi contul, iar medicul ales se păstrează.</p>
      )}
    </div>
  );
}

function SearchBox({ value, onChange, className, small = false }: { value: string; onChange: (value: string) => void; className?: string; small?: boolean }) {
  return (
    <label className={cn('flex items-center gap-2.5 border border-slate-200 bg-white px-3.5 focus-within:border-blue-600', small ? 'h-11 rounded-[10px] px-3' : 'h-12 rounded-xl', className)}>
      <Search className="h-4 w-4 shrink-0 text-slate-500" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={small ? 'Specialitate sau medic' : 'Specialitate sau numele medicului'} aria-label="Caută medic" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-500" />
    </label>
  );
}
