import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, ClipboardList, Clock, Folder, Home, MessageSquare, MessagesSquare, Paperclip, Search, Send, Video } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { cn } from '../../components/ui/utils';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { patientAge } from '../../lib/medical-record';
import type { PatientConsultation } from '../../lib/patient-consultations';
import { getEcho } from '../../lib/realtime';

type ChatUser = { id: number; name: string };
type Message = { id: number; body: string; sender_id: number; sender?: ChatUser; type?: 'text' | 'image' | 'file' | 'system'; metadata?: { file_name?: string; url?: string } | null; created_at: string };
type ChatState = { state: 'pending' | 'open' | 'reactivatable' | 'closed'; can_write: boolean; can_reactivate: boolean; message: string | null; reactivate_until?: string | null; reactivation_price?: number | null; reactivation_hours?: number | null };
type Conversation = {
  id: number;
  is_direct?: boolean;
  patient_profile_id?: number | null;
  patient_profile?: { id: number; display_name: string; patient_code?: string; birth_date?: string; medical_record?: Record<string, unknown> };
  unread_count?: number;
  chat?: ChatState;
  status: string;
  consultation_request_id?: number | null;
  consultation_request?: { id: number; free_chat_until?: string | null; chat_expires_at?: string | null } | null;
  patient_id: number;
  doctor_id?: number | null;
  operator_id?: number | null;
  doctor?: ChatUser | null;
  operator?: ChatUser | null;
  messages: Message[];
  created_at: string;
};
type Peer = { key: string; role: 'doctor' | 'operator'; id: number; name: string; unread: number; last?: Message; lastAt: number; patients: Array<{ id: number; name: string; unread: number }>; hasDirect: boolean; directUnread: number };
type Channel = { key: string; title: string; fullName: string; code?: string; unread: number; last?: string; lastAt: number; state: { label: string; className: string } | null; statusLine: string };

const DIRECT = 'direct';

/**
 * Chatul pacientului (v2): medici → canale → conversație. Fiecare medic are câte un
 * canal pentru fiecare pacient cu consultații la el și, separat, „Discuție directă”.
 * În canal, consultațiile sunt episoade într-o singură cronologie. Apelul îl pornește
 * medicul; pacientul nu are buton de apel.
 */
