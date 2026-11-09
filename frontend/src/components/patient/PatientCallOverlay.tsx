import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveKitRoom, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useConnectionQualityIndicator, useConnectionState, useLocalParticipant, useRemoteParticipants, useRoomContext, useTrackToggle, useTracks } from '@livekit/components-react';
import { ConnectionQuality, ConnectionState, Track } from 'livekit-client';
import { Camera, CameraOff, Maximize2, Mic, MicOff, Minimize2, PhoneOff, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
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
      className={cn('fixed z-[70] overflow-hidden bg-slate-950 text-white', expanded ? 'inset-0' : cn('aspect-video w-[min(320px,calc(100vw-2rem))] rounded-2xl shadow-2xl ring-1 ring-white/10', cornerClass(corner)))}
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
  const [now, setNow] = useState(() => Date.now());
  const hadRemote = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

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

  const leave = () => { void room.disconnect(); };
  const goToChat = () => { onExpandedChange(false); navigate(chatLink); };

  // Fereastra minimizată se trage și se fixează în cel mai apropiat colț.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (expanded || (event.target as HTMLElement).closest('button')) return;
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

  return (
    <div className="relative h-full w-full touch-none select-none" style={offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {/* Video-ul medicului */}
      {remoteVideoOn && remoteTrack && isTrackReference(remoteTrack)
        ? <VideoTrack trackRef={remoteTrack} className="h-full w-full object-cover" />
        : (
          <div className="grid h-full w-full place-items-center bg-slate-900">
            <div className="text-center">
              <span className={cn('mx-auto grid place-items-center rounded-full bg-white/10 font-semibold', expanded ? 'h-24 w-24 text-3xl' : 'h-12 w-12 text-base')}>{initialsOf(session.doctorName)}</span>
              {expanded && <p className="mt-3 font-semibold">{session.doctorName}</p>}
              {expanded && remotes.length > 0 && <p className="mt-1 text-sm text-white/70">Camera e oprită · vă aude și vă vorbește</p>}
              {expanded && remotes.length === 0 && !hadRemote.current && <p className="mt-1 text-sm text-white/70">{state === ConnectionState.Connected ? 'Așteptăm medicul…' : 'Se conectează…'}</p>}
            </div>
          </div>
        )}

      {/* Antet: medic, pacient, timer */}
      <div className={cn('absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent', expanded ? 'p-4 sm:p-6' : 'p-2')}>
        <div className="min-w-0">
          <p className={cn('truncate font-semibold', expanded ? 'text-lg' : 'text-xs')}>{session.doctorName}</p>
          {expanded && <p className="truncate text-sm text-white/70">Consultație video{session.patientName ? ` pentru ${session.patientName}` : ''}</p>}
        </div>
        <div className="text-right">
          <p className={cn('font-mono font-semibold tabular-nums', overtime ? 'text-orange-400' : 'text-white', expanded ? 'text-2xl' : 'text-xs')}>{timer}</p>
          {expanded && overtime && <p className="text-xs text-orange-300">peste durată</p>}
        </div>
      </div>

      {/* Mesaje în timpul apelului */}
      {expanded && (
        <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-2 px-4">
          {quality === ConnectionQuality.Poor && (
            <div className="flex items-center gap-3 rounded-full bg-black/70 px-4 py-2 text-sm">
              <WifiOff className="h-4 w-4 text-amber-300" />Conexiune slabă. Imaginea poate îngheța.
              {localVideoOn && <button type="button" className="font-semibold underline" onClick={() => void localParticipant.setCameraEnabled(false)}>Oprește camera mea</button>}
            </div>
          )}
          {overtime && !doctorLeft && <p className="rounded-full bg-black/60 px-4 py-1.5 text-xs text-white/80">Apelul continuă până când unul dintre voi iese.</p>}
        </div>
      )}

      {doctorLeft && expanded && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/80 p-6">
          <div className="max-w-sm rounded-2xl bg-white p-6 text-center text-slate-900">
            <p className="text-lg font-semibold">Medicul a ieșit din apel</p>
            <p className="mt-1 text-sm text-slate-600">Dacă s-a întrerupt, te poate suna din nou. Poți rămâne aici câteva minute sau poți continua în chat.</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" onClick={goToChat}>Mergi la chat</Button>
              <Button variant="destructive" onClick={leave}>Ieși din apel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Imaginea proprie */}
      {expanded && (
        <div className="absolute bottom-28 right-4 aspect-video w-32 overflow-hidden rounded-xl bg-slate-800 ring-1 ring-white/20 sm:bottom-24 sm:w-48">
          {localVideoOn && localTrack && isTrackReference(localTrack) ? <VideoTrack trackRef={localTrack} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-white/70">tu</div>}
        </div>
      )}

      {/* Controale */}
      <div className={cn('absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/70 to-transparent', expanded ? 'gap-3 p-5 sm:gap-4 sm:p-6' : 'gap-1.5 p-2')}>
        <MediaToggle source={Track.Source.Microphone} compact={!expanded} />
        <MediaToggle source={Track.Source.Camera} compact={!expanded} />
        <button type="button" onClick={() => onExpandedChange(!expanded)} aria-label={expanded ? 'Minimizează apelul' : 'Mărește apelul'}
          className={cn('grid place-items-center rounded-full bg-white/15 hover:bg-white/25', expanded ? 'h-12 w-12' : 'h-8 w-8')}>
          {expanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => { onExpandedChange(true); setConfirmExit(true); }}
          className={cn('flex items-center gap-2 rounded-full bg-red-600 font-semibold hover:bg-red-700', expanded ? 'h-12 px-5' : 'h-8 px-3 text-xs')}>
          <PhoneOff className={expanded ? 'h-5 w-5' : 'h-4 w-4'} />Ieși
        </button>
      </div>

      {confirmExit && expanded && (
        <div className="absolute inset-0 grid place-items-center bg-slate-950/70 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-900">
            <p className="text-lg font-semibold">Ieși din apel?</p>
            <p className="mt-1 text-sm text-slate-600">Poți continua discuția în chat.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setConfirmExit(false)}>Rămân în apel</Button>
              <Button variant="destructive" onClick={leave}>Ieși din apel</Button>
            </div>
          </div>
        </div>
      )}

      {expanded && <StartAudio label="Activează sunetul" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900" />}
    </div>
  );
}

function MediaToggle({ source, compact }: { source: Track.Source.Microphone | Track.Source.Camera; compact: boolean }) {
  const { buttonProps, enabled, pending } = useTrackToggle({ source });
  const mic = source === Track.Source.Microphone;
  const Icon = mic ? (enabled ? Mic : MicOff) : (enabled ? Camera : CameraOff);
  return (
    <button {...buttonProps} type="button" disabled={pending} aria-pressed={enabled} aria-label={mic ? (enabled ? 'Oprește microfonul' : 'Pornește microfonul') : (enabled ? 'Oprește camera' : 'Pornește camera')}
      className={cn('grid place-items-center rounded-full transition', enabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-slate-900', compact ? 'h-8 w-8' : 'h-12 w-12')}>
      <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  );
}

function CallSummary({ summary, onClose }: { summary: PatientCallSummary; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center sm:text-center">
          <DialogTitle>Apel încheiat{summary.minutes ? ` · ${summary.minutes} min` : ''}</DialogTitle>
          <DialogDescription>Concluzia medicului va apărea în chat.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => { onClose(); navigate(`/patient/chat?request=${summary.requestId}`); }}>Mergi la chat</Button>
          <Button variant="outline" onClick={() => { onClose(); navigate('/patient'); }}>Acasă</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cornerClass(corner: Corner): string {
  return {
    'top-left': 'left-4 top-20',
    'top-right': 'right-4 top-20',
    'bottom-left': 'bottom-24 left-4 lg:bottom-4',
    'bottom-right': 'bottom-24 right-4 lg:bottom-4'
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
