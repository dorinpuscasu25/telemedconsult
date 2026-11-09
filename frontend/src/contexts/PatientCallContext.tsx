import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { VideoConnection } from '../lib/consultation-video';

/** Un apel video al pacientului, păstrat deschis cât navighează prin aplicație. */
export type PatientCallSession = {
  requestId: string;
  connection: VideoConnection;
  doctorName: string;
  patientName: string | null;
  durationMinutes: number;
};

export type PatientCallSummary = { requestId: string; minutes: number; doctorName: string };

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
  const [session, setSession] = useState<PatientCallSession | null>(null);
  const [summary, setSummary] = useState<PatientCallSummary | null>(null);
  const [expanded, setExpanded] = useState(true);

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
      {(session || summary) && (
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
