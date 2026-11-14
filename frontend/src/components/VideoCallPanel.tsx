import { useState } from 'react';
import { DisconnectButton, GridLayout, LiveKitRoom, MediaDeviceSelect, ParticipantTile, PreJoin, RoomAudioRenderer, StartAudio, VideoTrack, isTrackReference, useConnectionState, useParticipants, useTracks, useTrackToggle, type LocalUserChoices } from '@livekit/components-react';
import { ConnectionState, MediaDeviceFailure, Track } from 'livekit-client';
import { Phone, PhoneOff, Camera, CameraOff, Mic, MicOff, MonitorUp, MessageSquare, Settings2, FileText, Clock3 } from 'lucide-react';
import { Button } from './ui/button';
import { ConsultationCallChat } from './ConsultationCallChat';
import type { VideoConnection, VideoContext, VideoParticipant } from '../lib/consultation-video';
import '@livekit/components-styles';
import './video-call.css';

function MediaControl({ source, disabled, onDeviceError, round = false }: { source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare; disabled: boolean; onDeviceError: () => void; round?: boolean }) {
  const { buttonProps, enabled, pending } = useTrackToggle({ source, onDeviceError });
  const mic = source === Track.Source.Microphone;
  const screen = source === Track.Source.ScreenShare;
  const Icon = screen ? MonitorUp : mic ? enabled ? Mic : MicOff : enabled ? Camera : CameraOff;
  const label = screen ? enabled ? 'Oprește partajarea' : 'Partajează ecranul' : mic ? enabled ? 'Oprește microfonul' : 'Pornește microfonul' : enabled ? 'Oprește camera' : 'Pornește camera';
  if (round) return <button {...buttonProps} className="lk-button video-round" data-lk-enabled={enabled} aria-pressed={enabled} aria-label={label} title={label} disabled={disabled || pending}><Icon size={20} /></button>;
  return <button {...buttonProps} className="lk-button" data-lk-enabled={enabled} aria-pressed={enabled} disabled={disabled || pending}><Icon size={16} />{pending ? 'Se schimbă...' : label}</button>;
}

