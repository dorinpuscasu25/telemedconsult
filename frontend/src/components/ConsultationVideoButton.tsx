import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { LocalUserChoices } from '@livekit/components-react';
import { Video } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const VideoCallPanel = lazy(() => import('./VideoCallPanel'));

type VideoStatus = { available: boolean; configured: boolean; status: string };
type Connection = { server_url: string; participant_token: string; choices: LocalUserChoices };

export function ConsultationVideoButton({ requestId }: { requestId: string | number }) {
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [open, setOpen] = useState(false);
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
        if (!next.available) {
          attempt.current += 1;
          setConnection(null);
          setJoining(false);
        }
      } catch {
        // Retry after transient network failures; token issuance checks access again.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { cancelled = true; attempt.current += 1; window.clearInterval(interval); };
  }, [requestId]);

  const close = (value: boolean) => {
    setOpen(value);
    if (!value) {
      attempt.current += 1;
      setConnection(null);
      setJoining(false);
      setError('');
    }
  };

  const join = async (choices: LocalUserChoices) => {
    if (joining) return;
    const currentAttempt = ++attempt.current;
    setJoining(true);
    setError('');
    try {
      const token = await apiRequest<Omit<Connection, 'choices'>>(`/requests/${requestId}/video/token`, { method: 'POST' });
      if (attempt.current === currentAttempt) setConnection({ ...token, choices });
    } catch (err) {
      if (attempt.current === currentAttempt) setError(err instanceof Error ? err.message : 'Nu am putut deschide apelul.');
    } finally {
      if (attempt.current === currentAttempt) setJoining(false);
    }
  };

  if (!status?.available && !open) return null;

  return <>
    <Button variant="outline" className="rounded-xl" onClick={() => close(true)}>
      <Video className="mr-2 h-4 w-4" /> Intră în consultația video
    </Button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Consultație video</DialogTitle>
          <DialogDescription>Verifică microfonul și camera. Poți ieși și reveni cât timp consultația este activă.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
        {!status?.available ? <p>Consultația nu mai este disponibilă pentru apel.</p>
          : !status.configured ? <p>LiveKit nu este încă configurat. Contactează administratorul.</p>
          : <Suspense fallback={<p>Se încarcă interfața video...</p>}>
              <VideoCallPanel connection={connection} joining={joining} onJoin={join}
                onDisconnected={() => { setConnection(null); setError('Ai ieșit din apel. Poți intra din nou dacă consultația este activă.'); }}
                onConnectionError={() => { setConnection(null); setError('Conexiunea video a eșuat. Verifică internetul și permisiunile pentru cameră și microfon, apoi încearcă din nou.'); }}
                onDeviceError={() => setError('Permite accesul la cameră și microfon în browser. Poți intra și cu acestea oprite.')} />
            </Suspense>}

      </DialogContent>
    </Dialog>
  </>;
}
