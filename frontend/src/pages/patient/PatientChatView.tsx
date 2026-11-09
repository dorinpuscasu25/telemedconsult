import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, ChevronLeft, FileText, MessageSquare, Paperclip, Phone, Search, Send, Video } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { cn } from '../../components/ui/utils';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { StatusBadge } from '../../components/app/StatusBadge';
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
type Filter = 'all' | 'unread';

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

  const visiblePeers = peers.filter((item) => item.name.toLocaleLowerCase('ro').includes(search.toLocaleLowerCase('ro')) && (filter === 'all' || item.unread > 0));

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

  return (
    <div className="flex h-[calc(100dvh-56px-64px-3.25rem-env(safe-area-inset-bottom))] min-h-[420px] gap-4 lg:h-[calc(100dvh-64px-4.5rem)]">
      {/* Nivelul 1: medicii */}
      <aside className={cn('w-full flex-col rounded-2xl border border-slate-200 bg-white lg:flex lg:w-80 lg:shrink-0', mobileChat ? 'hidden' : 'flex')}>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <h1 className="text-xl font-bold text-slate-950">Mesaje</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută medic" className="h-10 pl-9" aria-label="Caută medic" />
          </div>
          <div className="flex gap-1" role="radiogroup" aria-label="Filtru">
            {([['all', 'Toate'], ['unread', 'Necitite']] as const).map(([key, label]) => (
              <button key={key} type="button" role="radio" aria-checked={filter === key} onClick={() => setFilter(key)} className={cn('h-8 rounded-full border px-3 text-xs font-semibold', filter === key ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600')}>{label}</button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {loading && <li className="p-4"><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></li>}
          {visiblePeers.map((item) => (
            <li key={item.key}>
              <button type="button" onClick={() => selectPeer(item)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50', peer?.key === item.key && 'bg-primary/5')}>
                <Initials name={item.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold text-slate-900">{item.name}</span><span className="shrink-0 text-[11px] text-slate-400">{item.last ? shortTime(item.last.created_at) : ''}</span></span>
                  <span className="mt-0.5 flex flex-wrap gap-1">{item.patients.map((patient) => <span key={patient.id} className={cn('rounded-full px-1.5 text-[10px] font-semibold', patient.unread ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500')}>{initialsOf(patient.name)}</span>)}</span>
                  <span className="mt-0.5 block truncate text-sm text-slate-500">{item.last?.body || 'Fără mesaje'}</span>
                </span>
                {item.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{item.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Nivelul 2: conversația cu medicul */}
      <section className={cn('min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:flex', mobileChat ? 'flex' : 'hidden')}>
        {peer && (
          <>
            <header className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-5">
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Înapoi la conversații" onClick={() => setMobileChat(false)}><ChevronLeft className="h-5 w-5" /></Button>
              <Initials name={peer.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-950">{peer.name}</p>
                <p className="truncate text-xs text-slate-500">{activeTab === DIRECT ? 'Discuție directă' : patientProfile ? `pentru ${patientProfile.display_name}${patientProfile.patient_code ? ` · Cod ${patientProfile.patient_code}` : ''}` : ''}</p>
              </div>
              {patientProfile && activeTab !== DIRECT && <Button variant="outline" size="sm" onClick={() => setRecordOpen(true)}>Fișa pacientului</Button>}
              {patientProfile && activeTab !== DIRECT && <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to={`/patient/patients/${patientProfile.id}?tab=documente`}>Documente</Link></Button>}
            </header>

            <nav className="flex gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2 [scrollbar-width:none] sm:px-5" aria-label="Pacienți">
              {tabs.map((item) => (
                <button key={item.key} type="button" onClick={() => (item.key === DIRECT && !item.exists ? void openDirect() : selectTab(item.key))} aria-current={activeTab === item.key ? 'page' : undefined}
                  className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium', activeTab === item.key ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                  {item.label}{item.unread > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold', activeTab === item.key ? 'bg-white text-primary' : 'bg-primary text-white')}>{item.unread}</span>}
                </button>
              ))}
            </nav>

            {error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {currentRequest && activeTab !== DIRECT && <EpisodeHeader request={currentRequest} onChanged={() => void load()} />}

            <Timeline episodes={episodes} requests={requests} currentUserId={currentUserId} />

            <Composer conversation={current} request={currentRequest} isDirect={activeTab === DIRECT} patientProfileId={patientProfile?.id} doctorId={peer.role === 'doctor' ? peer.id : undefined} onChanged={() => void load()} />
          </>
        )}
      </section>

      <Sheet open={recordOpen} onOpenChange={setRecordOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>Fișa pacientului</SheetTitle><SheetDescription>Ce vede medicul despre {patientProfile?.display_name}.</SheetDescription></SheetHeader>
          {patientProfile && <RecordSummary profile={patientProfile} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Capul episodului curent: ora consultației și faptul că medicul sună; sau propunerea de oră. */
function EpisodeHeader({ request, onChanged }: { request: PatientConsultation; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try { await apiRequest(`/requests/${request.id}/accept-proposed-time`, { method: 'POST' }); onChanged(); }
    finally { setBusy(false); }
  };

  if (request.status === 'rescheduled' && request.proposed_scheduled_at) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-orange-100 bg-orange-50 px-4 py-3 text-sm sm:px-5">
        <CalendarClock className="h-5 w-5 shrink-0 text-orange-600" />
        <p className="min-w-0 flex-1"><span className="font-semibold text-orange-950">Medicul propune altă oră:</span> {longWhen(request.proposed_scheduled_at)}</p>
        <Button size="sm" disabled={busy} onClick={() => void accept()}>{busy ? 'Se confirmă…' : 'Accept'}</Button>
        <Button size="sm" variant="outline" className="bg-white" onClick={() => document.getElementById('patient-chat-message')?.focus()}>Altă oră</Button>
      </div>
    );
  }

  if (request.status === 'accepted' && request.doctor_started_at && request.consultation_kind !== 'with_exam') {
    return (
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm sm:px-5">
        <Phone className="h-5 w-5 shrink-0 text-emerald-700" />
        <p className="min-w-0 flex-1 text-emerald-900"><span className="font-semibold">Consultația a început.</span> Medicul te sună; răspunde din fereastra de apel.</p>
      </div>
    );
  }

  if (request.status === 'accepted' && request.scheduled_at && request.consultation_kind !== 'with_exam') {
    return (
      <div className="flex items-start gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm sm:px-5">
        <Video className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <p className="min-w-0 flex-1 text-blue-950"><span className="font-semibold">Consultația începe la {timeOf(request.scheduled_at)}</span> · {longWhen(request.scheduled_at)}<span className="block text-blue-900/80">Medicul te va suna. Poate întârzia 5–15 minute, în funcție de consultațiile anterioare.</span></p>
      </div>
    );
  }

  return null;
}

function Timeline({ episodes, requests, currentUserId }: { episodes: Conversation[]; requests: Record<string, PatientConsultation>; currentUserId: number | null }) {
  const end = useRef<HTMLDivElement>(null);
  const total = episodes.reduce((sum, item) => sum + item.messages.length, 0);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [total, episodes.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-3 py-4 sm:px-6">
      {episodes.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Niciun mesaj încă.</p>}
      {episodes.map((episode, index) => {
        const request = episode.consultation_request_id ? requests[String(episode.consultation_request_id)] : undefined;
        return (
          <div key={episode.id}>
            {!episode.is_direct && (
              <div className="my-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">Consultația #{index + 1} · {request?.consultation_kind === 'with_exam' ? 'Cu examinare' : 'Video'} · {shortDate(request?.scheduled_at ?? episode.created_at)}</p>
                  {request && <StatusBadge request={request} perspective="patient" />}
                </div>
                {request?.status === 'completed' && <div className="mt-2"><ConsultationDocuments requestId={request.id} /></div>}
              </div>
            )}
            {episode.messages.map((message, position) => {
              const previous = episode.messages[position - 1];
              const mine = currentUserId === Number(message.sender_id);
              const firstOfGroup = !previous || previous.sender_id !== message.sender_id || previous.type === 'system';
              if (message.type === 'system') return <p key={message.id} className="mx-auto my-2 w-fit max-w-md rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-600">{message.body} · {shortTime(message.created_at)}</p>;
              return (
                <div key={message.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start', firstOfGroup ? 'mt-3' : 'mt-0.5')}>
                  {firstOfGroup && !mine && message.sender?.name && <span className="mb-1 px-1 text-xs font-medium text-slate-500">{message.sender.name}</span>}
                  <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm sm:max-w-[70%]', mine ? 'bg-primary text-white' : 'border border-slate-200 bg-white text-slate-800')}>
                    {message.type === 'image' && message.metadata?.url ? (
                      <a href={message.metadata.url} target="_blank" rel="noreferrer"><img src={message.metadata.url} alt={message.metadata.file_name || 'imagine'} className="max-h-64 rounded-xl object-cover" /></a>
                    ) : message.type === 'file' && message.metadata?.url ? (
                      <a href={message.metadata.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline"><FileText className="h-5 w-5 shrink-0" />{message.metadata.file_name || message.body}</a>
                    ) : message.body}
                  </div>
                  <span className="mt-1 px-1 text-[11px] text-slate-400">{shortTime(message.created_at)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

/**
 * Zona de scriere ocupă mereu același loc. Când chatul nu e disponibil, locul ei
 * îl ia motivul și, dacă se poate face ceva, butonul care îl redeschide.
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
    <div className="shrink-0 border-t border-slate-100 bg-white p-3 sm:p-4">
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
      {chat.can_write ? (
        <>
          {isDirect && <p className="mb-2 text-xs text-slate-500">Discuție fără pacient: mesajele nu intră în nicio fișă medicală.</p>}
          {freeDaysLeft > 0 && <p className="mb-2 text-xs text-slate-500">Chat gratuit încă {freeDaysLeft} {freeDaysLeft === 1 ? 'zi' : 'zile'}. Întreabă medicul orice despre concluzie.</p>}
          <form onSubmit={send} className="flex items-end gap-2">
            <Button type="button" variant="ghost" size="icon" aria-label="Atașează un fișier" disabled={sending} onClick={() => fileInput.current?.click()}><Paperclip className="h-5 w-5" /></Button>
            <input ref={fileInput} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={attach} />
            <label htmlFor="patient-chat-message" className="sr-only">Mesaj</label>
            <textarea id="patient-chat-message" rows={1} value={text} onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              placeholder="Scrie medicului…" className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[15px] outline-none focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-primary/15" />
            <Button type="submit" size="icon" aria-label="Trimite mesajul" disabled={sending || !text.trim()}><Send className="h-5 w-5" /></Button>
          </form>
        </>
      ) : chat.state === 'pending' ? (
        <div className="text-sm">
          {request?.scheduled_at && <p className="font-semibold text-slate-900">Ora confirmată: {longWhen(request.scheduled_at)}</p>}
          <p className="text-slate-600">{chat.message ?? 'Chatul se deschide după ce operatorul termină examinarea.'}</p>
        </div>
      ) : chat.can_reactivate ? (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-slate-600">{chat.message ?? 'Chatul gratuit s-a încheiat.'}{chat.reactivate_until ? ` Îl poți redeschide până pe ${shortDate(chat.reactivate_until)}. Plătești din portofel.` : ''}</p>
          <Button disabled={sending} onClick={() => void reactivate()}>Redeschide chatul pentru {chat.reactivation_hours ?? 24} h{chat.reactivation_price ? ` · ${chat.reactivation_price} MDL` : ''}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-slate-600"><span className="font-semibold text-slate-900">Pentru întrebări noi, programează o consultație.</span> {chat.message ?? 'Istoricul rămâne aici și îl vede și medicul.'}</p>
          <Button asChild><Link to={bookLink}>Programează</Link></Button>
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
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initialsOf(name)}</span>;
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
function shortDate(value: string): string { return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', timeZone: TZ }); }
function longWhen(value: string): string { return `${new Date(value).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ })}, ${shortTime(value)}`; }
