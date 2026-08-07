import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Check, Copy, Loader2, Link2Off, BellRing, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { apiRequest } from '../lib/api';

interface TelegramStatus {
  configured: boolean;
  feature_enabled: boolean;
  bot_username: string | null;
  linked: boolean;
  telegram_username: string | null;
  linked_at: string | null;
  notifications_enabled: boolean;
  deep_link: string | null;
  token_expires_at: string | null;
}

/** Cât de des întrebăm serverul dacă utilizatorul a apăsat Start în bot. */
const POLL_INTERVAL_MS = 3000;

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

export function TelegramPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/status');
      setStatus(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca starea conectării.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Dacă emiterea linkului eșuează, nu reîncercăm automat — altfel efectul de
  // mai jos ar intra în buclă de request-uri cât timp serverul răspunde cu eroare.
  const linkFailedRef = useRef(false);

  const issueLink = useCallback(async (refresh = false) => {
    setBusy(true);
    setError('');

    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/link', {
        method: 'POST',
        body: JSON.stringify({ refresh })
      });
      setStatus(response.data);
      linkFailedRef.current = false;
    } catch (err) {
      linkFailedRef.current = true;
      setError(err instanceof Error ? err.message : 'Nu am putut genera linkul de conectare.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ținem mereu un link valid pregătit cât timp contul nu e conectat: la prima
  // încărcare, după deconectare și după expirarea tokenului. Astfel butonul e un
  // `<a href>` real, pe care niciun popup blocker nu îl oprește.
  useEffect(() => {
    if (loading || busy || linkFailedRef.current) return;

    if (status?.configured && !status.linked && !status.deep_link) {
      issueLink();
    }
  }, [loading, busy, status?.configured, status?.linked, status?.deep_link, issueLink]);

  // Polling doar cât timp există un link activ și contul nu e încă conectat.
  useEffect(() => {
    const waiting = Boolean(status?.deep_link) && !status?.linked;

    if (!waiting) return undefined;

    const timer = window.setInterval(async () => {
      const next = await load();
      if (next?.linked) {
        setMessage('Telegram conectat. Vei primi notificările aici.');
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [status?.deep_link, status?.linked, load]);

  const unlink = async () => {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/unlink', { method: 'POST' });
      setStatus(response.data);
      setMessage('Telegram deconectat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut deconecta Telegram.');
    } finally {
      setBusy(false);
    }
  };

  const togglePreference = async (enabled: boolean) => {
    const previous = status;
    setStatus((current) => (current ? { ...current, notifications_enabled: enabled } : current));
    setError('');
    setMessage('');

    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/preferences', {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
      setStatus(response.data);
    } catch (err) {
      setStatus(previous);
      setError(err instanceof Error ? err.message : 'Nu am putut salva preferința.');
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/telegram/test', { method: 'POST' });
      setMessage('Ți-am trimis un mesaj de test în Telegram.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite mesajul de test.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!status?.deep_link) return;

    try {
      await navigator.clipboard.writeText(status.deep_link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Nu am putut copia linkul. Selectează-l manual.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" />
        Se încarcă…
      </div>
    );
  }

  const waitingForStart = Boolean(status?.deep_link) && !status?.linked;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Send className="size-5 text-sky-500" />
          Notificări Telegram
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Primește instant în Telegram fiecare programare, consultație, mesaj sau plată nouă.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {!status?.configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Botul de Telegram nu este configurat pe server. Contactează administratorul platformei.</span>
        </div>
      )}

      {status?.configured && !status.feature_enabled && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Notificările prin Telegram sunt oprite momentan la nivel de platformă.</span>
        </div>
      )}

      {status?.linked ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100">
                <Check className="size-3.5 text-emerald-600" />
              </span>
              Cont conectat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Cont Telegram</dt>
                <dd className="font-medium text-slate-900">
                  {status.telegram_username ? `@${status.telegram_username}` : 'conectat'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Conectat la</dt>
                <dd className="font-medium text-slate-900">{formatDate(status.linked_at)}</dd>
              </div>
            </dl>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <BellRing className="size-4 text-slate-400" />
                  Notificări active
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Oprește-le temporar fără să deconectezi contul.
                </p>
              </div>
              <Switch
                checked={status.notifications_enabled}
                onCheckedChange={togglePreference}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={sendTest} disabled={busy}>
                <Send className="size-4" />
                Trimite mesaj de test
              </Button>
              <Button variant="destructive" onClick={unlink} disabled={busy}>
                <Link2Off className="size-4" />
                Deconectează
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conectează-ți contul în doi pași</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  1
                </span>
                <span>Apasă butonul de mai jos — te ducem direct în conversația cu botul.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                  2
                </span>
                <span>
                  Apasă <b>Start</b> în Telegram. Atât — contul se leagă singur, nu trebuie să copiezi niciun ID.
                </span>
              </li>
            </ol>

            {status?.deep_link ? (
              <Button asChild size="lg" className="w-full bg-sky-500 text-white hover:bg-sky-500/90">
                <a href={status.deep_link} target="_blank" rel="noopener noreferrer">
                  <Send className="size-4" />
                  Conectează Telegram
                </a>
              </Button>
            ) : (
              <Button size="lg" className="w-full" disabled>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {status?.configured ? 'Se pregătește linkul…' : 'Indisponibil'}
              </Button>
            )}

            {waitingForStart && (
              <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-sky-900">
                  <Loader2 className="size-4 animate-spin" />
                  Aștept să apeși Start în Telegram…
                </p>
                <p className="text-xs text-sky-800">
                  Nu s-a deschis Telegram? Copiază linkul și deschide-l pe telefon. Linkul expiră la{' '}
                  {formatDate(status?.token_expires_at ?? null)}.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                    {status?.deep_link}
                  </code>
                  <Button variant="outline" size="sm" onClick={copyLink}>
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? 'Copiat' : 'Copiază'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => issueLink(true)} disabled={busy}>
                    <RefreshCw className="size-3.5" />
                    Link nou
                  </Button>
                </div>
              </div>
            )}

            {status?.bot_username && (
              <p className="text-xs text-slate-500">
                Botul platformei este <b>@{status.bot_username}</b>. În Telegram poți oricând scrie{' '}
                <code>/status</code> sau <code>/stop</code>.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
