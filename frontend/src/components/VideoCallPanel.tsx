import { useState } from 'react';
import { DisconnectButton, GridLayout, LiveKitRoom, MediaDeviceSelect, ParticipantTile, PreJoin, RoomAudioRenderer, StartAudio, useConnectionState, useParticipants, useTracks, useTrackToggle, type LocalUserChoices } from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { Camera, CameraOff, Mic, MicOff, MonitorUp, MessageSquare, Settings2 } from 'lucide-react';
import { Button } from './ui/button';
import { ConsultationCallChat } from './ConsultationCallChat';
import type { VideoConnection, VideoContext, VideoParticipant } from '../lib/consultation-video';
import '@livekit/components-styles';
import './video-call.css';

function MediaControl({ source, disabled, onDeviceError }: { source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare; disabled: boolean; onDeviceError: () => void }) {
  const { buttonProps, enabled, pending } = useTrackToggle({ source, onDeviceError });
  const mic = source === Track.Source.Microphone;
  const screen = source === Track.Source.ScreenShare;
  const Icon = screen ? MonitorUp : mic ? enabled ? Mic : MicOff : enabled ? Camera : CameraOff;
  const label = screen ? enabled ? 'Oprește partajarea' : 'Partajează ecranul' : mic ? enabled ? 'Oprește microfonul' : 'Pornește microfonul' : enabled ? 'Oprește camera' : 'Pornește camera';
  return <button {...buttonProps} className="lk-button" data-lk-enabled={enabled} aria-pressed={enabled} disabled={disabled || pending}><Icon size={16} />{pending ? 'Se schimbă...' : label}</button>;
}

function CallRoom({ onDeviceError, context }: { onDeviceError: () => void; context: VideoContext }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const participants = useParticipants();
  const state = useConnectionState();
  const connected = state === ConnectionState.Connected;
  const stateLabel = connected ? 'În apel' : [ConnectionState.Reconnecting, ConnectionState.SignalReconnecting].includes(state) ? 'Se restabilește conexiunea...' : state === ConnectionState.Connecting ? 'Se conectează...' : 'Deconectat';
  const [chatOpen, setChatOpen] = useState(false);

  return <div className="video-room">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-sm">
      <span className={`inline-flex items-center gap-2 font-medium ${connected ? 'text-emerald-700' : 'text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} /> {stateLabel} · {participants.length} {participants.length === 1 ? 'participant' : 'participanți'}</span>
      {connected && participants.length < 2 && <span className="text-slate-500">Așteptăm celălalt participant...</span>}
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
      <DisconnectButton>Ieși din apel</DisconnectButton>
    </div>
    <details className="border-t border-slate-100 px-5 py-3 text-sm"><summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-600"><Settings2 size={16} /> Alege camera și microfonul</summary><div className="grid gap-4 pt-4 sm:grid-cols-2"><div><p className="mb-2 font-medium">Microfon</p><MediaDeviceSelect kind="audioinput" onError={onDeviceError} /></div><div><p className="mb-2 font-medium">Cameră</p><MediaDeviceSelect kind="videoinput" onError={onDeviceError} /></div></div></details>
    <RoomAudioRenderer />
    <StartAudio label="Activează sunetul" />
  </div>;
}

export default function VideoCallPanel({ connection, joining, onJoin, onDisconnected, onConnectionError, onDeviceError, participant, context, rejoining }: {
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
  return connection ? <LiveKitRoom className="telemed-video" data-lk-theme="default"
    serverUrl={connection.server_url} token={connection.participant_token} connect
    audio={connection.choices.audioEnabled ? { deviceId: connection.choices.audioDeviceId } : false}
    video={connection.choices.videoEnabled ? { deviceId: connection.choices.videoDeviceId } : false}
    onDisconnected={onDisconnected} onError={onConnectionError} onMediaDeviceFailure={onDeviceError}>
    <CallRoom onDeviceError={onDeviceError} context={context} />
  </LiveKitRoom> : <div data-lk-theme="default" className="telemed-video video-prejoin" aria-busy={joining} style={{ pointerEvents: joining ? 'none' : undefined }}>
    <div className="mx-auto mb-6 max-w-lg text-center"><h2 className="text-xl font-semibold text-slate-900">Pregătește-te pentru consultație</h2><p className="mt-2 text-sm text-slate-500">Verifică imaginea și sunetul. Poți intra și cu camera sau microfonul oprite.</p></div>
    <div className="video-identity"><span className="text-xs font-medium uppercase tracking-wide text-primary">{participant.role_label}</span><p className="mt-1 text-lg font-semibold text-slate-900">{participant.name}</p><p className="mt-1 text-xs text-slate-500">Vei apărea cu acest nume în apel.</p></div>
    <PreJoin defaults={{ username: participant.name, audioEnabled: !rejoining, videoEnabled: !rejoining }} persistUserChoices={false}
      joinLabel={joining ? 'Se conectează...' : 'Intră în apel'} micLabel="Microfon" camLabel="Cameră" userLabel="Nume afișat local"
      onSubmit={(choices) => onJoin({ ...choices, username: participant.name })} onError={onDeviceError} />
  </div>;
}
