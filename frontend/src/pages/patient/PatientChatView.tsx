import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardList, Clock, Folder, Home, Info, MessageSquare, Paperclip, Search, Send, Video } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
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
type Peer = { key: string; role: 'doctor' | 'operator'; id: number; name: string; unread: number; last?: Message; lastAt: number; patients: Array<{ id: number; name: string; unread: number }> };
type Filter = string;

const DIRECT = 'direct';

/**
 * Chatul pacientului pe două niveluri: medicii (stânga), apoi conversația cu un
 * medic, cu un tab pentru fiecare pacient și unul pentru discuția directă. În
 * fiecare tab, consultațiile sunt episoade într-o singură cronologie. Apelul îl
 * pornește medicul; pacientul nu are buton de apel.
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
  const [filter, setFilter] = useState<Filter>('all');
  const [mobileChat, setMobileChat] = useState(() => Boolean(searchParams.get('conversation') || searchParams.get('request') || searchParams.get('doctor')));
  const [recordOpen, setRecordOpen] = useState(false);

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

  // Ce e selectat vine din URL: ?doctor= / ?operator=, ?patient_profile= sau ?tab=direct, ?conversation= / ?request=.
  const target = useMemo(() => {
    const byConversation = conversations.find((item) => String(item.id) === searchParams.get('conversation'))
      ?? conversations.find((item) => String(item.consultation_request_id) === searchParams.get('request'));
    const doctorParam = searchParams.get('doctor');
    const operatorParam = searchParams.get('operator');
    const peerKey = byConversation ? peerKeyOf(byConversation) : doctorParam ? `doctor:${doctorParam}` : operatorParam ? `operator:${operatorParam}` : peers[0]?.key;
    const tab = byConversation ? (byConversation.is_direct ? DIRECT : String(byConversation.patient_profile_id ?? DIRECT)) : searchParams.get('tab') ?? searchParams.get('patient_profile');
    return { peerKey, tab };
  }, [conversations, peers, searchParams]);

  const peer = peers.find((item) => item.key === target.peerKey) ?? peers[0];
  const peerConversations = useMemo(() => conversations.filter((item) => peer && peerKeyOf(item) === peer.key), [conversations, peer]);
  const tabs = useMemo(() => buildTabs(peerConversations), [peerConversations]);
  const activeTab = tabs.find((item) => item.key === target.tab)?.key ?? tabs.find((item) => item.key !== DIRECT)?.key ?? DIRECT;
  const episodes = useMemo(() => peerConversations
    .filter((item) => (activeTab === DIRECT ? item.is_direct : !item.is_direct && String(item.patient_profile_id) === activeTab))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()), [peerConversations, activeTab]);
  const current = episodes[episodes.length - 1];
  const currentRequest = current?.consultation_request_id ? requests[String(current.consultation_request_id)] : undefined;
  const patientProfile = peerConversations.find((item) => String(item.patient_profile_id) === activeTab)?.patient_profile;

  // Marchează ca citite mesajele episodului curent.
  const lastMessageId = current?.messages[current.messages.length - 1]?.id;
  useEffect(() => {
    if (!current?.id || !lastMessageId || !current.unread_count) return;
    apiRequest(`/conversations/${current.id}/read`, { method: 'POST', body: JSON.stringify({ last_message_id: lastMessageId }) })
      .then(() => { setConversations((list) => list.map((item) => item.id === current.id ? { ...item, unread_count: 0 } : item)); window.dispatchEvent(new Event('conversation-read')); })
      .catch(() => undefined);
  }, [current?.id, current?.unread_count, lastMessageId]);

  const selectPeer = (item: Peer) => {
    setSearchParams({ [item.role]: String(item.id) });
    setMobileChat(true);
  };
  const selectTab = (key: string) => {
    if (!peer) return;
    setSearchParams({ [peer.role]: String(peer.id), tab: key });
  };

  const openDirect = async () => {
    const existing = peerConversations.find((item) => item.is_direct);
    if (existing) { selectTab(DIRECT); return; }
    const base = peerConversations[peerConversations.length - 1];
    if (!base) return;
    try {
      const response = await apiRequest<{ data: Conversation }>(`/conversations/${base.id}/direct`, { method: 'POST' });
      setConversations((list) => [response.data, ...list.filter((item) => item.id !== response.data.id)]);
      selectTab(DIRECT);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discuția directă nu a putut fi deschisă.');
    }
  };

  const patientFilters = useMemo(() => {
    const seen = new Map<number, string>();
    for (const item of conversations) if (item.patient_profile) seen.set(item.patient_profile.id, item.patient_profile.display_name.split(' ')[0]);
    return [...seen.entries()].map(([id, label]) => ({ id: String(id), label }));
  }, [conversations]);
  const specialties = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of conversations) {
      const request = item.consultation_request_id ? requests[String(item.consultation_request_id)] : undefined;
      if (request?.specialty) map[peerKeyOf(item)] = request.specialty;
    }
    return map;
  }, [conversations, requests]);
  const needle = search.toLocaleLowerCase('ro');
  const visiblePeers = peers.filter((item) => (item.name.toLocaleLowerCase('ro').includes(needle) || (item.last?.body ?? '').toLocaleLowerCase('ro').includes(needle))
    && (filter === 'all' || item.patients.some((patient) => String(patient.id) === filter)));

  if (!loading && conversations.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><MessageSquare className="h-6 w-6" /></span>
        <h1 className="font-semibold text-slate-900">Nu ai conversații încă</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Conversația cu medicul se deschide când trimiți o cerere de consultație.</p>
        <Button asChild className="mt-4"><Link to="/patient/doctors">Programează o consultație</Link></Button>
      </div>
    );
  }

  const firstName = patientProfile?.display_name.split(' ')[0];
  const scheduledCall = currentRequest?.status === 'accepted' && currentRequest.consultation_kind !== 'with_exam' && currentRequest.scheduled_at ? timeOf(currentRequest.scheduled_at) : null;

  return (
    <div className="flex h-[calc(100dvh-56px-64px-3.25rem-env(safe-area-inset-bottom))] min-h-[420px] lg:h-[calc(100dvh-64px-4.5rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white">
      {/* Nivelul 1: medicii */}
      <aside className={cn('w-full flex-col lg:flex lg:w-[296px] lg:shrink-0 lg:border-r lg:border-slate-200', mobileChat ? 'hidden' : 'flex')}>
        <div className="flex flex-col gap-3 pb-3 lg:px-4 lg:pt-5">
          <h1 className="text-[28px] font-bold tracking-tight text-slate-950 lg:text-lg">Mesaje</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută medic sau mesaj" className="h-10 rounded-[10px] bg-white pl-9" aria-label="Caută medic sau mesaj" />
          </div>
          {patientFilters.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Pacient">
              {[{ id: 'all', label: 'Toți' }, ...patientFilters].map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={filter === item.id} onClick={() => setFilter(item.id)} className={cn('h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium', filter === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>{item.label}</button>
              ))}
            </div>
          )}
        </div>
        <ul className="-mx-4 min-h-0 flex-1 overflow-y-auto lg:mx-0 lg:px-2">
          {loading && <li className="p-4"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></li>}
          {visiblePeers.map((item) => {
            const active = peer?.key === item.key;
            const mine = item.last && currentUserId === Number(item.last.sender_id);
            return (
              <li key={item.key} className="border-b border-slate-100 lg:border-0">
                <button type="button" onClick={() => selectPeer(item)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 lg:rounded-xl lg:px-2.5', active && 'lg:bg-blue-50 lg:hover:bg-blue-50')}>
                  <Initials name={item.name} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-950">{item.name}</span><span className="shrink-0 text-[11px] text-slate-400">{item.last ? listTime(item.last.created_at) : ''}</span></span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      {specialties[item.key] ?? (item.role === 'operator' ? 'Operator' : 'Medic')}
                      {item.patients.map((patient) => <span key={patient.id} title={patient.name} className="grid h-4 min-w-4 place-items-center rounded-full bg-blue-50 px-1 text-[9px] font-bold text-blue-700">{patient.name[0]?.toUpperCase()}</span>)}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-[13px]', item.unread > 0 ? 'font-medium text-slate-950' : 'text-slate-500')}>{item.last ? `${mine ? 'Tu: ' : ''}${previewOf(item.last)}` : 'Fără mesaje'}</span>
                      {item.unread > 0 && <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white">{item.unread}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Nivelul 2: conversația cu medicul */}
      <section className={cn('-mx-4 min-w-0 flex-1 flex-col overflow-hidden bg-white lg:mx-0 lg:flex', mobileChat ? 'flex' : 'hidden')}>
        {peer && (
          <>
            <header className="flex items-center gap-3 px-3 pb-2 pt-3 sm:px-5 lg:border-b lg:border-slate-100 lg:py-3.5">
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Înapoi la conversații" onClick={() => setMobileChat(false)}><ArrowLeft className="h-5 w-5" /></Button>
              <Initials name={peer.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-slate-950">{peer.name}</p>
                <p className="truncate text-xs text-slate-500">{activeTab === DIRECT ? 'Discuție directă' : patientProfile ? `pentru ${firstName}${patientProfile.patient_code ? ` · Cod ${patientProfile.patient_code.replace(/(\d{3})(?=\d)/g, '$1 ')}` : ''}` : ''}</p>
              </div>
              {patientProfile && activeTab !== DIRECT && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setRecordOpen(true)} aria-label="Fișa pacientului" className="shrink-0 rounded-[10px] max-lg:h-9 max-lg:w-9 max-lg:border-0 max-lg:p-0"><ClipboardList className="h-4 w-4" /><span className="max-lg:sr-only">Fișa pacientului</span></Button>
                  <Button asChild variant="outline" size="sm" className="hidden rounded-[10px] lg:inline-flex"><Link to={`/patient/patients/${patientProfile.id}?tab=documente`}><Folder className="h-4 w-4" />Documente</Link></Button>
                </>
              )}
              {/* Apelul îl pornește medicul; butonul arată doar de când. */}
              <span title="Medicul te sună" className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] text-sm text-slate-400 max-lg:w-9 max-lg:justify-center lg:border lg:border-slate-200 lg:px-3"><Video className="h-4 w-4" /><span className="max-lg:sr-only">Apel video{scheduledCall ? ` · de la ${scheduledCall}` : ''}</span></span>
            </header>

            {/* Telefon: chips sub antet. Desktop: taburi subliniate. */}
            <nav className="flex gap-1.5 overflow-x-auto border-b border-slate-100 px-3 pb-2.5 [scrollbar-width:none] sm:px-5 lg:hidden" aria-label="Pacienți">
              {tabs.map((item) => (
                <button key={item.key} type="button" onClick={() => (item.key === DIRECT && !item.exists ? void openDirect() : selectTab(item.key))} aria-current={activeTab === item.key ? 'page' : undefined}
                  className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium', activeTab === item.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>
                  {item.label}{item.unread > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{item.unread}</span>}
                </button>
              ))}
            </nav>
            <nav className="hidden gap-1 border-b border-slate-200 px-4 lg:flex" aria-label="Pacienți">
              {tabs.map((item) => (
                <button key={item.key} type="button" onClick={() => (item.key === DIRECT && !item.exists ? void openDirect() : selectTab(item.key))} aria-current={activeTab === item.key ? 'page' : undefined}
                  className={cn('-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-sm', activeTab === item.key ? 'border-blue-600 font-semibold text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-800')}>
                  {item.label}{item.unread > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{item.unread}</span>}
                </button>
              ))}
            </nav>

            {error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {currentRequest && activeTab !== DIRECT && <EpisodeHeader request={currentRequest} />}

            <Timeline episodes={episodes} requests={requests} currentUserId={currentUserId} onChanged={() => void load()} />

            <Composer conversation={current} request={currentRequest} isDirect={activeTab === DIRECT} patientName={firstName} patientProfileId={patientProfile?.id} doctorId={peer.role === 'doctor' ? peer.id : undefined} onChanged={() => void load()} />
          </>
        )}
      </section>

      <Sheet open={recordOpen} onOpenChange={setRecordOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-slate-100 pr-16"><SheetTitle>Fișa pacientului</SheetTitle><SheetDescription>Ce vede medicul despre {patientProfile?.display_name}.</SheetDescription></SheetHeader>
          {patientProfile && <div className="px-5 pb-6"><RecordSummary profile={patientProfile} /></div>}
        </SheetContent>
      </Sheet>
    </div>
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
  rescheduled: { label: 'Așteaptă răspunsul tău', className: 'bg-blue-50 text-blue-700' },
  accepted: { label: 'Confirmată', className: 'bg-green-50 text-green-700' },
  completed: { label: 'Finalizată', className: 'bg-slate-100 text-slate-500' }
};

function Timeline({ episodes, requests, currentUserId, onChanged }: { episodes: Conversation[]; requests: Record<string, PatientConsultation>; currentUserId: number | null; onChanged: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const total = episodes.reduce((sum, item) => sum + item.messages.length, 0);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [total, episodes.length]);
  let lastDay = '';
  const dayDivider = (value: string, key: string) => {
    const day = new Date(value).toLocaleDateString('en-CA', { timeZone: TZ });
    if (day === lastDay) return null;
    lastDay = day;
    return <div key={`day-${key}`} className="my-4 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" />{dayLabel(value)}<span className="h-px flex-1 bg-slate-200" /></div>;
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-4 sm:px-6">
      {episodes.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Niciun mesaj încă.</p>}
      {episodes.map((episode, index) => {
        const request = episode.consultation_request_id ? requests[String(episode.consultation_request_id)] : undefined;
        const isCurrent = index === episodes.length - 1;
        const state = request ? EPISODE_STATE[request.status] ?? { label: 'Anulată', className: 'bg-slate-100 text-slate-500' } : null;
        return (
          <div key={episode.id}>
            {dayDivider(episode.created_at, `e${episode.id}`)}
            {!episode.is_direct && (
              <div className={cn('my-3 flex items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5', isCurrent && request?.status !== 'completed' ? 'border-blue-200' : 'border-slate-200 opacity-70')}>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900">Consultația #{index + 1} · {request?.consultation_kind === 'with_exam' ? 'Cu examinare' : 'Video'}{request?.status === 'completed' ? ` · ${shortDate(request.scheduled_at ?? episode.created_at)}` : ''}</p>
                  <p className="text-xs text-slate-500">{request?.status === 'completed' ? 'Concluzie PDF' : `Cerută ${dayLabel(episode.created_at).toLocaleLowerCase('ro')}, ${shortTime(episode.created_at)}`}</p>
                </div>
                {state && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', state.className)}>{state.label}</span>}
              </div>
            )}
            {episode.messages.map((message, position) => {
              const previous = episode.messages[position - 1];
              const next = episode.messages[position + 1];
              const mine = currentUserId === Number(message.sender_id);
              const divider = dayDivider(message.created_at, `m${message.id}`);
              if (message.type === 'system') {
                const good = /confirm|accept|început/i.test(message.body);
                return <div key={message.id}>{divider}<p className="mx-auto my-3 flex w-fit max-w-md items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-700"><span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', good ? 'bg-green-600' : 'bg-slate-400')} />{message.body}<span className="text-slate-400">{shortTime(message.created_at)}</span></p></div>;
              }
              const firstOfGroup = Boolean(divider) || !previous || previous.sender_id !== message.sender_id || previous.type === 'system';
              const lastOfGroup = !next || next.sender_id !== message.sender_id || next.type === 'system';
              return (
                <div key={message.id}>
                  {divider}
                  <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start', firstOfGroup ? 'mt-3' : 'mt-1')}>
                    {firstOfGroup && !mine && message.sender?.name && <span className="mb-1 px-1 text-xs text-slate-500">{message.sender.name}</span>}
                    {message.type === 'image' && message.metadata?.url ? (
                      <a href={message.metadata.url} target="_blank" rel="noreferrer"><img src={message.metadata.url} alt={message.metadata.file_name || 'imagine'} className="max-h-60 max-w-[240px] rounded-[14px] object-cover" /></a>
                    ) : message.type === 'file' && message.metadata?.url ? (
                      <a href={message.metadata.url} target="_blank" rel="noreferrer" className={cn('flex max-w-[85%] items-center gap-2.5 rounded-[14px] px-3 py-2.5 sm:max-w-[60%]', mine ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-900')}>
                        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md text-[9px] font-bold', mine ? 'bg-white/15' : 'bg-red-50 text-red-600')}>{fileExt(message.metadata.file_name)}</span>
                        <span className="min-w-0 truncate text-[13px] font-semibold">{message.metadata.file_name || message.body}</span>
                      </a>
                    ) : (
                      <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-[14px] px-3 py-2.5 text-sm leading-[1.45] sm:max-w-[62%]', mine ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-900')}>{message.body}</div>
                    )}
                    {lastOfGroup && <span className="mt-1 px-1 text-[11px] text-slate-400">{shortTime(message.created_at)}</span>}
                  </div>
                </div>
              );
            })}
            {request?.status === 'completed' && <ConclusionCard requestId={request.id} />}
            {isCurrent && request?.status === 'rescheduled' && request.proposed_scheduled_at && <ProposalCard request={request} onChanged={onChanged} />}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
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

/** C2c: concluzia publicată, ca un card în cronologie. */
function ConclusionCard({ requestId }: { requestId: string }) {
  const [docs, setDocs] = useState<Array<{ id: number; title: string; url?: string | null; prescription_url?: string | null }>>([]);
  useEffect(() => {
    apiRequest<{ documents: Array<{ id: number; title: string; url?: string | null; prescription_url?: string | null }> }>(`/requests/${requestId}/documents`)
      .then((response) => setDocs(response.documents ?? []))
      .catch(() => setDocs([]));
  }, [requestId]);
  return (
    <>
      {docs.filter((doc) => doc.url).map((doc) => (
        <div key={doc.id} className="mx-auto my-3 flex max-w-md items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-[10px] font-bold text-red-600">PDF</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-950">Concluzia a fost publicată</span><span className="block truncate text-xs text-slate-500">{doc.title}{doc.prescription_url ? ' · rețetă inclusă' : ''}</span></span>
          <a href={doc.url!} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-blue-600 hover:underline">Deschide</a>
        </div>
      ))}
    </>
  );
}

/**
 * Zona de scriere ocupă mereu același loc. Când chatul nu e disponibil, locul ei
 * îl ia motivul și, dacă se poate face ceva, butonul care îl redeschide (C2 a–e).
 */
function Composer({ conversation, request, isDirect, patientName, patientProfileId, doctorId, onChanged }: { conversation?: Conversation; request?: PatientConsultation; isDirect: boolean; patientName?: string; patientProfileId?: number; doctorId?: number; onChanged: () => void }) {
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
    <div className="shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {error && <p role="alert" className="px-4 pt-2 text-sm text-red-700">{error}</p>}
      {chat.can_write ? (
        <>
          {isDirect && <p className="flex items-center gap-2 bg-slate-50 px-4 py-2 text-[13px] text-slate-600"><Info className="h-4 w-4 shrink-0" />Discuție fără pacient: mesajele nu intră în nicio fișă medicală.</p>}
          {freeDaysLeft > 0 && <p className="flex items-center gap-2 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-700"><Clock className="h-4 w-4 shrink-0" />Chat gratuit încă {freeDaysLeft} {freeDaysLeft === 1 ? 'zi' : 'zile'}. Întreabă medicul orice despre concluzie.</p>}
          <form onSubmit={send} className="flex items-end gap-2 px-3 py-3 sm:px-4">
            <button type="button" aria-label="Atașează un fișier" disabled={sending} onClick={() => fileInput.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Paperclip className="h-[18px] w-[18px]" /></button>
            <input ref={fileInput} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={attach} />
            <label htmlFor="patient-chat-message" className="sr-only">Mesaj</label>
            <textarea id="patient-chat-message" rows={1} value={text} onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              placeholder={!isDirect && patientName ? `Scrie despre ${patientName}…` : 'Scrie medicului…'} className="max-h-40 min-h-10 flex-1 resize-none rounded-[10px] border border-slate-200 px-3 py-2 text-[15px] leading-6 outline-none focus-visible:border-blue-600 focus-visible:ring-[3px] focus-visible:ring-blue-600/15" />
            <button type="submit" aria-label="Trimite mesajul" disabled={sending || !text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-[18px] w-[18px]" /></button>
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
    const peer = peers.get(key) ?? { key, role, id, name: (role === 'doctor' ? conversation.doctor?.name : conversation.operator?.name) ?? (role === 'doctor' ? 'Medic' : 'Operator'), unread: 0, lastAt: 0, patients: [] };
    peer.unread += conversation.unread_count ?? 0;
    if (lastAt >= peer.lastAt) { peer.lastAt = lastAt; peer.last = last; }
    if (conversation.patient_profile) {
      const existing = peer.patients.find((patient) => patient.id === conversation.patient_profile!.id);
      if (existing) existing.unread += conversation.unread_count ?? 0;
      else peer.patients.push({ id: conversation.patient_profile.id, name: conversation.patient_profile.display_name, unread: conversation.unread_count ?? 0 });
    }
    peers.set(key, peer);
  }
  return [...peers.values()].sort((a, b) => b.lastAt - a.lastAt);
}

function buildTabs(conversations: Conversation[]): Array<{ key: string; label: string; unread: number; exists: boolean }> {
  const tabs = new Map<string, { key: string; label: string; unread: number; exists: boolean }>();
  for (const conversation of conversations) {
    if (conversation.is_direct || !conversation.patient_profile_id) continue;
    const key = String(conversation.patient_profile_id);
    const tab = tabs.get(key) ?? { key, label: conversation.patient_profile?.display_name.split(' ')[0] ?? 'Pacient', unread: 0, exists: true };
    tab.unread += conversation.unread_count ?? 0;
    tabs.set(key, tab);
  }
  const direct = conversations.filter((item) => item.is_direct);
  return [...tabs.values(), { key: DIRECT, label: 'Discuție directă', unread: direct.reduce((sum, item) => sum + (item.unread_count ?? 0), 0), exists: direct.length > 0 }];
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
