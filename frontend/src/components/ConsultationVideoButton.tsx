import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Video } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Button, type ButtonProps } from './ui/button';

type VideoStatus = { available: boolean; configured: boolean; status: string };

export function ConsultationVideoButton({ requestId, size = 'sm', variant = 'default', className, label = 'Intră în apelul video' }: { requestId: string | number; size?: ButtonProps['size']; variant?: ButtonProps['variant']; className?: string; label?: string }) {
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
  if (!status || status.status !== 'accepted') return null;
  return <Button asChild size={size} variant={variant} className={className}>
    <Link to={`/consultations/${requestId}/video`} state={{ returnTo: location.pathname + location.search }}><Video className="h-4 w-4" />{label}</Link>
  </Button>;
}
