import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { mdl, SERVICE_TYPE_LABEL, whenLabel, type DoctorServiceItem } from '../../lib/doctor';

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
/** Câți medici arată pagina publică; restul se văd din cont. */
const PREVIEW_COUNT = 6;

/** Unde duce „Programează-te”: direct la programare pentru pacient, altfel prin înregistrare. */
export function bookingTarget(doctorId: string): string {
  return `/patient/doctors?doctor=${encodeURIComponent(doctorId)}`;
}

const initialsOf = (name: string) => name.replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean).map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
const doctorName = (name: string) => (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`);
const rating = (value: string | number) => Number(value || 0).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Catalogul public: câțiva medici, fără filtre și fără căutare. Lista întreagă
 * și programarea se fac din cont: „Vezi toți medicii” și „Programează-te” cer
 * autentificarea, iar medicul ales se păstrează.
 */
export function DoctorsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [nextSlots, setNextSlots] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    document.title = 'Medici · telemedconsult.md';
    apiRequest<{ data: PublicDoctor[] }>('/catalog/doctors', { auth: false })
      .then((doctorResponse) => {
        // Întâi cei cu cele mai multe recenzii.
        const all = [...(doctorResponse.data ?? [])].sort((a, b) => b.reviews_count - a.reviews_count || Number(b.rating) - Number(a.rating));
        setTotal(all.length);
        const list = all.slice(0, PREVIEW_COUNT);
        setDoctors(list);
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

  const visible = doctors;

  const book = (doctor: PublicDoctor) => {
    const target = bookingTarget(doctor.id);
    if (isAuthenticated && role === 'patient') navigate(target);
    else if (isAuthenticated) navigate(`/${role}`);
    else navigate(`/register?next=${encodeURIComponent(target)}`);
  };

  // Lista întreagă e în cont: pacientul ajunge direct, ceilalți trec prin autentificare.
  const seeAll = () => {
    if (isAuthenticated && role === 'patient') navigate('/patient/doctors');
    else if (isAuthenticated) navigate(`/${role}`);
    else navigate(`/login?next=${encodeURIComponent('/patient/doctors')}`);
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-2.5 px-4 pb-16 pt-4 md:gap-7 md:px-10 md:pb-[72px] md:pt-10">
      <div className="flex flex-col gap-1.5 pb-2 md:pb-0">
        <h1 className="text-[28px] font-bold tracking-[-.025em] md:text-4xl">Medici</h1>
        <span className="text-[15px] text-slate-600">Câțiva dintre medicii platformei. Toată lista o vezi după ce intri în cont.</span>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          {loading && [0, 1, 2, 3].map((key) => <div key={key} className="h-[190px] animate-pulse rounded-2xl bg-white" />)}
          {!loading && visible.length === 0 && !error && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 md:col-span-3">Medicii apar aici în curând.</p>}
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
      {!loading && visible.length > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button type="button" onClick={seeAll} className="flex h-12 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-6 text-[15px] font-semibold text-slate-950 hover:bg-slate-50">
            {total > visible.length ? `Vezi toți medicii (${total})` : 'Vezi mai mult'}<ArrowRight className="h-4 w-4" />
          </button>
          {!isAuthenticated && <span className="text-center text-[13px] text-slate-500">Intri în cont și vezi toți medicii, cu orele libere. Medicul ales la „Programează-te” se păstrează.</span>}
        </div>
      )}
    </div>
  );
}