export function PatientChatView() {
  const { user } = useAuth();
  const currentUserId = user ? Number(user.id) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Record<string, PatientConsultation>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // Pe telefon, conversația e deschisă cât timp URL-ul are un medic sau o conversație (C2b, fără navigația de jos).
  const mobileChat = Boolean(searchParams.get('conversation') || searchParams.get('request') || searchParams.get('doctor') || searchParams.get('operator'));
  const [recordOpen, setRecordOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Câte mesaje erau necitite când am deschis canalul: de aici pornește „Mesaje noi”.
  const [newFrom, setNewFrom] = useState<Record<string, number>>({});

  useEffect(() => { document.title = 'Mesaje · telemedconsult.md'; }, []);

  const load = useCallback(async () => {
    try {
      const [conversationResponse, requestResponse] = await Promise.all([
        apiRequest<{ data: Conversation[] }>('/conversations'),
        apiRequest<{ data: PatientConsultation[] }>('/requests').catch(() => ({ data: [] as PatientConsultation[] }))
      ]);
      setConversations(conversationResponse.data ?? []);
      setRequests(Object.fromEntries((requestResponse.data ?? []).map((item) => [String(item.id), item])));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversațiile nu au putut fi încărcate.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);

  // Mesajele noi vin pe canalul utilizatorului; reîncărcăm lista (ușor, o singură cerere).
  useEffect(() => {
    const echo = getEcho();
    if (!echo || !currentUserId) return;
    const name = `App.Models.User.${currentUserId}`;
    echo.private(name).listen('.conversation.message.sent', () => void load()).listen('.conversation.updated', () => void load());
    return () => { echo.leave(name); };
  }, [currentUserId, load]);

  const peers = useMemo(() => buildPeers(conversations), [conversations]);
  const specialties = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of conversations) {
      const request = item.consultation_request_id ? requests[String(item.consultation_request_id)] : undefined;
      if (request?.specialty) map[peerKeyOf(item)] = request.specialty;
    }
    return map;
  }, [conversations, requests]);

  // Ce e selectat vine din URL: ?doctor= / ?operator=, ?channel= (id pacient sau „direct”), ?conversation= / ?request=.
  const target = useMemo(() => {
    const byConversation = conversations.find((item) => String(item.id) === searchParams.get('conversation'))
      ?? conversations.find((item) => String(item.consultation_request_id) === searchParams.get('request'));
    const doctorParam = searchParams.get('doctor');
    const operatorParam = searchParams.get('operator');
    const peerKey = byConversation ? peerKeyOf(byConversation) : doctorParam ? `doctor:${doctorParam}` : operatorParam ? `operator:${operatorParam}` : peers[0]?.key;
    const channel = byConversation ? channelKeyOf(byConversation) : searchParams.get('channel') ?? searchParams.get('tab') ?? searchParams.get('patient_profile');
    return { peerKey, channel };
  }, [conversations, peers, searchParams]);

  const peer = peers.find((item) => item.key === target.peerKey) ?? peers[0];
  const peerConversations = useMemo(() => conversations.filter((item) => peer && peerKeyOf(item) === peer.key), [conversations, peer]);
  const channels = useMemo(() => buildChannels(peerConversations, requests), [peerConversations, requests]);
  // Canalul ales: din URL; altfel primul cu necitite; altfel cel mai recent. Conversația nu e niciodată goală.
  const autoChannel = channels.find((item) => item.unread > 0)?.key ?? [...channels].sort((a, b) => b.lastAt - a.lastAt)[0]?.key ?? DIRECT;
  const activeKey = channels.some((item) => item.key === target.channel) ? target.channel! : autoChannel;
  const channel = channels.find((item) => item.key === activeKey);
  const episodes = useMemo(() => peerConversations
    .filter((item) => channelKeyOf(item) === activeKey)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [peerConversations, activeKey]);
  const current = episodes[episodes.length - 1];
  const currentRequest = current?.consultation_request_id ? requests[String(current.consultation_request_id)] : undefined;
  const patientProfile = peerConversations.find((item) => channelKeyOf(item) === activeKey && item.patient_profile)?.patient_profile;
  const isDirect = activeKey === DIRECT;
  const stateKey = `${peer?.key}|${activeKey}`;

  // Marchează ca citite mesajele canalului deschis; ține minte de unde încep cele noi.
  const unreadIds = episodes.filter((item) => item.unread_count).map((item) => item.id).join(',');
  useEffect(() => {
    const unreadEpisodes = episodes.filter((item) => item.unread_count && item.messages.length);
    if (!unreadEpisodes.length) return;
    const latest = unreadEpisodes[unreadEpisodes.length - 1];
    const firstNew = latest.messages[Math.max(0, latest.messages.length - (latest.unread_count ?? 0))]?.id;
    if (firstNew) setNewFrom((map) => (map[stateKey] ? map : { ...map, [stateKey]: firstNew }));
    for (const item of unreadEpisodes) {
      const last = item.messages[item.messages.length - 1]?.id;
      apiRequest(`/conversations/${item.id}/read`, { method: 'POST', body: JSON.stringify({ last_message_id: last }) })
        .then(() => { setConversations((list) => list.map((entry) => entry.id === item.id ? { ...entry, unread_count: 0 } : entry)); window.dispatchEvent(new Event('conversation-read')); })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, unreadIds]);

  const selectPeer = (item: Peer) => {
    setSearchParams({ [item.role]: String(item.id) });
  };
  const selectChannel = async (key: string) => {
    if (!peer) return;
    setSheetOpen(false);
    if (key === DIRECT && !peerConversations.some((item) => item.is_direct)) {
      const base = peerConversations[peerConversations.length - 1];
      if (!base) return;
      try {
        const response = await apiRequest<{ data: Conversation }>(`/conversations/${base.id}/direct`, { method: 'POST' });
        setConversations((list) => [response.data, ...list.filter((item) => item.id !== response.data.id)]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Discuția directă nu a putut fi deschisă.');
        return;
      }
    }
    setSearchParams({ [peer.role]: String(peer.id), channel: key });
  };

  const needle = search.toLocaleLowerCase('ro');
  const visiblePeers = peers.filter((item) => item.name.toLocaleLowerCase('ro').includes(needle));
  const otherUnread = channels.filter((item) => item.key !== activeKey).reduce((sum, item) => sum + item.unread, 0);

  if (!loading && conversations.length === 0) {
    return (
      <div className="grid min-h-[calc(100dvh-132px)] place-items-center px-4 lg:min-h-dvh">
        <div className="max-w-sm text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><MessageSquare className="h-6 w-6" /></span>
          <h1 className="text-base font-semibold text-slate-950">Nu ai conversații încă</h1>
          <p className="mt-1 text-sm text-slate-500">Conversația cu medicul se deschide când trimiți o cerere de consultație.</p>
          <Button asChild className="mt-4 h-11 rounded-[10px]"><Link to="/patient/doctors">Programează o consultație</Link></Button>
        </div>
      </div>
    );
  }

  const channelRows = (list: Channel[]) => list.map((item) => <ChannelRow key={item.key} channel={item} active={item.key === activeKey} onPick={() => void selectChannel(item.key)} />);
  const patientChannels = channels.filter((item) => item.key !== DIRECT);
  const directChannel = channels.find((item) => item.key === DIRECT)!;

  return (
    <div className={cn('flex bg-white lg:h-dvh', mobileChat ? 'h-dvh' : 'h-[calc(100dvh-60px-max(12px,env(safe-area-inset-bottom)))]')}>
      {/* Medicii (264 px pe desktop; lista întreagă pe telefon, C2a) */}
      <aside className={cn('w-full flex-col bg-white lg:flex lg:w-[264px] lg:shrink-0 lg:border-r lg:border-slate-200', mobileChat ? 'hidden' : 'flex')}>
        <div className="flex flex-col gap-3 px-4 pb-3 pt-[calc(16px+env(safe-area-inset-top))] lg:pt-[18px]">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 lg:text-lg">Mesaje</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută medic" aria-label="Caută medic"
              className="h-[42px] w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus-visible:border-blue-600 lg:h-[38px] lg:text-[13px]" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {loading && <li className="p-4"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></li>}
          {visiblePeers.map((item) => {
            const active = peer?.key === item.key;
            const mine = item.last && currentUserId === Number(item.last.sender_id);
            const last = item.last ? `${mine ? 'Tu: ' : ''}${previewOf(item.last)}` : 'Fără mesaje';
            return (
              <li key={item.key} className="border-t border-slate-100">
                <button type="button" onClick={() => selectPeer(item)} className={cn('flex w-full gap-3 px-4 py-3.5 text-left hover:bg-slate-50 lg:gap-2.5 lg:py-3', active && 'lg:bg-blue-50 lg:shadow-[inset_3px_0_0_#2563EB] lg:hover:bg-blue-50')}>
                  <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-semibold lg:h-10 lg:w-10 lg:text-[13px]', active ? 'bg-slate-200 text-slate-700 lg:bg-blue-600 lg:text-white' : 'bg-slate-200 text-slate-700')}>{initialsOf(item.name)}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 lg:gap-[3px]">
                    <span className="flex justify-between gap-1.5"><span className="truncate text-[15px] font-semibold text-slate-950 lg:text-sm">{item.name}</span><span className="shrink-0 text-xs text-slate-400 lg:text-[11px]">{item.last ? listTime(item.last.created_at) : ''}</span></span>
                    <span className="hidden text-xs text-slate-500 lg:block">{specialties[item.key] ?? (item.role === 'operator' ? 'Operator' : 'Medic')}</span>
                    <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-slate-600 lg:text-xs">{last}</span>{item.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white lg:h-[18px] lg:min-w-[18px]">{item.unread}</span>}</span>
                    <span className="flex flex-wrap gap-1 lg:hidden">
                      {item.patients.map((patient) => <Chip key={patient.id} label={patient.name.split(' ')[0]} count={patient.unread} />)}
                      {item.hasDirect && <Chip label="Direct" count={item.directUnread} />}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Canalele medicului ales (248 px, doar desktop; pe telefon e foaia de jos) */}
      {peer && (
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-slate-200 bg-slate-50 lg:flex">
          <div className="flex h-16 shrink-0 flex-col justify-center gap-0.5 border-b border-slate-200 bg-white px-4">
            <span className="text-xs text-slate-500">Canale cu</span>
            <span className="truncate text-[15px] font-semibold text-slate-950">{peer.name}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {patientChannels.length > 0 && (
              <>
                <div className="flex justify-between pb-1.5 pl-4 pr-2.5 pt-3.5 text-[11px] font-semibold tracking-[.04em] text-slate-500">PACIENȚI<span>{patientChannels.length}</span></div>
                <div className="flex flex-col gap-0.5 px-2">{channelRows(patientChannels)}</div>
                <div className="mx-4 my-3 h-px bg-slate-200" />
              </>
            )}
            <div className={cn('flex flex-col gap-0.5 px-2', !patientChannels.length && 'pt-3')}>{channelRows([directChannel])}</div>
          </div>
        </aside>
      )}

      {/* Conversația */}
      <section className={cn('min-w-0 flex-1 flex-col bg-white lg:flex', mobileChat ? 'flex' : 'hidden')}>
        {peer && channel && (
          <>
            {/* Telefon (C2b): medicul, apoi rândul mare „pentru cine”. */}
            <header className="flex items-center gap-1.5 border-b border-slate-100 px-2 pb-2 pt-[calc(8px+env(safe-area-inset-top))] lg:hidden">
              <button type="button" onClick={() => setSearchParams({})} aria-label="Înapoi la conversații" className="grid h-10 w-10 place-items-center text-slate-700"><ArrowLeft className="h-5 w-5" /></button>
              <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-base font-semibold text-slate-950">{peer.name}</span><span className="truncate text-xs text-slate-500">{specialties[peer.key] ?? (peer.role === 'operator' ? 'Operator' : 'Medic')}</span></span>
              {patientProfile && !isDirect
                ? <button type="button" onClick={() => setRecordOpen(true)} aria-label="Fișa pacientului" className="grid h-10 w-10 place-items-center text-slate-700"><ClipboardList className="h-5 w-5" /></button>
                : <Link to="/patient/profile" aria-label="Documente" className="grid h-10 w-10 place-items-center text-slate-700"><Folder className="h-5 w-5" /></Link>}
            </header>
            <button type="button" onClick={() => setSheetOpen(true)} className="mx-3 mt-2.5 flex min-h-14 items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left lg:hidden">
              <ChannelAvatar channel={channel} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-sm font-semibold text-slate-950">{isDirect ? 'Discuție directă' : `pentru ${channel.title}`}</span><span className="truncate text-xs text-slate-600">{channel.statusLine}</span></span>
              {otherUnread > 0 && <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-600 px-2 py-[3px] text-[11px] font-semibold text-white">{otherUnread} în alt canal</span>}
              <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-blue-700">Schimbă<ChevronDown className="h-4 w-4" /></span>
            </button>

            {/* Desktop (C1a) */}
            <header className="hidden h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5 lg:flex">
              <ChannelAvatar channel={channel} size="lg" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold text-slate-950">{peer.name}</span>
                <span className="truncate text-xs text-slate-500">{isDirect ? 'Discuție directă · fără pacient' : `pentru ${channel.title}${channel.code ? ` · Cod ${channel.code}` : ''}`}</span>
              </span>
              {patientProfile && !isDirect && <HeaderButton onClick={() => setRecordOpen(true)} icon={<ClipboardList className="h-4 w-4" />}>Fișa pacientului</HeaderButton>}
              <HeaderButton to={patientProfile && !isDirect ? `/patient/patients/${patientProfile.id}?tab=documente` : '/patient/profile'} icon={<Folder className="h-4 w-4" />}>Documente</HeaderButton>
            </header>

            {error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {currentRequest && !isDirect && <EpisodeHeader request={currentRequest} />}

            <Timeline episodes={episodes} requests={requests} currentUserId={currentUserId} newFrom={newFrom[stateKey]} onChanged={() => void load()} />

            <Composer conversation={current} request={currentRequest} isDirect={isDirect} patientProfileId={patientProfile?.id} doctorId={peer.role === 'doctor' ? peer.id : undefined} onChanged={() => void load()} />
          </>
        )}
      </section>

      {/* C2c: alegerea canalului pe telefon */}
      {sheetOpen && peer && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-label={`Canale cu ${peer.name}`}>
          <button type="button" aria-label="Închide" onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-slate-900/45" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col gap-1.5 overflow-y-auto rounded-t-[20px] bg-white px-3 pb-[max(32px,env(safe-area-inset-bottom))] pt-2.5">
            <span className="mb-1.5 h-1 w-10 self-center rounded-sm bg-slate-200" />
            <span className="px-2 pb-2 pt-1 text-base font-semibold text-slate-950">Canale cu {peer.name}</span>
            {patientChannels.length > 0 && <><span className="px-2 pb-0.5 text-[11px] font-semibold tracking-[.04em] text-slate-500">PACIENȚI</span>{channelRows(patientChannels)}<div className="m-2 h-px bg-slate-200" /></>}
            {channelRows([directChannel])}
          </div>
        </div>
      )}

      <Sheet open={recordOpen} onOpenChange={setRecordOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-slate-100 pr-16"><SheetTitle>Fișa pacientului</SheetTitle><SheetDescription>Ce vede medicul despre {patientProfile?.display_name}.</SheetDescription></SheetHeader>
          {patientProfile && <div className="px-5 pb-6"><RecordSummary profile={patientProfile} /></div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Chip({ label, count }: { label: string; count: number }) {
  return <span className={cn('flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold', count ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>{count ? `${label} · ${count}` : label}</span>;
}

function HeaderButton({ to, onClick, icon, children }: { to?: string; onClick?: () => void; icon: ReactNode; children: ReactNode }) {
  const className = 'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-950 hover:bg-slate-50';
  return to ? <Link to={to} className={className}>{icon}{children}</Link> : <button type="button" onClick={onClick} className={className}>{icon}{children}</button>;
}

function ChannelAvatar({ channel, size }: { channel: Channel; size: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-[38px] w-[38px] text-[13px]' : size === 'md' ? 'h-9 w-9 text-xs' : 'h-[34px] w-[34px] text-xs';
  if (channel.key === DIRECT) return <span className={cn('grid shrink-0 place-items-center bg-slate-200 text-slate-600', box, size === 'sm' ? 'rounded-[10px]' : 'rounded-full')}><MessagesSquare className="h-4 w-4" /></span>;
  return <span className={cn('grid shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700', box)}>{initialsOf(channel.fullName)}</span>;
}

function ChannelRow({ channel, active, onPick }: { channel: Channel; active: boolean; onPick: () => void }) {
  const unread = active ? 0 : channel.unread;
  return (
    <button type="button" onClick={onPick} aria-current={active ? 'true' : undefined}
      className={cn('flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left', active ? 'border-blue-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,.08),inset_3px_0_0_#2563EB]' : 'border-transparent hover:bg-white')}>
      <ChannelAvatar channel={channel} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-1.5">
          <span className={cn('truncate text-sm', unread > 0 || active ? 'font-semibold' : 'font-medium', active ? 'text-blue-700' : 'text-slate-950')}>{channel.key === DIRECT ? 'Discuție directă' : channel.title}</span>
          {unread > 0 && <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-blue-600 px-[5px] text-[11px] font-bold text-white">{unread}</span>}
        </span>
        <span className="truncate text-[11px] text-slate-500">{channel.last ?? 'Fără mesaje'}</span>
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          {channel.state && <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', channel.state.className)}>{channel.state.label}</span>}
          <span className="truncate text-[10px] text-slate-400">{channel.key === DIRECT ? 'fără pacient' : channel.code ? `Cod ${channel.code}` : ''}</span>
        </span>
      </span>
    </button>
  );
}

/** V1: capul episodului curent, fixat deasupra mesajelor. Pacientul nu are buton de apel. */
function EpisodeHeader({ request }: { request: PatientConsultation }) {
  const video = request.consultation_kind !== 'with_exam';
  const [devices, setDevices] = useState<'granted' | 'unknown' | 'denied'>('unknown');

  useEffect(() => {
    if (!video || !navigator.permissions) return;
    Promise.all([navigator.permissions.query({ name: 'camera' as PermissionName }), navigator.permissions.query({ name: 'microphone' as PermissionName })])
      .then(([camera, mic]) => setDevices(camera.state === 'granted' && mic.state === 'granted' ? 'granted' : camera.state === 'denied' || mic.state === 'denied' ? 'denied' : 'unknown'))
      .catch(() => undefined);
  }, [video]);

  const checkDevices = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setDevices('granted');
    } catch { setDevices('denied'); }
  };

  if (!video || request.status !== 'accepted' || !request.scheduled_at) return null;
  const live = Boolean(request.doctor_started_at);
  const scheduled = new Date(request.scheduled_at);
  const today = scheduled.toLocaleDateString('en-CA', { timeZone: TZ }) === new Date().toLocaleDateString('en-CA', { timeZone: TZ });

  return (
    <div className="shrink-0 bg-slate-50 px-3 pt-3 sm:px-5">
      <div className={cn('flex flex-col gap-3 rounded-2xl border bg-white p-4', live ? 'border-green-200' : 'border-blue-200')}>
        <div className="flex items-center gap-3">
          <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', live ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600')}>{live ? <Video className="h-5 w-5" /> : <Clock className="h-5 w-5" />}</span>
          <div className="min-w-0">
            <p className="text-[17px] font-bold tracking-tight text-slate-950">{live ? 'Consultația a început' : `Consultația începe la ${timeOf(request.scheduled_at)}`}</p>
            <p className="text-[13px] text-slate-500">{live ? 'Medicul te sună. Răspunzi din fereastra de apel.' : `${today ? 'Azi' : capitalize(scheduled.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }))} · video. Medicul te va suna. Poate întârzia 5–15 minute, în funcție de consultațiile anterioare.`}</p>
          </div>
        </div>
        {!live && (devices === 'granted'
          ? <p className="flex items-center gap-2 rounded-[10px] bg-slate-50 px-3 py-2 text-[13px] text-slate-700"><Check className="h-4 w-4" />Camera și microfonul au acces</p>
          : <button type="button" onClick={() => void checkDevices()} className={cn('flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px]', devices === 'denied' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-blue-700 hover:bg-slate-100')}>
            <Video className="h-4 w-4 shrink-0" />{devices === 'denied' ? 'Browserul a blocat camera sau microfonul. Permite-le din setările site-ului.' : 'Verifică acum camera și microfonul'}
          </button>)}
      </div>
    </div>
  );
}

const EPISODE_STATE: Record<string, { label: string; className: string }> = {
  new: { label: 'Așteaptă medicul', className: 'bg-amber-100 text-amber-800' },
  rescheduled: { label: 'Oră nouă propusă', className: 'bg-orange-50 text-orange-700' },
  accepted: { label: 'Confirmată', className: 'bg-green-50 text-green-700' },
  live: { label: 'În curs', className: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Finalizată', className: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Anulată', className: 'bg-slate-100 text-slate-600' }
};

function episodeState(request?: PatientConsultation) {
  if (!request) return null;
  if (request.status === 'accepted' && request.doctor_started_at) return EPISODE_STATE.live;
  return EPISODE_STATE[request.status] ?? EPISODE_STATE.cancelled;
}

function Timeline({ episodes, requests, currentUserId, newFrom, onChanged }: { episodes: Conversation[]; requests: Record<string, PatientConsultation>; currentUserId: number | null; newFrom?: number; onChanged: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const total = episodes.reduce((sum, item) => sum + item.messages.length, 0);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [total, episodes.length]);
  let lastDay = '';
  const dayPill = (value: string, key: string) => {
    const day = new Date(value).toLocaleDateString('en-CA', { timeZone: TZ });
    if (day === lastDay) return null;
    const first = lastDay === '';
    lastDay = day;
    return first ? null : <div key={`day-${key}`} className="self-center rounded-full bg-slate-100 px-2.5 py-[3px] text-xs text-slate-500">{dayLabel(value)}</div>;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5 lg:gap-3 lg:px-6 lg:py-4">
      <div className="flex-1" />
      {episodes.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Niciun mesaj încă.</p>}
      {episodes.map((episode, index) => {
        const request = episode.consultation_request_id ? requests[String(episode.consultation_request_id)] : undefined;
        const isCurrent = index === episodes.length - 1;
        const past = !isCurrent && !episode.is_direct;
        const state = episodeState(request);
        const opacity = past ? 'opacity-[.55]' : '';
        return (
          <Fragment key={episode.id}>
            {!episode.is_direct && (
              <div className={cn('flex shrink-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5', opacity)}>
                {request?.consultation_kind === 'with_exam' ? <Home className="h-4 w-4 shrink-0 text-slate-500" /> : <Video className="h-4 w-4 shrink-0 text-slate-500" />}
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-950">Consultația #{index + 1} · {request?.consultation_kind === 'with_exam' ? 'Cu examinare' : 'Video'} · {episodeDate(request?.scheduled_at ?? episode.created_at)}</span>
                {request?.status === 'completed' && <EpisodeLinks requestId={request.id} />}
                {state && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', state.className)}>{state.label}</span>}
              </div>
            )}
            {episode.messages.map((message) => {
              const mine = currentUserId === Number(message.sender_id);
              const divider = dayPill(message.created_at, `m${message.id}`);
              const isNew = newFrom === message.id;
              const marker = isNew ? <div key={`new-${message.id}`} className="flex shrink-0 items-center gap-2.5 text-[11px] font-semibold text-blue-600"><span className="h-px flex-1 bg-blue-200" />Mesaje noi<span className="h-px flex-1 bg-blue-200" /></div> : null;
              if (message.type === 'system') {
                return <Fragment key={message.id}>{divider}{marker}<div className={cn('flex shrink-0 items-center gap-1.5 self-center text-center text-xs text-slate-600', opacity)}><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />{message.body}</div></Fragment>;
              }
              const body = message.type === 'image' && message.metadata?.url
                ? <a href={message.metadata.url} target="_blank" rel="noreferrer"><img src={message.metadata.url} alt={message.metadata.file_name || 'imagine'} className="max-h-60 max-w-[240px] rounded-[14px] object-cover" /></a>
                : message.type === 'file' && message.metadata?.url
                  ? <a href={message.metadata.url} target="_blank" rel="noreferrer" className={cn('flex items-center gap-2.5 px-3 py-2.5', mine ? 'rounded-[14px_4px_14px_14px] bg-blue-600 text-white' : 'rounded-[4px_14px_14px_14px] border border-slate-200 bg-white text-slate-950')}>
                      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md text-[9px] font-bold', mine ? 'bg-white/15' : 'bg-red-50 text-red-700')}>{fileExt(message.metadata.file_name)}</span>
                      <span className="min-w-0 truncate text-[13px] font-semibold">{message.metadata.file_name || message.body}</span>
                    </a>
                  : <div className={cn('whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-[1.45]', mine ? 'rounded-[14px_4px_14px_14px] bg-blue-600 text-white' : 'rounded-[4px_14px_14px_14px] border border-slate-200 bg-white text-slate-950')}>{message.body}</div>;
              return (
                <Fragment key={message.id}>
                  {divider}{marker}
                  {mine
                    ? <div className={cn('max-w-[78%] shrink-0 self-end', opacity)} title={shortTime(message.created_at)}>{body}</div>
                    : <div className={cn('flex max-w-[78%] shrink-0 flex-col gap-[3px]', opacity)} title={shortTime(message.created_at)}><span className="pl-1 text-[11px] text-slate-500">{message.sender?.name}</span>{body}</div>}
                </Fragment>
              );
            })}
            {request?.status === 'completed' && <ConclusionCard requestId={request.id} />}
            {isCurrent && request?.status === 'rescheduled' && request.proposed_scheduled_at && <ProposalCard request={request} onChanged={onChanged} />}
          </Fragment>
        );
      })}
      <div ref={end} />
    </div>
  );
}

/** „Concluzie PDF” și „Rețetă” pe episodul încheiat. */
function EpisodeLinks({ requestId }: { requestId: string }) {
  const docs = useDocuments(requestId);
  const doc = docs.find((item) => item.url);
  if (!doc) return null;
  return (
    <span className="hidden shrink-0 gap-2.5 sm:flex">
      <a href={doc.url!} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">Concluzie PDF</a>
      {doc.prescription_url && <a href={doc.prescription_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">Rețetă</a>}
    </span>
  );
}

type ConsultationDoc = { id: number; title: string; url?: string | null; prescription_url?: string | null };
const documentCache = new Map<string, Promise<ConsultationDoc[]>>();
function useDocuments(requestId: string): ConsultationDoc[] {
  const [docs, setDocs] = useState<ConsultationDoc[]>([]);
  useEffect(() => {
    let alive = true;
    if (!documentCache.has(requestId)) documentCache.set(requestId, apiRequest<{ documents: ConsultationDoc[] }>(`/requests/${requestId}/documents`).then((response) => response.documents ?? []).catch(() => []));
    void documentCache.get(requestId)!.then((list) => { if (alive) setDocs(list); });
    return () => { alive = false; };
  }, [requestId]);
  return docs;
}

/** Propunerea de oră a medicului, în cronologie, cu răspunsul pe loc (C3b). */
function ProposalCard({ request, onChanged }: { request: PatientConsultation; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accept = async () => {
    setBusy(true);
    setError('');
    try { await apiRequest(`/requests/${request.id}/accept-proposed-time`, { method: 'POST' }); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nu am putut accepta ora.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="my-3 flex max-w-md flex-col gap-1 rounded-[14px] border border-slate-200 bg-white p-3.5">
      <span className="text-xs text-slate-500">Medicul propune altă oră</span>
      <span className="text-[17px] font-bold tracking-tight text-slate-950">{capitalize(longWhen(request.proposed_scheduled_at!))}</span>
      {request.scheduled_at && <span className="text-[13px] text-slate-500">Ora cerută de tine ({timeOf(request.scheduled_at)}) nu mai e liberă.</span>}
      {error && <span role="alert" className="text-[13px] text-red-700">{error}</span>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => void accept()} className="h-11 rounded-[10px]">{busy ? 'Se confirmă…' : 'Accept'}</Button>
        <Button variant="outline" className="h-11 rounded-[10px] bg-white" onClick={() => document.getElementById('patient-chat-message')?.focus()}>Altă oră</Button>
      </div>
    </div>
  );
}

/** Concluzia publicată, ca un card în cronologie. */
function ConclusionCard({ requestId }: { requestId: string }) {
  const docs = useDocuments(requestId);
  return (
    <>
      {docs.filter((doc) => doc.url).map((doc) => (
        <div key={doc.id} className="flex max-w-[78%] shrink-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
          <span className="grid h-11 w-9 shrink-0 place-items-center rounded-md bg-red-50 text-[10px] font-bold text-red-700">PDF</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[13px] font-semibold text-slate-950">Concluzia a fost publicată</span><span className="truncate text-xs text-slate-500">{doc.title}{doc.prescription_url ? ' · rețetă inclusă' : ''}</span></span>
          <a href={doc.url!} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] font-medium text-blue-600 hover:underline">Deschide</a>
        </div>
      ))}
    </>
  );
}

/**
 * Zona de scriere ocupă mereu același loc. Când chatul nu e disponibil, locul ei
 * îl ia motivul și, dacă se poate face ceva, butonul care îl redeschide (C2 a–e).
 */
function Composer({ conversation, request, isDirect, patientProfileId, doctorId, onChanged }: { conversation?: Conversation; request?: PatientConsultation; isDirect: boolean; patientProfileId?: number; doctorId?: number; onChanged: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const chat: ChatState = conversation?.chat ?? { state: conversation?.status === 'open' ? 'open' : 'closed', can_write: conversation?.status === 'open', can_reactivate: false, message: null };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversation || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      await apiRequest(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ body: text }) });
      setText('');
      onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Mesajul nu a putut fi trimis.'); } finally { setSending(false); }
  };
  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !conversation) return;
    const form = new FormData();
    form.append('file', file);
    setSending(true);
    try { await apiRequest(`/conversations/${conversation.id}/attachments`, { method: 'POST', body: form }); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Fișierul nu a putut fi trimis.'); }
    finally { setSending(false); event.target.value = ''; }
  };
  const reactivate = async () => {
    const requestId = conversation?.consultation_request_id ?? conversation?.consultation_request?.id;
    if (!requestId) return;
    setSending(true);
    setError('');
    try { await apiRequest(`/requests/${requestId}/reactivate-chat`, { method: 'POST' }); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Chatul nu a putut fi redeschis.'); }
    finally { setSending(false); }
  };

  if (!conversation) return null;
  const freeUntil = conversation.consultation_request?.free_chat_until;
  const freeDaysLeft = freeUntil && request?.status === 'completed' ? Math.ceil((new Date(freeUntil).getTime() - Date.now()) / 86400000) : 0;
  const bookLink = `/patient/doctors?${new URLSearchParams({ ...(patientProfileId ? { patient_profile: String(patientProfileId) } : {}), ...(doctorId ? { doctor: String(doctorId) } : {}) }).toString()}`;

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white">
      {error && <p role="alert" className="px-4 pt-2 text-sm text-red-700">{error}</p>}
      {chat.can_write ? (
        <>
          {isDirect && <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">Pentru întrebări despre un pacient, scrie în canalul lui, ca medicul să vadă fișa.</p>}
          {freeDaysLeft > 0 && <p className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600"><Clock className="h-3.5 w-3.5 shrink-0" />Chat gratuit încă {freeDaysLeft} {freeDaysLeft === 1 ? 'zi' : 'zile'}</p>}
          <form onSubmit={send} className="flex items-end gap-2 px-3.5 pb-4 pt-3">
            <button type="button" aria-label="Atașează un fișier" disabled={sending} onClick={() => fileInput.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-slate-500 hover:bg-slate-100 disabled:opacity-50"><Paperclip className="h-5 w-5" /></button>
            <input ref={fileInput} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={attach} />
            <label htmlFor="patient-chat-message" className="sr-only">Mesaj</label>
            <textarea id="patient-chat-message" rows={1} value={text} onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              placeholder="Scrie un mesaj…" className="max-h-40 min-h-[42px] flex-1 resize-none rounded-[10px] border border-slate-200 px-3 py-[9px] text-sm leading-[22px] outline-none placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-[3px] focus-visible:ring-blue-600/15" />
            <button type="submit" aria-label="Trimite mesajul" disabled={sending || !text.trim()} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"><Send className="h-[18px] w-[18px]" /></button>
          </form>
        </>
      ) : chat.state === 'pending' ? (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-slate-200 text-slate-600">{request?.consultation_kind === 'with_exam' ? <Home className="h-4 w-4" /> : <Clock className="h-4 w-4" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">{chat.message ?? 'Chatul se deschide după ce operatorul termină examinarea.'}</p>
            {request?.scheduled_at && <p className="text-[13px] text-slate-500">{request.consultation_kind === 'with_exam' ? 'Operatorul vine' : 'Consultația e'} {longWhen(request.scheduled_at)}.</p>}
          </div>
          {request && <Link to="/patient/consultations" className="hidden shrink-0 text-sm font-medium text-blue-600 hover:underline sm:block">Detaliile vizitei</Link>}
        </div>
      ) : chat.can_reactivate ? (
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">{freeUntil ? `Chatul gratuit s-a încheiat pe ${dayMonth(freeUntil)}` : (chat.message ?? 'Chatul gratuit s-a încheiat')}</p>
            <p className="text-[13px] text-slate-500">{chat.reactivate_until ? `Îl poți redeschide până pe ${dayMonth(chat.reactivate_until)}. ` : ''}Plătești din portofel.</p>
          </div>
          <Button disabled={sending} onClick={() => void reactivate()} className="h-10 rounded-[10px]">Redeschide chatul pentru {chat.reactivation_hours ?? 24} h{chat.reactivation_price ? ` · ${chat.reactivation_price} MDL` : ''}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-950">Pentru întrebări noi, programează o consultație</p>
            <p className="text-[13px] text-slate-500">Istoricul rămâne aici și îl vede și medicul.</p>
          </div>
          <Button asChild className="h-10 rounded-[10px]"><Link to={bookLink}>Programează</Link></Button>
        </div>
      )}
    </div>
  );
}

function RecordSummary({ profile }: { profile: NonNullable<Conversation['patient_profile']> }) {
  const record = (profile.medical_record ?? {}) as Record<string, unknown>;
  const nothing = (record.nothing_to_report ?? {}) as Record<string, boolean>;
  const names = (key: string) => {
    if (nothing[key]) return 'Nimic de raportat';
    const rows = Array.isArray(record[key]) ? (record[key] as Array<Record<string, unknown>>) : [];
    return rows.map((row) => String(row.name ?? '')).filter(Boolean).join(', ') || 'Necompletat';
  };
  const lifestyle = (record.lifestyle ?? {}) as Record<string, unknown>;
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="flex items-center gap-3"><Initials name={profile.display_name} /><div><p className="font-semibold text-slate-900">{profile.display_name}</p>{profile.birth_date && <p className="text-slate-500">{patientAge(profile.birth_date)}</p>}</div></div>
      <dl className="space-y-3">
        <div><dt className="text-xs text-slate-500">Alergii</dt><dd className="font-medium text-slate-900">{names('drug_allergies')}</dd></div>
        <div><dt className="text-xs text-slate-500">Boli cronice</dt><dd className="font-medium text-slate-900">{names('chronic_conditions')}</dd></div>
        <div><dt className="text-xs text-slate-500">Medicamente</dt><dd className="font-medium text-slate-900">{nothing.lifestyle ? 'Nimic de raportat' : String(lifestyle.long_term_medication || 'Necompletat')}</dd></div>
      </dl>
      <Button asChild variant="outline" className="w-full"><Link to={`/patient/patients/${profile.id}?tab=fisa`}>Deschide fișa completă</Link></Button>
    </div>
  );
}

function Initials({ name }: { name: string }) {
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-200 text-[13px] font-semibold text-slate-700">{initialsOf(name)}</span>;
}

function buildPeers(conversations: Conversation[]): Peer[] {
  const peers = new Map<string, Peer>();
  for (const conversation of conversations) {
    const role = conversation.doctor_id ? 'doctor' : 'operator';
    const id = conversation.doctor_id ?? conversation.operator_id;
    if (!id) continue;
    const key = `${role}:${id}`;
    const last = conversation.messages[conversation.messages.length - 1];
    const lastAt = new Date(last?.created_at ?? conversation.created_at).getTime();
    const peer = peers.get(key) ?? { key, role, id, name: (role === 'doctor' ? conversation.doctor?.name : conversation.operator?.name) ?? (role === 'doctor' ? 'Medic' : 'Operator'), unread: 0, lastAt: 0, patients: [], hasDirect: false, directUnread: 0 };
    const unread = conversation.unread_count ?? 0;
    peer.unread += unread;
    if (lastAt >= peer.lastAt) { peer.lastAt = lastAt; peer.last = last; }
    if (conversation.is_direct) { peer.hasDirect = true; peer.directUnread += unread; }
    else if (conversation.patient_profile) {
      const existing = peer.patients.find((patient) => patient.id === conversation.patient_profile!.id);
      if (existing) existing.unread += unread;
      else peer.patients.push({ id: conversation.patient_profile.id, name: conversation.patient_profile.display_name, unread });
    }
    peers.set(key, peer);
  }
  return [...peers.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/** Canalele unui medic: câte unul pe pacient (în ordinea în care au apărut), apoi „Discuție directă”. */
function buildChannels(conversations: Conversation[], requests: Record<string, PatientConsultation>): Channel[] {
  const map = new Map<string, { items: Conversation[] }>();
  for (const conversation of [...conversations].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())) {
    const key = channelKeyOf(conversation);
    (map.get(key) ?? map.set(key, { items: [] }).get(key)!).items.push(conversation);
  }
  const channels: Channel[] = [];
  for (const [key, { items }] of map) {
    if (key === DIRECT) continue;
    const latest = items[items.length - 1];
    const request = latest.consultation_request_id ? requests[String(latest.consultation_request_id)] : undefined;
    const profile = items.find((item) => item.patient_profile)?.patient_profile;
    const fullName = profile?.display_name ?? 'Pacient';
    const messages = items.flatMap((item) => item.messages);
    const last = messages[messages.length - 1];
    const state = episodeState(request);
    const freeUntil = latest.consultation_request?.free_chat_until;
    const freeDays = freeUntil && request?.status === 'completed' ? Math.ceil((new Date(freeUntil).getTime() - Date.now()) / 86400000) : 0;
    const when = request?.scheduled_at ? `${episodeDate(request.scheduled_at)}${request.status !== 'completed' ? ` ${shortTime(request.scheduled_at)}` : ''}` : '';
    channels.push({
      key, fullName, title: fullName.split(' ')[0], code: profile?.patient_code ?? undefined,
      unread: items.reduce((sum, item) => sum + (item.unread_count ?? 0), 0),
      last: last ? previewOf(last) : undefined,
      lastAt: new Date(last?.created_at ?? latest.created_at).getTime(),
      state,
      statusLine: [state?.label === 'În curs' ? 'Consultație în curs' : state?.label, when, freeDays > 0 ? `chat gratuit încă ${freeDays} ${freeDays === 1 ? 'zi' : 'zile'}` : null].filter(Boolean).join(' · ')
    });
  }
  const direct = map.get(DIRECT)?.items ?? [];
  const directMessages = direct.flatMap((item) => item.messages);
  const directLast = directMessages[directMessages.length - 1];
  channels.push({
    key: DIRECT, title: 'Discuție directă', fullName: 'Discuție directă',
    unread: direct.reduce((sum, item) => sum + (item.unread_count ?? 0), 0),
    last: directLast ? previewOf(directLast) : direct.length ? undefined : 'Întrebări generale, fără pacient',
    lastAt: directLast ? new Date(directLast.created_at).getTime() : 0,
    state: null, statusLine: 'fără pacient · întrebări generale'
  });
  return channels;
}

function channelKeyOf(conversation: Conversation): string {
  return conversation.is_direct || !conversation.patient_profile_id ? DIRECT : String(conversation.patient_profile_id);
}

function peerKeyOf(conversation: Conversation): string {
  return conversation.doctor_id ? `doctor:${conversation.doctor_id}` : `operator:${conversation.operator_id}`;
}

function initialsOf(name: string): string {
  return name.replace(/^dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

const TZ = 'Europe/Chisinau';
function shortTime(value: string): string { return new Date(value).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: TZ }); }
function timeOf(value: string): string { return shortTime(value); }
/** „azi” sau „13 oct”. */
function episodeDate(value: string): string {
  const date = new Date(value);
  if (dayKey(date) === dayKey(new Date())) return 'azi';
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: TZ }).replace('.', '');
}
function dayMonth(value: string): string { return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', timeZone: TZ }); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function dayKey(date: Date): string { return date.toLocaleDateString('en-CA', { timeZone: TZ }); }
/** „Azi”, „Ieri” sau „Joi, 5 noiembrie”. */
function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (dayKey(date) === dayKey(today)) return 'Azi';
  if (dayKey(date) === dayKey(new Date(today.getTime() - 86400000))) return 'Ieri';
  return capitalize(date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }));
}
/** În listă: ora pentru azi, „Ieri”, ziua săptămânii în ultima săptămână, altfel data. */
function listTime(value: string): string {
  const date = new Date(value);
  const days = (Date.now() - date.getTime()) / 86400000;
  if (dayKey(date) === dayKey(new Date())) return shortTime(value);
  if (dayLabel(value) === 'Ieri') return 'Ieri';
  if (days < 7) return capitalize(date.toLocaleDateString('ro-RO', { weekday: 'short', timeZone: TZ }).replace('.', ''));
  return shortDate(value);
}
function previewOf(message: Message): string {
  if (message.type === 'image') return 'Imagine';
  if (message.type === 'file') return message.metadata?.file_name || 'Fișier';
  return message.body;
}
function fileExt(name?: string): string { return (name?.split('.').pop() || 'FIȘ').slice(0, 4).toUpperCase(); }
function shortDate(value: string): string { return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: TZ }); }
function longWhen(value: string): string { return `${new Date(value).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })}, ${shortTime(value)}`; }
