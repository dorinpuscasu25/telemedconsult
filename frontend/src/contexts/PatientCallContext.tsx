import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { VideoConnection, VideoStatus } from '../lib/consultation-video';
import { apiRequest, type ApiError } from '../lib/api';
import { useAuth } from './AuthContext';

/** Un apel video al pacientului, păstrat deschis cât navighează prin aplicație. */
export type PatientCallSession = {
  requestId: string;
  connection: VideoConnection;
  doctorName: string;
  patientName: string | null;
  durationMinutes: number;
  startedAt: number | null;
};

export type PatientCallSummary = { requestId: string; minutes: number; doctorName: string; reason?: 'ended' | 'connection_error' | 'completed' | 'unavailable' };

type PatientCallContextValue = {
  session: PatientCallSession | null;
  expanded: boolean;
  start: (session: PatientCallSession) => void;
  setExpanded: (expanded: boolean) => void;
};

const PatientCallContext = createContext<PatientCallContextValue | null>(null);
const PatientCallOverlay = lazy(() => import('../components/patient/PatientCallOverlay'));

/**
 * Ține camera LiveKit a pacientului deasupra rutelor: apelul continuă pe orice
 * pagină, pe tot ecranul sau minimizat într-un colț, până când pacientul iese.
 * Medicul și operatorul nu folosesc acest context.
 */
export function PatientCallProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [session, setSession] = useState<PatientCallSession | null>(null);
  const [summary, setSummary] = useState<PatientCallSummary | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => { setSession(null); setSummary(null); }, [user?.id, role]);
  useEffect(() => {
    if (!session || role !== 'patient') return;
    let alive = true; let fetching = false;
    const stop = (reason: 'completed' | 'unavailable') => {
      if (!alive) return;
      setSession(null);
      setSummary({ requestId: session.requestId, doctorName: session.doctorName, minutes: 0, reason });
    };
    const refresh = async () => {
      if (fetching) return; fetching = true;
      try {
        const status = await apiRequest<VideoStatus>(`/requests/${session.requestId}/video`);
        if (!status.available || (status.consultation?.session_id ?? null) !== (session.connection.session_id ?? null)) stop(status.status === 'completed' ? 'completed' : 'unavailable');
      } catch (error) { if ([401, 403, 404].includes((error as ApiError).status ?? 0)) stop('unavailable'); }
      finally { fetching = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [session, role]);

  const start = useCallback((next: PatientCallSession) => {
    setSummary(null);
    setExpanded(true);
    setSession(next);
  }, []);

  const finish = useCallback((result: PatientCallSummary | null) => {
    setSession(null);
    setSummary(result);
  }, []);

  const value = useMemo(() => ({ session, expanded, start, setExpanded }), [session, expanded, start]);

  return (
    <PatientCallContext.Provider value={value}>
      {children}
      {role === 'patient' && (session || summary) && (
        <Suspense fallback={null}>
          <PatientCallOverlay session={session} summary={summary} expanded={expanded} onExpandedChange={setExpanded} onFinish={finish} onCloseSummary={() => setSummary(null)} />
        </Suspense>
      )}
    </PatientCallContext.Provider>
  );
}

export function usePatientCall(): PatientCallContextValue {
  const value = useContext(PatientCallContext);
  if (!value) throw new Error('usePatientCall must be used within a PatientCallProvider');
  return value;
}
