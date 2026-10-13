import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, Stethoscope, Video } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, type ApiError } from '../lib/api';
import { Button } from './ui/button';

type ActiveConsultation = {
  id: string;
  status: string;
  doctor_started_at: string | null;
  scheduled_at: string | null;
  doctor_name: string | null;
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
  return <aside aria-label="Consultații active" className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-4 sm:px-6 lg:px-8">
    {consultations.map((consultation) => {
      const inVideo = location.pathname === `/consultations/${consultation.id}/video`;
      const chatPath = `/${role}/chat?${consultation.conversation_id ? `conversation=${consultation.conversation_id}` : `request=${consultation.id}`}`;
      const scheduled = !consultation.doctor_started_at && consultation.scheduled_at && new Date(consultation.scheduled_at).getTime() > Date.now();
      const title = consultation.status === 'rescheduled' ? 'Consultație în reprogramare' : consultation.doctor_started_at ? 'Consultație în desfășurare' : scheduled ? 'Consultație programată' : 'Consultație acceptată';
      const otherPerson = role === 'patient' ? consultation.doctor_name : consultation.patient_name;
      return <div key={consultation.id} className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3"><span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Stethoscope size={20} /><span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" /></span><div><p className="text-sm font-semibold text-slate-900">{title}{otherPerson ? ` · ${otherPerson}` : ''}</p><p className="mt-0.5 text-xs text-slate-500">{scheduled ? `Programată pentru ${new Intl.DateTimeFormat('ro-MD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(consultation.scheduled_at!))}.` : 'Poți reveni aici până când medicul finalizează consultația.'}</p></div></div>
        <div className="flex flex-wrap items-center gap-2">
          {consultation.video_available && !inVideo && <Button asChild className="bg-gradient-to-r from-primary to-purple-600 text-white shadow-sm"><Link to={`/consultations/${consultation.id}/video`} state={{ returnTo: location.pathname + location.search }}><Video size={16} /> Revino la video</Link></Button>}
          {inVideo && <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Pagina apelului este deschisă</span>}
          {consultation.conversation_id && <Button asChild variant="outline"><Link to={chatPath}><MessageSquare size={16} /> Revino la chat</Link></Button>}
          {role === 'doctor' && !inVideo && <Button asChild variant="ghost"><Link to="/doctor/consultations">Vezi consultația</Link></Button>}
        </div>
      </div>;
    })}
  </aside>;
}
