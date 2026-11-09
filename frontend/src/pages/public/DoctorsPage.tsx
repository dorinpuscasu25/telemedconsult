import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Home, Search, Star, Stethoscope, Video } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { cn } from '../../components/ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';

type PublicDoctor = {
  id: string;
  name: string;
  specialty?: string | null;
  specialty_id?: number | null;
  experience_years: number;
  consultation_price: number;
  video_price?: number | null;
  video_duration_minutes?: number | null;
  rating: string | number;
  reviews_count: number;
  is_available: boolean;
};
type Specialty = { id: number; name: string };

/** Unde duce „Programează”: direct la programare pentru pacient, altfel prin înregistrare. */
export function bookingTarget(doctorId: string): string {
  return `/patient/doctors?doctor=${encodeURIComponent(doctorId)}`;
}

/**
 * Catalogul public de medici: vizitatorul vede medicii și prețurile înainte să
 * plătească pachetul. „Programează” trece prin înregistrare și păstrează medicul ales.
 */
export function DoctorsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const withExam = isEnabled('with_exam_consultations') && isEnabled('operators');
  const video = isEnabled('video_consultations');

  useEffect(() => {
    document.title = 'Medici · telemedconsult.md';
    Promise.all([
      apiRequest<{ data: PublicDoctor[] }>('/catalog/doctors', { auth: false }),
      apiRequest<{ data: Specialty[] }>('/catalog/specialties', { auth: false })
    ])
      .then(([doctorResponse, specialtyResponse]) => { setDoctors(doctorResponse.data ?? []); setSpecialties(specialtyResponse.data ?? []); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca medicii.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => doctors.filter((doctor) =>
    doctor.name.toLocaleLowerCase('ro').includes(search.toLocaleLowerCase('ro'))
    && (specialty === 'all' || String(doctor.specialty_id) === specialty)), [doctors, search, specialty]);

  const book = (doctor: PublicDoctor) => {
    const target = bookingTarget(doctor.id);
    if (isAuthenticated && role === 'patient') navigate(target);
    else if (isAuthenticated) navigate(`/${role}`);
    else navigate(`/register?next=${encodeURIComponent(target)}`);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8">
      <div className="mb-8 max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary"><Stethoscope className="h-4 w-4" />Medici</span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">Alege medicul</h1>
        <p className="mt-3 text-lg text-slate-500">Prețurile sunt pentru o consultație. Video, de acasă, sau cu examinare la domiciliu.</p>
      </div>

      <div className="mb-6 space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută după numele medicului" aria-label="Caută după numele medicului" className="h-12 bg-white pl-10" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Specialitate">
          {[{ id: 'all', name: 'Toate specialitățile' }, ...specialties.map((item) => ({ id: String(item.id), name: item.name }))].map((item) => (
            <button key={item.id} type="button" role="radio" aria-checked={specialty === item.id} onClick={() => setSpecialty(item.id)}
              className={cn('h-9 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition', specialty === item.id ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
              {item.name}
            </button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-60 animate-pulse rounded-2xl bg-white/60" />)}</div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Niciun medic nu corespunde căutării.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((doctor) => (
            <li key={doctor.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{initialsOf(doctor.name)}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{doctor.name}</p>
                  <p className="text-sm text-slate-500">{doctor.specialty || 'Medic'}</p>
                  <p className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{Number(doctor.rating || 0).toFixed(1)} ({doctor.reviews_count})</span>
                    {doctor.experience_years > 0 && <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" />{doctor.experience_years} ani experiență</span>}
                  </p>
                </div>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                {video && <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><dt className="flex items-center gap-2 text-slate-600"><Video className="h-4 w-4" />Video{doctor.video_duration_minutes ? ` · ${doctor.video_duration_minutes} min` : ''}</dt><dd className="font-semibold tabular-nums text-slate-950">{doctor.video_price ?? '—'} MDL</dd></div>}
                {withExam && <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><dt className="flex items-center gap-2 text-slate-600"><Home className="h-4 w-4" />Cu examinare acasă</dt><dd className="font-semibold tabular-nums text-slate-950">de la {doctor.consultation_price} MDL</dd></div>}
              </dl>
              <Button className="mt-4" disabled={!doctor.is_available} onClick={() => book(doctor)}>{doctor.is_available ? 'Programează' : 'Indisponibil momentan'}</Button>
            </li>
          ))}
        </ul>
      )}

      {!isAuthenticated && (
        <p className="mt-8 text-center text-sm text-slate-500">Pentru programare îți creezi un cont și alegi un pachet: un profil este o persoană din familie, cu fișa ei medicală, activ un an.</p>
      )}
    </div>
  );
}

function initialsOf(name: string): string {
  return name.replace(/^dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
