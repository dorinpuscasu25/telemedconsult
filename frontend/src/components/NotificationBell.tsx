import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, CalendarCheck, CheckCheck, FileText, Gift, Home, MessageSquare, Newspaper, Send, Star, Wallet, type LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { cn } from './ui/utils';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  url?: string | null;
  level?: string | null;
  read_at?: string | null;
  created_at: string;
}

type Kind = 'cal' | 'msg' | 'home' | 'file' | 'star' | 'wallet' | 'gift' | 'news';

const ICONS: Record<Kind, LucideIcon> = { cal: CalendarCheck, msg: MessageSquare, home: Home, file: FileText, star: Star, wallet: Wallet, gift: Gift, news: Newspaper };
const CTA: Partial<Record<Kind, string>> = { cal: 'Vezi consultația', msg: 'Răspunde', home: 'Vezi și confirmă', file: 'Deschide', star: 'Evaluează', news: 'Citește' };
const TZ = 'Europe/Chisinau';

/** Tipul notificării îl deducem din adresă și titlu; backend-ul trimite doar titlu, text și link. */
function kindOf(item: AppNotification): Kind {
  const text = `${item.title} ${item.body}`.toLocaleLowerCase('ro');
  const url = item.url ?? '';
  if (/evalu/.test(text)) return 'star';
  if (/concluzi|document|rețet/.test(text)) return 'file';
  if (url.includes('/chat') || /mesaj/.test(text)) return 'msg';
  if (url.includes('wallet') || /mdl|returnat|alimentar/.test(text)) return 'wallet';
  if (/afiliere|bonus/.test(text)) return 'gift';
  if (url.includes('noutati') || /noutate/.test(text)) return 'news';
  if (/domiciliu|operator|examinare/.test(text)) return 'home';
  return 'cal';
}

function dayKey(date: Date) { return date.toLocaleDateString('en-CA', { timeZone: TZ }); }

function groupOf(value: string): string {
  const date = new Date(value);
  if (dayKey(date) === dayKey(new Date())) return 'Azi';
  if (dayKey(date) === dayKey(new Date(Date.now() - 86400000))) return 'Ieri';
  return 'Mai devreme';
}

function whenOf(value: string): string {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'acum';
  if (minutes < 60) return `acum ${minutes} min`;
  const time = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const group = groupOf(value);
  if (group === 'Azi') return time;
  if (group === 'Ieri') return `ieri, ${time}`;
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: TZ }).replace('.', '');
}

/**
 * Clopoțelul și notificările (N1a pe desktop: panou de 400 px sub clopoțel;
 * N2a pe telefon: tot ecranul). `bare` = fără chenar, pentru antetele de pe telefon.
 */