export function VideoCallRoom({ onDeviceError, context, onConclusion, onDelay, conclusionOpen = false, dark = false }: { onDeviceError: () => void; context: VideoContext; onConclusion?: () => void; onDelay?: () => void; conclusionOpen?: boolean; dark?: boolean }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const participants = useParticipants();
  const state = useConnectionState();
  const connected = state === ConnectionState.Connected;
  const stateLabel = connected ? 'În apel' : [ConnectionState.Reconnecting, ConnectionState.SignalReconnecting].includes(state) ? 'Se restabilește conexiunea...' : state === ConnectionState.Connecting ? 'Se conectează...' : 'Deconectat';
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const remoteTracks = tracks.filter((track) => !track.participant.isLocal);
  const primaryTrack = remoteTracks.find((track) => track.source === Track.Source.ScreenShare) ?? remoteTracks.find((track) => track.participant.attributes.role === 'patient') ?? remoteTracks[0];
  const localTrack = tracks.find((track) => track.participant.isLocal && track.source === Track.Source.Camera);
  const primaryName = primaryTrack?.participant.name || context.patient_profile?.display_name || 'Pacient';

  if (dark) {
    return <div className="video-room">
      <div className={`video-stage ${chatOpen ? 'video-stage-with-chat' : ''}`}>
        <div className="relative min-h-0 overflow-hidden rounded-[14px] bg-slate-800">
          {primaryTrack && isTrackReference(primaryTrack) && !primaryTrack.publication.isMuted ? <VideoTrack trackRef={primaryTrack} className="h-full w-full object-cover" /> : <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3"><span className="grid h-[120px] w-[120px] place-items-center rounded-full bg-slate-700 text-4xl font-semibold text-slate-200">{primaryName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('')}</span><p className="text-sm text-slate-300">{primaryTrack ? `${primaryName} · camera este oprită` : 'Așteptăm pacientul să intre în apel…'}</p></div>}
          {!connected && <p role="status" className="absolute inset-x-4 top-4 rounded-xl bg-slate-950/80 px-4 py-3 text-center text-sm text-white">{stateLabel}</p>}
          <div className="video-self-preview absolute bottom-4 right-4 h-[120px] w-[200px] overflow-hidden rounded-[10px] border-2 border-slate-950 bg-slate-700 max-sm:h-[120px] max-sm:w-[90px]">{localTrack && isTrackReference(localTrack) && !localTrack.publication.isMuted ? <VideoTrack trackRef={localTrack} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[13px] text-slate-300">Tu</div>}</div>
          <div className="absolute bottom-4 left-4 flex gap-2">{remoteTracks.filter((track) => track !== primaryTrack && track.source === Track.Source.Camera).map((track) => <div key={track.participant.sid} className="h-[100px] w-[160px] overflow-hidden rounded-xl border border-white/20 bg-slate-700 max-sm:h-20 max-sm:w-24"><ParticipantTile trackRef={track} /></div>)}</div>
          {confirmExit && <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/70 p-4"><div role="alertdialog" aria-label="Ieși din apel?" className="w-full max-w-[400px] rounded-2xl bg-white p-5 text-slate-900"><h2 className="text-[17px] font-bold">Ieși din apel?</h2><p className="mt-1 text-sm text-slate-500">Poți continua discuția în chat și reveni cât timp consultația este activă.</p><div className="mt-5 flex justify-end gap-2"><button type="button" autoFocus onClick={() => setConfirmExit(false)} className="h-[42px] rounded-[10px] border border-slate-200 px-4 text-sm font-medium">Rămân în apel</button><DisconnectButton>Ieși din apel</DisconnectButton></div></div></div>}
        </div>
        {chatOpen && <ConsultationCallChat context={context} onClose={() => setChatOpen(false)} />}
      </div>
      {connected && participants.length < 2 && <p className="px-4 pt-3 text-center text-sm text-slate-400">Ești în apel. Așteptăm pacientul.</p>}
      <div className="video-controls">
        <MediaControl round source={Track.Source.Microphone} disabled={!connected} onDeviceError={onDeviceError} />
        <MediaControl round source={Track.Source.Camera} disabled={!connected} onDeviceError={onDeviceError} />
        <button type="button" className="lk-button video-round" aria-pressed={chatOpen} aria-label="Mesaje" title="Mesaje" onClick={() => setChatOpen(!chatOpen)}><MessageSquare size={20} /></button>
        {onConclusion && <button type="button" className="video-pill" aria-label="Concluzie" title="Concluzie" aria-pressed={conclusionOpen} onClick={onConclusion}><FileText size={18} /><span className="max-sm:hidden">Concluzie</span></button>}
        {onDelay && <button type="button" className="video-pill" aria-label="Anunță întârzierea" title="Anunță întârzierea" onClick={onDelay}><Clock3 size={18} /><span className="max-sm:hidden">Întârzii</span></button>}
        <button type="button" className="video-exit" aria-label="Ieși din apel" onClick={() => setConfirmExit(true)}><PhoneOff size={20} /><span className="max-sm:hidden">Ieși</span></button>
      </div>
      <RoomAudioRenderer />
      <StartAudio label="Activează sunetul" />
    </div>;
  }

  return <div className="video-room">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-sm">
      <span className={`inline-flex items-center gap-2 font-medium ${connected ? 'text-emerald-700' : 'text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} /> {stateLabel} · {participants.length} {participants.length === 1 ? 'participant' : 'participanți'}</span>
      {connected && participants.length < 2 && <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700"><Phone size={16} className="motion-safe:animate-pulse" />Ești în apel. Așteptăm celălalt participant.</span>}
    </div>
    <div className={`video-stage ${chatOpen ? 'video-stage-with-chat' : ''}`}>
      <GridLayout tracks={tracks}><ParticipantTile /></GridLayout>
      {chatOpen && <ConsultationCallChat context={context} onClose={() => setChatOpen(false)} />}
    </div>
    <div className="video-controls">
      <MediaControl source={Track.Source.Microphone} disabled={!connected} onDeviceError={onDeviceError} />
      <MediaControl source={Track.Source.Camera} disabled={!connected} onDeviceError={onDeviceError} />
      {typeof navigator.mediaDevices?.getDisplayMedia === 'function' && <MediaControl source={Track.Source.ScreenShare} disabled={!connected} onDeviceError={onDeviceError} />}
      <Button variant="outline" onClick={() => setChatOpen(!chatOpen)} aria-pressed={chatOpen}><MessageSquare size={16} /> Mesaje</Button>
      {onConclusion && <Button onClick={onConclusion} aria-pressed={conclusionOpen} variant={conclusionOpen ? 'default' : 'outline'}><FileText size={16} /> Concluzie</Button>}
      <DisconnectButton>Ieși din apel</DisconnectButton>
    </div>
    <details className="border-t border-slate-100 px-5 py-3 text-sm"><summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-600"><Settings2 size={16} /> Alege camera și microfonul</summary><div className="grid gap-4 pt-4 sm:grid-cols-2"><div><p className="mb-2 font-medium">Microfon</p><MediaDeviceSelect kind="audioinput" onError={onDeviceError} /></div><div><p className="mb-2 font-medium">Cameră</p><MediaDeviceSelect kind="videoinput" onError={onDeviceError} /></div></div></details>
    <RoomAudioRenderer />
    <StartAudio label="Activează sunetul" />
  </div>;
}

export default function VideoCallPanel({ connection, joining, onJoin, onDisconnected, onConnectionError, onDeviceError, participant, context, rejoining, onConclusion, conclusionOpen, onDelay, dark = false }: {
  dark?: boolean;
  onConclusion?: () => void;
  onDelay?: () => void;
  conclusionOpen?: boolean;
  connection: VideoConnection | null;
  participant: VideoParticipant;
  context: VideoContext;
  rejoining: boolean;
  joining: boolean;
  onJoin: (choices: LocalUserChoices) => void;
  onDisconnected: () => void;
  onConnectionError: () => void;
  onDeviceError: () => void;
}) {
  return connection ? <LiveKitRoom className={dark ? `telemed-video video-dark h-full${conclusionOpen ? ' video-conclusion-open' : ''}` : 'telemed-video'} data-lk-theme="default"
    serverUrl={connection.server_url} token={connection.participant_token} connect
    audio={connection.choices.audioEnabled ? { deviceId: connection.choices.audioDeviceId } : false}
    video={connection.choices.videoEnabled ? { deviceId: connection.choices.videoDeviceId } : false}
    onDisconnected={onDisconnected} onError={(error) => { if (MediaDeviceFailure.getFailure(error)) onDeviceError(); else onConnectionError(); }} onMediaDeviceFailure={onDeviceError}>
    <VideoCallRoom onDeviceError={onDeviceError} context={context} onConclusion={onConclusion} onDelay={onDelay} conclusionOpen={conclusionOpen} dark={dark} />
  </LiveKitRoom> : <div data-lk-theme="default" className="telemed-video video-prejoin" aria-busy={joining} style={{ pointerEvents: joining ? 'none' : undefined }}>
    <div className="mx-auto mb-6 max-w-lg text-center"><h2 className="text-xl font-semibold text-slate-900">Pregătește-te pentru consultație</h2><p className="mt-2 text-sm text-slate-500">{participant.role === 'doctor' ? 'Intră în apel și sună pacientul.' : 'Medicul inițiază apelul. Poți intra după ce acesta deschide consultația.'} Camera și microfonul sunt oprite inițial; le poți porni când dorești.</p></div>
    <div className="video-identity"><span className="text-xs font-medium uppercase tracking-wide text-primary">{participant.role_label}</span><p className="mt-1 text-lg font-semibold text-slate-900">{participant.name}</p><p className="mt-1 text-xs text-slate-500">Vei apărea cu acest nume în apel.</p></div>
    <PreJoin defaults={{ username: participant.name, audioEnabled: false, videoEnabled: false }} persistUserChoices={false}
      joinLabel={joining ? 'Se conectează...' : rejoining ? 'Revino în apel' : participant.role === 'doctor' ? 'Intră în apel și sună' : 'Intră în apel'} micLabel="Microfon" camLabel="Cameră" userLabel="Nume afișat local"
      onSubmit={(choices) => onJoin({ ...choices, username: participant.name })} onError={onDeviceError} />
  </div>;
}
