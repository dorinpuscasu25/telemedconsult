import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { LocalUserChoices } from '@livekit/components-react';
import { ArrowLeft, Video, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest, type ApiError } from '../../lib/api';
import { Button } from '../../components/ui/button';

const VideoCallPanel = lazy(() => import('../../components/VideoCallPanel'));
type VideoStatus = { available: boolean; configured: boolean; status: string };
type Connection = { server_url: string; participant_token: string; choices: LocalUserChoices };

export function VideoConsultationPage() {
  const { requestId } = useParams();
  const location = useLocation();
  const { role } = useAuth();
  const returnTo = location.state?.returnTo || (role === 'doctor' ? '/doctor/consultations' : `/${role || 'patient'}/chat`);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await apiRequest<VideoStatus>(`/requests/${requestId}/video`);
        if (cancelled) return;
        setStatus(next);
        if (!next.available) { attempt.current += 1; setConnection(null); setJoining(false); }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Nu am putut verifica consultația.');
        if ([401, 403, 404].includes((err as ApiError).status || 0)) {
          attempt.current += 1; setConnection(null); setJoining(false);
          setStatus({ available: false, configured: false, status: 'unavailable' });
        }
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { cancelled = true; attempt.current += 1; window.clearInterval(interval); };
  }, [requestId]);

  const join = async (choices: LocalUserChoices) => {
    if (joining) return;
    const currentAttempt = ++attempt.current;
    setJoining(true); setError('');
    try {
      const token = await apiRequest<Omit<Connection, 'choices'>>(`/requests/${requestId}/video/token`, { method: 'POST' });
      if (attempt.current === currentAttempt) setConnection({ ...token, choices });
    } catch (err) {
      if (attempt.current === currentAttempt) setError(err instanceof Error ? err.message : 'Nu am putut deschide apelul.');
    } finally { if (attempt.current === currentAttempt) setJoining(false); }
  };

  return <main className="mx-auto w-full max-w-[1600px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><Link to={returnTo} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary"><ArrowLeft size={16} /> Înapoi la consultație</Link>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 sm:text-3xl"><span className="rounded-2xl bg-gradient-to-br from-primary to-purple-600 p-3 text-white"><Video size={24} /></span> Consultație video</h1>
        <p className="mt-2 text-sm text-slate-500">{connection ? 'Ești în apel. Controlează camera și microfonul din bara de jos.' : 'Verifică dispozitivele, apoi intră în apel cu medicul sau pacientul.'}</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-sm text-primary"><ShieldCheck size={16} /> Acces doar pentru participanți</span>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {!status ? <p className="p-12 text-center text-slate-500">Se verifică disponibilitatea apelului...</p>
        : !status.available ? <div className="space-y-4 p-12 text-center"><h2 className="text-xl font-semibold">Apelul nu este disponibil</h2><p className="text-slate-500">Consultația trebuie să fie acceptată și activă pentru a intra în apel.</p><Button asChild variant="outline"><Link to={returnTo}>Înapoi</Link></Button></div>
        : !status.configured ? <p className="p-12 text-center text-slate-600">Apelurile video nu sunt încă configurate. Contactează administratorul.</p>
        : <Suspense fallback={<p className="p-12 text-center text-slate-500">Se încarcă interfața video...</p>}>
          <VideoCallPanel connection={connection} joining={joining} onJoin={join}
            onDisconnected={() => { setConnection(null); setError('Ai ieșit din apel. Poți intra din nou cât timp consultația este activă.'); }}
            onConnectionError={() => { setConnection(null); setError('Conexiunea video a eșuat. Verifică internetul și încearcă din nou.'); }}
            onDeviceError={() => setError('Permite accesul la cameră și microfon. Poți intra și cu acestea oprite.')} />
        </Suspense>}
    </section>
    <p className="text-center text-xs text-slate-500">Ieșirea din apel nu finalizează consultația. Poți reveni cât timp aceasta este activă.</p>
  </main>;
}
