import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import { cn } from '../components/ui/utils';
import { apiRequest } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../lib/use-page-title';

type Category = 'requests' | 'messages' | 'payments' | 'reminders';

interface TelegramStatus {
  configured: boolean;
  feature_enabled: boolean;
  bot_username: string | null;
  linked: boolean;
  telegram_username: string | null;
  linked_at: string | null;
  notifications_enabled: boolean;
  categories?: Record<Category, boolean>;
  deep_link: string | null;
  token_expires_at: string | null;
}

/** Cât de des întrebăm serverul dacă utilizatorul a apăsat Start în bot. */
const POLL_INTERVAL_MS = 3000;
const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const hm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const CATEGORIES: Array<[Category, string, string]> = [
  ['requests', 'Cereri noi', 'Imediat ce un pacient te programează'],
  ['messages', 'Mesaje', 'Când pacientul îți scrie'],
  ['payments', 'Plăți', 'Când primești bani pentru o consultație'],
  ['reminders', 'Reamintiri', 'Cu 15 minute înainte de consultație']
];

/**
 * X1a: trei stări — neconectat, așteaptă Start și conectat. După conectare,
 * utilizatorul alege ce primește.
 */
export function TelegramPage() {
  const { role } = useAuth();
  usePageTitle('Notificări Telegram');
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const linkFailed = useRef(false);

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

  const issueLink = useCallback(async (refresh = false) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/link', { method: 'POST', body: JSON.stringify({ refresh }) });
      setStatus(response.data);
      linkFailed.current = false;
    } catch (err) {
      linkFailed.current = true;
      setError(err instanceof Error ? err.message : 'Nu am putut genera linkul de conectare.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Un link valid e mereu pregătit cât timp contul nu e conectat, ca butonul să
  // fie un `<a href>` real pe care niciun popup blocker nu-l oprește.
  useEffect(() => {
    if (loading || busy || linkFailed.current) return;
    if (status?.configured && !status.linked && !status.deep_link) void issueLink();
  }, [loading, busy, status?.configured, status?.linked, status?.deep_link, issueLink]);

  useEffect(() => {
    if (!waiting || status?.linked) return undefined;
    const timer = window.setInterval(() => { void load(); }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, status?.linked, load]);

  useEffect(() => { if (status?.linked) setWaiting(false); }, [status?.linked]);

  const unlink = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/unlink', { method: 'POST' });
      setStatus(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut deconecta Telegram.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (body: Record<string, unknown>, optimistic: Partial<TelegramStatus>) => {
    const previous = status;
    setStatus((current) => (current ? { ...current, ...optimistic } : current));
    try {
      const response = await apiRequest<{ data: TelegramStatus }>('/telegram/preferences', { method: 'POST', body: JSON.stringify(body) });
      setStatus(response.data);
    } catch (err) {
      setStatus(previous);
      setError(err instanceof Error ? err.message : 'Nu am putut salva preferința.');
    }
  };

  const copy = async () => {
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
    return <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Se încarcă…</div>;
  }

  const linkedAt = status?.linked_at ? new Date(status.linked_at) : null;
  const expires = status?.token_expires_at ? hm(new Date(status.token_expires_at)) : null;
  const categories = status?.categories ?? { requests: true, messages: true, payments: true, reminders: false };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-[-.02em] text-slate-950">Notificări Telegram</h1>
        <span className="text-sm text-slate-500">Primești pe loc fiecare cerere nouă, mesaj sau plată.</span>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {(!status?.configured || !status.feature_enabled) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {!status?.configured ? 'Botul de Telegram nu este configurat pe server. Contactează administratorul platformei.' : 'Notificările prin Telegram sunt oprite momentan la nivel de platformă.'}
        </div>
      )}

      {role === 'admin' && <BotHealthCard />}

      {status?.linked ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-[18px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold text-slate-950">Conectat{status.telegram_username ? ` ca @${status.telegram_username}` : ''}</span>
              {linkedAt && <span className="text-[13px] text-slate-500">Din {linkedAt.getDate()} {MONTHS[linkedAt.getMonth()]} {linkedAt.getFullYear()}, {hm(linkedAt)}</span>}
            </div>
            <button type="button" onClick={() => void unlink()} disabled={busy} className="h-9 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50">Deconectează</button>
          </div>
          {!status.notifications_enabled && (
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-amber-50 px-5 py-3 text-[13px] text-amber-900">
              Ai oprit toate notificările pe Telegram.
              <button type="button" onClick={() => void save({ enabled: true }, { notifications_enabled: true })} className="font-semibold text-blue-600">Pornește-le</button>
            </div>
          )}
          {CATEGORIES.map(([key, label, sub], index) => {
            const on = categories[key];
            return (
              <button key={key} type="button" role="switch" aria-checked={on} onClick={() => void save({ categories: { [key]: !on } }, { categories: { ...categories, [key]: !on } })}
                className={cn('flex w-full items-center justify-between bg-white px-5 py-3.5 text-left', index > 0 && 'border-t border-slate-100')}>
                <span className="flex flex-col gap-0.5"><span className="text-sm font-medium text-slate-950">{label}</span><span className="text-xs text-slate-500">{sub}</span></span>
                <Toggle on={on} />
              </button>
            );
          })}
        </div>
      ) : waiting ? (
        <div className="flex flex-col gap-3.5 rounded-2xl border border-blue-200 bg-white p-6">
          <span className="text-base font-semibold text-slate-950">Aștept să apeși Start în Telegram…</span>
          <span className="text-sm text-slate-600">Nu s-a deschis Telegram? Copiază linkul și deschide-l pe telefon.{expires ? ` Expiră la ${expires}.` : ''}</span>
          <div className="flex gap-2">
            <div className="flex h-10 min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap rounded-[10px] border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700">{status?.deep_link?.replace(/^https?:\/\//, '') ?? '…'}</div>
            <button type="button" onClick={() => void copy()} className="h-10 rounded-[10px] border border-slate-200 bg-white px-3.5 text-[13px] font-medium hover:bg-slate-50">{copied ? 'Copiat' : 'Copiază'}</button>
          </div>
          <div className="flex gap-2.5">
            {status?.deep_link && <a href={status.deep_link} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center rounded-[10px] bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700">Deschide Telegram din nou</a>}
            <button type="button" onClick={() => setWaiting(false)} className="h-10 px-3.5 text-sm font-medium text-slate-600">Anulează</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6">
          <span className="text-base font-semibold text-slate-950">Conectează-ți contul în doi pași</span>
          <div className="flex items-center gap-3 text-sm text-slate-950"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold">1</span>Apasă butonul de mai jos. Se deschide conversația cu botul.</div>
          <div className="flex items-center gap-3 text-sm text-slate-950"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold">2</span>Apasă Start în Telegram. Contul se leagă singur.</div>
          {status?.bot_username && <span className="text-[13px] text-slate-500">Sau caută în Telegram <b className="text-slate-700">@{status.bot_username}</b>, apasă Start și apoi „📱 Trimite numărul meu”: te conectăm după telefonul din cont.</span>}
          {status?.deep_link ? (
            <a href={status.deep_link} target="_blank" rel="noopener noreferrer" onClick={() => setWaiting(true)} className="flex h-11 items-center gap-2 self-start rounded-[10px] bg-blue-600 px-[18px] text-[15px] font-semibold text-white hover:bg-blue-700">
              <Send className="h-4 w-4" />Conectează Telegram
            </a>
          ) : (
            <button type="button" disabled className="flex h-11 items-center gap-2 self-start rounded-[10px] bg-blue-300 px-[18px] text-[15px] font-semibold text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{status?.configured ? 'Se pregătește linkul…' : 'Indisponibil'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cn('flex h-5 w-9 shrink-0 items-center rounded-full p-0.5', on ? 'bg-blue-600' : 'bg-slate-300')}>
      <span className={cn('h-4 w-4 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
    </span>
  );
}

type BotHealth = { configured: boolean; mode: 'webhook' | 'polling'; healthy: boolean; webhook_set: boolean; webhook_matches: boolean; pending_updates: number; last_error: string | null; problem: string | null };

/** Doar pentru admin: botul primește mesajele sau nu, de ce, și reparare cu un clic. */
function BotHealthCard() {
  const [health, setHealth] = useState<BotHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    apiRequest<{ data: BotHealth }>('/admin/telegram/bot').then((response) => setHealth(response.data)).catch((err) => setNote(err instanceof Error ? err.message : 'Nu am putut verifica botul.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const repair = async () => {
    setBusy(true);
    setNote('');
    try {
      const response = await apiRequest<{ message: string; data: BotHealth }>('/admin/telegram/bot/repair', { method: 'POST' });
      setHealth(response.data);
      setNote(response.message);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Repararea nu a reușit.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border p-5', !health ? 'border-slate-200 bg-white' : health.healthy ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold tracking-[.04em] text-slate-500">BOTUL (VIZIBIL DOAR PENTRU ADMIN)</span>
          <span className="text-base font-semibold text-slate-950">{!health ? 'Se verifică…' : health.healthy ? 'Botul primește mesajele' : 'Botul nu primește mesajele'}</span>
          {health?.problem && <span className="text-sm text-red-800">{health.problem}</span>}
          {health && <span className="text-xs text-slate-500">Mod: {health.mode === 'polling' ? 'serverul citește singur mesajele' : 'webhook'}{health.pending_updates ? ` · ${health.pending_updates} mesaje în așteptare` : ''}</span>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={load} className="h-9 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium hover:bg-slate-50">Verifică</button>
          {health && !health.healthy && health.configured && <button type="button" disabled={busy} onClick={() => void repair()} className="h-9 rounded-[10px] bg-blue-600 px-3 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Se repară…' : 'Repară'}</button>}
        </div>
      </div>
      {note && <span className="text-[13px] text-slate-700">{note}</span>}
      <span className="text-xs text-slate-500">Serverul verifică și repară singur legătura la fiecare 5 minute.</span>
    </div>
  );
}
