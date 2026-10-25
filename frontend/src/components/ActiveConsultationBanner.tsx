import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Video } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, type ApiError } from '../lib/api';
import { Button } from './ui/button';

type ActiveConsultation = {
  id: string;
  status: string;
  doctor_started_at: string | null;
  scheduled_at: string | null;
  doctor_name: string | null;
  patient_code: string | null;
  patient_name: string | null;
  conversation_id: number | null;
  video_available: boolean;
};

export function ActiveConsultationBanner() {
  const { user, role } = useAuth();
  const location = useLocation();
  const owner = `${user?.id}:${role}`;
  const [snapshot, setSnapshot] = useState<{ owner: string; items: ActiveConsultation[] }>({ owner: '', items: [] });

  useEffect(() => {
    if (!user || !role || !['patient', 'doctor', 'operator'].includes(role)) return;
    let cancelled = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching || document.visibilityState === 'hidden') return;
      fetching = true;
      try {
        const response = await apiRequest<{ data: ActiveConsultation[] }>(`/requests/active?role=${role}`);
        if (!cancelled) setSnapshot({ owner, items: response.data });
      } catch (err) {
        if (!cancelled && [401, 403].includes((err as ApiError).status || 0)) setSnapshot({ owner, items: [] });
      } finally { fetching = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [user?.id, role, owner, location.pathname, location.search]);

  const consultations = snapshot.owner === owner ? snapshot.items : [];
  if (!consultations.length || !user || !role) return null;

  // Pe paginile Acasă și pe lista de consultații / vizite informația e deja
  // vizibilă; bara ar repeta-o.
  const listPath = role === 'doctor' ? '/doctor/consultations' : role === 'operator' ? '/operator/patients' : '/patient/consultations';
  if (location.pathname === listPath || location.pathname === `/${role}` || location.pathname === `/${role}/chat`) return null;

  // O singură bară: consultația cea mai urgentă (în desfășurare, apoi cea mai
  // apropiată programare) și un link spre restul. Înainte, fiecare consultație
  // activă avea propriul card mare, iar 3–4 carduri împingeau pagina în jos.
  const sorted = [...consultations].sort((a, b) =>
    Number(Boolean(b.doctor_started_at)) - Number(Boolean(a.doctor_started_at)) ||
    (a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity) - (b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity));
  const consultation = sorted[0];
  const others = consultations.length - 1;
  const inVideo = location.pathname === `/consultations/${consultation.id}/video`;
  if (inVideo) return null;
  const chatPath = `/${role}/chat?${consultation.conversation_id ? `conversation=${consultation.conversation_id}` : `request=${consultation.id}`}`;
  const live = Boolean(consultation.doctor_started_at);
  const scheduled = !live && consultation.scheduled_at && new Date(consultation.scheduled_at).getTime() > Date.now();
  const title = consultation.status === 'rescheduled' ? 'Reprogramare în așteptare' : live ? 'Consultație în desfășurare' : scheduled ? `Programată ${new Intl.DateTimeFormat('ro-MD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(consultation.scheduled_at ?? Date.now()))}` : 'Consultație confirmată';
  const person = role === 'patient' ? [consultation.doctor_name && `Dr. ${consultation.doctor_name}`, consultation.patient_name].filter(Boolean).join(' · ') : consultation.patient_name;

  return <aside aria-label="Consultații active" className={`border-b ${live ? 'border-emerald-200 bg-emerald-50' : 'border-blue-100 bg-blue-50/70'}`}>
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="flex min-w-0 basis-full items-center gap-2.5 sm:flex-1 sm:basis-auto">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-blue-500'}`} />
        </span>
        <p className="min-w-0 text-sm text-slate-700 sm:truncate"><span className="font-semibold text-slate-900">{title}</span>{person ? ` · ${person}` : ''}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {consultation.video_available && <Button asChild size="sm" className={live ? 'bg-emerald-600 hover:bg-emerald-700' : undefined}><Link to={`/consultations/${consultation.id}/video`} state={{ returnTo: location.pathname + location.search }}><Video className="h-4 w-4" />Video</Link></Button>}
        {consultation.conversation_id && <Button asChild size="sm" variant="outline" className="bg-white"><Link to={chatPath}><MessageSquare className="h-4 w-4" />Mesaje</Link></Button>}
        {role === 'doctor' && !others && <Button asChild size="sm" variant="ghost"><Link to={`/doctor/consultations?request=${consultation.id}`}>Deschide</Link></Button>}
        {others > 0 && <Button asChild size="sm" variant="ghost"><Link to={listPath}>+{others} {others === 1 ? 'alta' : 'altele'}</Link></Button>}
      </div>
    </div>
  </aside>;
}
