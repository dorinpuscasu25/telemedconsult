import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Video } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Button } from './ui/button';

type VideoStatus = { available: boolean; configured: boolean; status: string };

export function ConsultationVideoButton({ requestId }: { requestId: string | number }) {
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const location = useLocation();
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await apiRequest<VideoStatus>(`/requests/${requestId}/video`);
        if (!cancelled) setStatus(next);
      } catch { /* Retry transient failures. The call page checks access again. */ }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [requestId]);
  if (!status?.available) return null;
  return <Button asChild size="lg" className="rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white shadow-md shadow-primary/20 hover:brightness-110">
    <Link to={`/consultations/${requestId}/video`} state={{ returnTo: location.pathname + location.search }}><Video className="mr-2 h-5 w-5" /> Intră în consultația video</Link>
  </Button>;
}