export function NotificationBell({ bare = false }: { bare?: boolean }) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    apiRequest<{ data: AppNotification[]; unread_count: number }>('/notifications')
      .then((response) => { setItems(response.data ?? []); setUnread(Number(response.unread_count) || 0); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (window.innerWidth >= 1024 && root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const readAll = async () => {
    await apiRequest('/notifications/read', { method: 'POST' }).catch(() => undefined);
    setUnread(0);
    setItems((list) => list.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
  };

  const openItem = (item: AppNotification) => {
    if (!item.read_at) {
      setItems((list) => list.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
      setUnread((value) => Math.max(0, value - 1));
      void apiRequest(`/notifications/${item.id}/read`, { method: 'POST' }).catch(() => undefined);
    }
    if (item.url) { setOpen(false); navigate(item.url.replace(/^https?:\/\/[^/]+/, '')); }
  };

  const visible = useMemo(() => {
    const list = items.filter((item) => tab === 'all' || !item.read_at);
    return expanded ? list : list.slice(0, 12);
  }, [items, tab, expanded]);
  const groups = useMemo(() => {
    const result: Array<{ label: string; items: AppNotification[] }> = [];
    for (const item of visible) {
      const label = groupOf(item.created_at);
      const group = result.find((entry) => entry.label === label) ?? (result.push({ label, items: [] }), result[result.length - 1]);
      group.items.push(item);
    }
    return result;
  }, [visible]);
  const hiddenCount = items.filter((item) => tab === 'all' || !item.read_at).length - visible.length;

  const segment = (key: 'all' | 'unread', label: string, mobile: boolean) => (
    <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
      className={cn('rounded-lg font-medium', mobile ? 'h-9 text-sm' : 'h-8 text-[13px]', tab === key ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>
      {label}
    </button>
  );

  const list = (mobile: boolean) => (
    <>
      <div className={cn('grid grid-cols-2 gap-0.5 rounded-[10px] bg-slate-100 p-[3px]', mobile && 'mx-4 mb-2.5')}>
        {segment('all', 'Toate', mobile)}
        {segment('unread', `Necitite${unread ? ` (${unread})` : ''}`, mobile)}
      </div>
      <div className={cn('overflow-y-auto', mobile ? 'min-h-0 flex-1' : 'mt-3 max-h-[520px]')}>
        {groups.map((group) => (
          <div key={group.label}>
            <div className="border-t border-slate-100 bg-slate-50 px-4 pb-1.5 pt-2.5 text-xs font-semibold text-slate-500">{group.label}</div>
            {group.items.map((item) => {
              const kind = kindOf(item);
              const Icon = ICONS[kind];
              const isUnread = !item.read_at;
              const warn = item.level === 'warning' || kind === 'star';
              return (
                <div key={item.id} role="button" tabIndex={0} onClick={() => openItem(item)} onKeyDown={(event) => { if (event.key === 'Enter') openItem(item); }}
                  className={cn('flex cursor-pointer gap-3 border-t border-slate-100 px-4 py-3 hover:bg-slate-50', isUnread ? 'bg-[#F8FAFF]' : 'bg-white')}>
                  <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', warn ? 'bg-orange-50 text-orange-600' : isUnread ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500')}><Icon className="h-[18px] w-[18px]" /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className={cn('text-sm leading-[1.4] text-slate-950', isUnread ? 'font-semibold' : 'font-normal')}>{item.title}</span>
                    <span className="line-clamp-2 text-xs text-slate-500">{[item.body, whenOf(item.created_at)].filter(Boolean).join(' · ')}</span>
                    {item.url && CTA[kind] && <span className="mt-[5px] flex h-8 items-center self-start whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-950">{CTA[kind]}</span>}
                  </span>
                  {isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                </div>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <p className={cn('px-4 text-center text-sm text-slate-500', mobile ? 'py-10' : 'py-8')}>Ai citit tot. Notificările noi apar aici.</p>}
      </div>
    </>
  );

  const telegramLink = role ? `/${role}/telegram` : '/';

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => { setOpen((value) => !value); if (!open) load(); }} aria-label="Notificări" aria-expanded={open}
        className={cn('relative grid place-items-center rounded-[10px] text-slate-700 transition', bare ? 'h-10 w-10 hover:bg-slate-100' : 'h-[42px] w-[42px] border', !bare && (open ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'))}>
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className={cn('absolute grid place-items-center rounded-full border-2 bg-blue-600 font-bold text-white', bare ? 'right-0 top-0.5 h-[18px] min-w-[18px] border-slate-50 px-1 text-[10px]' : '-right-1.5 -top-1.5 h-5 min-w-5 border-white px-[5px] text-[11px]')}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* N1a: panoul de pe desktop */}
          <div className="absolute right-0 top-[52px] z-50 hidden w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,.18)] lg:flex" role="dialog" aria-label="Notificări">
            <div className="px-4 pb-3 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-base font-semibold text-slate-950">Notificări</span>
                {unread > 0 && <button type="button" onClick={() => void readAll()} className="flex items-center gap-1 py-1 text-[13px] font-medium text-blue-600"><CheckCheck className="h-4 w-4" />Marchează toate ca citite</button>}
              </div>
              {list(false)}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <Link to={telegramLink} onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-[13px] font-medium text-blue-600"><Send className="h-4 w-4" />Primește-le și pe Telegram</Link>
              {hiddenCount > 0 && <button type="button" onClick={() => setExpanded(true)} className="text-[13px] font-medium text-slate-700">Vezi toate</button>}
            </div>
          </div>

          {/* N2a: tot ecranul pe telefon */}
          <div className="fixed inset-0 z-[60] flex flex-col bg-white pt-[env(safe-area-inset-top)] lg:hidden" role="dialog" aria-label="Notificări">
            <div className="flex items-center gap-1 px-2 pb-2.5 pt-2">
              <button type="button" onClick={() => setOpen(false)} aria-label="Înapoi" className="grid h-10 w-10 place-items-center text-slate-700"><ArrowLeft className="h-5 w-5" /></button>
              <span className="flex-1 text-lg font-semibold text-slate-950">Notificări</span>
              {unread > 0 && <button type="button" onClick={() => void readAll()} className="h-10 px-3 text-[13px] font-medium text-blue-600">Citite toate</button>}
            </div>
            {list(true)}
            <Link to={telegramLink} onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-3.5 text-sm font-medium text-blue-600"><Send className="h-4 w-4" />Primește-le și pe Telegram</Link>
          </div>
        </>
      )}
    </div>
  );
}
