import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useConnectionQualityIndicator, useConnectionState, useLocalParticipant, useRemoteParticipants, useRoomContext, useTrackToggle, useTracks } from '@livekit/components-react';
import { ConnectionQuality, ConnectionState, Track } from 'livekit-client';
import { Camera, CameraOff, Maximize2, MessageSquare, Mic, MicOff, Minimize2, PhoneOff, Send, WifiOff, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { cn } from '../ui/utils';
import type { PatientCallSession, PatientCallSummary } from '../../contexts/PatientCallContext';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Apelul pacientului. Același `LiveKitRoom` rămâne montat cât timp apelul e
 * deschis; doar forma se schimbă între ecran întreg și fereastra minimizată.
 */
export default function PatientCallOverlay({ session, summary, expanded, onExpandedChange, onFinish, onCloseSummary }: {
  session: PatientCallSession | null;
  summary: PatientCallSummary | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onFinish: (summary: PatientCallSummary | null) => void;
  onCloseSummary: () => void;
}) {
  const startedAt = useRef<number | null>(null);
  const [corner, setCorner] = useState<Corner>('bottom-right');

  if (!session) return summary ? <CallSummary summary={summary} onClose={onCloseSummary} /> : null;

  const finish = () => {
    const minutes = startedAt.current ? Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)) : 0;
    startedAt.current = null;
    onFinish({ requestId: session.requestId, minutes, doctorName: session.doctorName });
  };

  return (
    <LiveKitRoom
      key={session.requestId}
      serverUrl={session.connection.server_url}
      token={session.connection.participant_token}
      connect
      audio={session.connection.choices.audioEnabled ? { deviceId: session.connection.choices.audioDeviceId } : false}
      video={session.connection.choices.videoEnabled ? { deviceId: session.connection.choices.videoDeviceId } : false}
      onDisconnected={finish}
      className={cn('fixed z-[70] overflow-hidden bg-slate-900 text-white', expanded ? 'inset-0' : cn('rounded-xl shadow-2xl ring-1 ring-white/10 max-sm:inset-x-2 max-sm:bottom-[calc(72px+env(safe-area-inset-bottom))] max-sm:h-16 sm:h-[180px] sm:w-[320px]', cornerClass(corner)))}
      aria-label="Apel video"
    >
      <CallSurface session={session} expanded={expanded} onExpandedChange={onExpandedChange} onConnected={() => { startedAt.current ??= Date.now(); }} startedAt={startedAt} onCornerChange={setCorner} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function CallSurface({ session, expanded, onExpandedChange, onConnected, startedAt, onCornerChange }: {
  session: PatientCallSession;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onConnected: () => void;
  startedAt: React.MutableRefObject<number | null>;
  onCornerChange: (corner: Corner) => void;
}) {
  const navigate = useNavigate();
  const room = useRoomContext();
  const state = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const remotes = useRemoteParticipants();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const [confirmExit, setConfirmExit] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const hadRemote = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const phone = useIsPhone();

  useEffect(() => { if (state === ConnectionState.Connected) onConnected(); }, [state, onConnected]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (remotes.length > 0) hadRemote.current = true;

  const remoteTrack = tracks.find((track) => !track.participant.isLocal);
  const localTrack = tracks.find((track) => track.participant.isLocal);
  const remoteVideoOn = remoteTrack && isTrackReference(remoteTrack) && !remoteTrack.publication.isMuted;
  const localVideoOn = localTrack && isTrackReference(localTrack) && !localTrack.publication.isMuted;
  const doctorLeft = hadRemote.current && remotes.length === 0;
  const remaining = session.durationMinutes * 60 - (startedAt.current ? Math.floor((now - startedAt.current) / 1000) : 0);
  const overtime = remaining < 0;
  const timer = `${overtime ? '−' : ''}${formatSeconds(Math.abs(remaining))}`;
  const chatLink = `/patient/chat?request=${session.requestId}`;
  const patientFirst = session.patientName?.split(' ')[0];

  const leave = () => { void room.disconnect(); };
  const goToChat = () => { onExpandedChange(false); navigate(chatLink); };
  const openChat = () => { if (phone) goToChat(); else setChatOpen((value) => !value); };

  // Fereastra minimizată se trage și se fixează în cel mai apropiat colț (desktop).
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (expanded || phone || (event.target as HTMLElement).closest('button')) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
    setOffset({ x: dx, y: dy });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    setOffset({ x: 0, y: 0 });
    if (!moved) { onExpandedChange(true); return; }
    const right = event.clientX > window.innerWidth / 2;
    const bottom = event.clientY > window.innerHeight / 2;
    onCornerChange(`${bottom ? 'bottom' : 'top'}-${right ? 'right' : 'left'}` as Corner);
  };

  const remoteView = remoteVideoOn && remoteTrack && isTrackReference(remoteTrack)
    ? <VideoTrack trackRef={remoteTrack} className="h-full w-full object-cover" />
    : <div className="grid h-full w-full place-items-center bg-slate-800 text-sm font-semibold text-white/70">{initialsOf(session.doctorName)}</div>;

  const timerPill = (small = false) => (
    <span className={cn('flex items-center gap-1.5 rounded-full font-mono font-bold tabular-nums', overtime ? 'bg-orange-600' : 'bg-black/40', small ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-[15px]')}>
      <span className={cn('rounded-full', overtime ? 'bg-white' : 'bg-green-400', small ? 'h-1.5 w-1.5' : 'h-2 w-2')} />{timer}
      {!small && <span className="font-sans text-[11px] font-normal text-white/70">{overtime ? 'peste durată' : 'rămase'}</span>}
    </span>
  );

  // V4b: pe telefon, apelul minimizat e o bară deasupra navigației de jos.
  if (!expanded && phone) {
    return (
      <div className="flex h-full items-center gap-2.5 p-2" onClick={(event) => { if (!(event.target as HTMLElement).closest('button')) onExpandedChange(true); }}>
        <div className="h-12 w-[72px] shrink-0 overflow-hidden rounded-lg bg-slate-800">{remoteView}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{session.doctorName}</p>
          <p className={cn('font-mono text-xs font-bold tabular-nums', overtime ? 'text-orange-400' : 'text-green-400')}>{timer}</p>
        </div>
        <MediaToggle source={Track.Source.Microphone} size="sm" />
        <RoundButton label="Mărește apelul" onClick={() => onExpandedChange(true)} size="sm"><Maximize2 className="h-4 w-4" /></RoundButton>
        <RoundButton label="Ieși din apel" onClick={() => { onExpandedChange(true); setConfirmExit(true); }} size="sm" danger><PhoneOff className="h-4 w-4" /></RoundButton>
      </div>
    );
  }

  // V4a: fereastra de 320×180 pe desktop.
  if (!expanded) {
    return (
      <div className="relative h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" style={offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {remoteView}
        <div className="absolute left-2 top-2">{timerPill(true)}</div>
        <div className="absolute right-2 top-2"><RoundButton label="Mărește apelul" onClick={() => onExpandedChange(true)} size="xs"><Maximize2 className="h-3.5 w-3.5" /></RoundButton></div>
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2">
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{session.doctorName}</span>
          <MediaToggle source={Track.Source.Microphone} size="xs" />
          <MediaToggle source={Track.Source.Camera} size="xs" />
          <button type="button" onClick={() => { onExpandedChange(true); setConfirmExit(true); }} className="h-7 rounded-full bg-red-600 px-3 text-xs font-semibold hover:bg-red-700">Ieși</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <div className="relative h-full min-w-0 flex-1 bg-slate-800">
        {/* Video-ul medicului; V6b când camera lui e oprită. */}
        {remoteVideoOn && remoteTrack && isTrackReference(remoteTrack)
          ? <VideoTrack trackRef={remoteTrack} className="h-full w-full object-cover" />
          : !doctorLeft && (
            <div className="grid h-full w-full place-items-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="grid h-20 w-20 place-items-center rounded-full bg-slate-700 text-[28px] font-semibold">{initialsOf(session.doctorName)}</span>
                <p className="text-[15px] font-semibold">{session.doctorName}</p>
                <p className="flex items-center gap-1.5 text-[13px] text-white/60">
                  {remotes.length > 0 ? <><CameraOff className="h-4 w-4" />Camera e oprită · vă aude și vă vorbește</> : state === ConnectionState.Connected ? 'Așteptăm medicul…' : 'Se conectează…'}
                </p>
              </div>
            </div>
          )}

        {/* Antet: pe desktop numele în stânga și timerul la mijloc; pe telefon, totul centrat (V3c). */}
        <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-3 bg-gradient-to-b from-black/50 to-transparent px-4 pb-8 pt-4 sm:block sm:px-5">
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[15px] font-semibold">{session.doctorName}</p>
            <p className="truncate text-xs text-white/70">Consultație video{patientFirst ? ` pentru ${patientFirst}` : ''}</p>
          </div>
          <div className="sm:absolute sm:left-1/2 sm:top-4 sm:-translate-x-1/2">{timerPill()}</div>
          <div className="text-center sm:hidden">
            {overtime ? <p className="text-xs text-white/80">Apelul continuă până când unul dintre voi iese.</p> : <><p className="text-[15px] font-semibold">{session.doctorName}</p>{patientFirst && <p className="text-xs text-white/70">pentru {patientFirst}</p>}</>}
          </div>
          <div className="absolute left-3 top-3 sm:hidden"><RoundButton label="Minimizează apelul" onClick={() => onExpandedChange(false)} size="sm"><Minimize2 className="h-4 w-4" /></RoundButton></div>
        </div>

        {/* V6a: mesajele apar sub timer și nu acoperă controalele. */}
        {quality === ConnectionQuality.Poor && (
          <div className="absolute inset-x-0 top-[120px] flex justify-center px-4 sm:top-16">
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 py-2 pl-3.5 pr-2 text-[13px] text-amber-900 shadow-lg">
              <WifiOff className="h-4 w-4 shrink-0 text-amber-600" /><span><b>Conexiune slabă.</b> Imaginea poate îngheța.</span>
              {localVideoOn && <button type="button" className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-amber-900" onClick={() => void localParticipant.setCameraEnabled(false)}>Oprește camera mea</button>}
            </div>
          </div>
        )}
        {overtime && !doctorLeft && <p className="absolute inset-x-0 top-16 hidden text-center text-xs text-white/70 sm:block">Apelul continuă până când unul dintre voi iese.</p>}

        {/* V6c */}
        {doctorLeft && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-700 text-lg font-semibold">{initialsOf(session.doctorName)}</span>
              <p className="text-[17px] font-bold">Medicul a ieșit din apel</p>
              <p className="text-[13px] leading-[1.5] text-white/70">Dacă s-a întrerupt, te poate suna din nou. Poți rămâne aici câteva minute sau poți continua în chat.</p>
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={goToChat} className="h-10 rounded-[10px] bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-100">Mergi la chat</button>
                <button type="button" onClick={leave} className="h-10 rounded-[10px] border border-white/25 px-4 text-sm font-semibold hover:bg-white/10">Ieși din apel</button>
              </div>
            </div>
          </div>
        )}

        {/* Imaginea proprie */}
        <div className="absolute bottom-28 right-4 h-[136px] w-[100px] overflow-hidden rounded-xl border border-white/20 bg-slate-700 sm:bottom-24 sm:right-5 sm:h-[112px] sm:w-[180px]">
          {localVideoOn && localTrack && isTrackReference(localTrack) ? <VideoTrack trackRef={localTrack} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-white/60">tu</div>}
        </div>

        {/* Controale */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/50 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 sm:gap-2.5 sm:pb-5">
          <MediaToggle source={Track.Source.Microphone} size="lg" />
          <MediaToggle source={Track.Source.Camera} size="lg" />
          <RoundButton label={chatOpen ? 'Închide chatul' : 'Deschide chatul'} onClick={openChat} size="lg" active={chatOpen}><MessageSquare className="h-[18px] w-[18px]" /></RoundButton>
          <span className="hidden sm:contents"><RoundButton label="Minimizează apelul" onClick={() => onExpandedChange(false)} size="lg"><Minimize2 className="h-[18px] w-[18px]" /></RoundButton></span>
          <button type="button" onClick={() => setConfirmExit(true)} aria-label="Ieși din apel" className="grid h-12 w-12 place-items-center rounded-full bg-red-600 font-semibold hover:bg-red-700 sm:ml-1.5 sm:flex sm:h-10 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm">
            <PhoneOff className="h-[18px] w-[18px]" /><span className="hidden sm:inline">Ieși</span>
          </button>
        </div>

        {/* V5a / V5c: confirmarea ieșirii. */}
        {confirmExit && (
          <div className="absolute inset-0 flex items-end bg-slate-950/70 sm:items-center sm:justify-center sm:p-6">
            <div role="alertdialog" aria-label="Ieși din apel?" className="w-full rounded-t-2xl bg-white p-5 text-slate-900 sm:max-w-[360px] sm:rounded-2xl">
              <p className="text-[17px] font-bold">Ieși din apel?</p>
              <p className="mt-1 text-sm text-slate-500">Poți continua discuția în chat.</p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
                <button type="button" onClick={leave} className="h-11 rounded-[10px] bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:h-9">Ieși din apel</button>
                <button type="button" autoFocus onClick={() => setConfirmExit(false)} className="h-11 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50 sm:h-9">Rămân în apel</button>
              </div>
            </div>
          </div>
        )}

        <StartAudio label="Activează sunetul" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900" />
      </div>

      {/* V3b: chatul consultației lângă video, pe desktop. */}
      {chatOpen && !phone && <CallChatPanel requestId={session.requestId} patientName={patientFirst} onClose={() => setChatOpen(false)} />}
    </div>
  );
}

type CallMessage = { id: number; body: string; sender_id: number; sender?: { name: string }; type?: string; metadata?: { file_name?: string; url?: string } | null; created_at: string };
type CallConversation = { id: number; consultation_request_id?: number | string | null; patient_id: number; messages: CallMessage[] };

function CallChatPanel({ requestId, patientName, onClose }: { requestId: string; patientName?: string; onClose: () => void }) {
  const [conversation, setConversation] = useState<CallConversation | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ data: CallConversation[] }>('/conversations');
      setConversation(response.data.find((item) => String(item.consultation_request_id) === requestId) ?? null);
    } catch { /* păstrăm ce avem */ }
  }, [requestId]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [conversation?.messages.length]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversation || !text.trim()) return;
    setSending(true);
    try { await apiRequest(`/conversations/${conversation.id}/messages`, { method: 'POST', body: JSON.stringify({ body: text }) }); setText(''); await load(); }
    finally { setSending(false); }
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col bg-white text-slate-900">
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div><p className="text-sm font-semibold">Chat{patientName ? ` · ${patientName}` : ''}</p><p className="text-xs text-slate-500">Mesajele rămân în conversația consultației</p></div>
        <button type="button" onClick={onClose} aria-label="Închide chatul" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
        {conversation?.messages.map((message) => {
          const mine = message.sender_id === conversation.patient_id;
          if (message.type === 'system') return <p key={message.id} className="mx-auto my-2 w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-600">{message.body}</p>;
          return (
            <div key={message.id} className={cn('mt-2 flex flex-col', mine ? 'items-end' : 'items-start')}>
              {!mine && message.sender?.name && <span className="mb-0.5 text-[11px] text-slate-500">{message.sender.name}</span>}
              {message.type === 'image' && message.metadata?.url
                ? <img src={message.metadata.url} alt={message.metadata.file_name || 'imagine'} className="max-h-40 max-w-[200px] rounded-xl object-cover" />
                : <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[13px]', mine ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white')}>{message.metadata?.file_name ?? message.body}</div>}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Scrie medicului…" aria-label="Mesaj" className="h-9 min-w-0 flex-1 rounded-[10px] border border-slate-200 px-3 text-sm outline-none focus-visible:border-blue-600" />
        <button type="submit" disabled={sending || !text.trim() || !conversation} aria-label="Trimite mesajul" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-blue-600 text-white disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </form>
    </aside>
  );
}

const ROUND_SIZE = { xs: 'h-7 w-7', sm: 'h-9 w-9', lg: 'h-12 w-12 sm:h-10 sm:w-10' };

function RoundButton({ label, onClick, size, active = false, danger = false, children }: { label: string; onClick: () => void; size: keyof typeof ROUND_SIZE; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cn('grid shrink-0 place-items-center rounded-full transition', ROUND_SIZE[size], danger ? 'bg-red-600 hover:bg-red-700' : active ? 'bg-white text-slate-900' : 'bg-white/15 hover:bg-white/25')}>
      {children}
    </button>
  );
}

function MediaToggle({ source, size }: { source: Track.Source.Microphone | Track.Source.Camera; size: keyof typeof ROUND_SIZE }) {
  const { buttonProps, enabled, pending } = useTrackToggle({ source });
  const mic = source === Track.Source.Microphone;
  const Icon = mic ? (enabled ? Mic : MicOff) : (enabled ? Camera : CameraOff);
  return (
    <button {...buttonProps} type="button" disabled={pending} aria-pressed={enabled} aria-label={mic ? (enabled ? 'Oprește microfonul' : 'Pornește microfonul') : (enabled ? 'Oprește camera' : 'Pornește camera')}
      className={cn('grid shrink-0 place-items-center rounded-full transition', enabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-slate-900', ROUND_SIZE[size])}>
      <Icon className={size === 'xs' ? 'h-3.5 w-3.5' : size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
    </button>
  );
}

/** V5b / V5d: ecranul de după apel. */
function CallSummary({ summary, onClose }: { summary: PatientCallSummary; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (path: string) => { onClose(); navigate(path); };
  return (
    <div role="dialog" aria-label="Apel încheiat" className="fixed inset-0 z-[70] flex flex-col bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-40 sm:items-center sm:justify-center sm:bg-slate-50 sm:p-6 sm:text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700"><PhoneOff className="h-5 w-5" /></span>
      <h2 className="mt-4 text-[22px] font-bold tracking-tight text-slate-950">Apel încheiat{summary.minutes ? ` · ${summary.minutes} min` : ''}</h2>
      <p className="mt-2 text-sm text-slate-500">Concluzia medicului va apărea în chat.</p>
      <div className="mt-auto flex flex-col items-center gap-3 sm:mt-6">
        <button type="button" autoFocus onClick={() => go(`/patient/chat?request=${summary.requestId}`)} className="h-12 w-full rounded-[10px] bg-blue-600 px-5 text-[15px] font-semibold text-white hover:bg-blue-700 sm:h-10 sm:w-auto sm:text-sm">Mergi la chat</button>
        <button type="button" onClick={() => go('/patient')} className="hidden text-sm text-slate-600 hover:text-slate-900 sm:block">Acasă</button>
      </div>
    </div>
  );
}

function useIsPhone(): boolean {
  const query = '(max-width: 639px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setPhone(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}

function cornerClass(corner: Corner): string {
  return {
    'top-left': 'sm:left-4 sm:top-20',
    'top-right': 'sm:right-4 sm:top-20',
    'bottom-left': 'sm:bottom-4 sm:left-4',
    'bottom-right': 'sm:bottom-4 sm:right-4'
  }[corner];
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function initialsOf(name: string): string {
  return name.replace(/^dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}
