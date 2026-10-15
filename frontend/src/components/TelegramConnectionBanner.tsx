import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';

type Status = { configured: boolean; feature_enabled: boolean; linked: boolean; notifications_enabled: boolean; deep_link: string | null };

export function TelegramConnectionBanner() {
  const { user, role } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiRequest<{ data: Status }>('/telegram/status').then((response) => setStatus(response.data)).catch(() => undefined), []);

  useEffect(() => {
    setStatus(null);
    load();
    const refresh = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer); };
  }, [user?.id, load]);

  const connect = async () => {
    setError(''); setBusy(true);
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const response = await apiRequest<{ data: Status }>('/telegram/link', { method: 'POST' });
      setStatus(response.data);
      if (response.data.deep_link) {
        if (popup) popup.location.href = response.data.deep_link;
        else window.location.assign(response.data.deep_link);
      } else popup?.close();
    } catch (err) { popup?.close(); setError(err instanceof Error ? err.message : 'Conectarea nu a reușit.'); load(); }
    finally { setBusy(false); }
  };

  if (!status?.configured || !status.feature_enabled || (status.linked && status.notifications_enabled)) return null;
  return <aside className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Notificări Telegram">
    <div className="flex gap-3"><Send className="mt-1 h-5 w-5 shrink-0 text-amber-700" /><div>
      <p className="font-semibold text-slate-900">{status.linked ? 'Notificările Telegram sunt dezactivate' : 'Nu ai conectat Telegram'}</p>
      <p className="text-sm text-slate-700">Pentru a primi notificări despre mesaje și consultații și a nu rata actualizările, îți recomandăm să {status.linked ? 'activezi notificările' : 'conectezi Telegram'}.</p>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div></div>
    {status.linked ? <Button asChild variant="outline"><Link to={`/${role}/telegram`}>Activează notificările</Link></Button> : <Button onClick={connect} disabled={busy}>{busy ? 'Se conectează…' : 'Conectează Telegram'}</Button>}
  </aside>;
}
