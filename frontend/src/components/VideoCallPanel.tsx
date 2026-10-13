import { useState } from 'react';
import { DisconnectButton, GridLayout, LiveKitRoom, MediaDeviceSelect, ParticipantTile, PreJoin, RoomAudioRenderer, StartAudio, TrackToggle, useChat, useParticipants, useTracks, type LocalUserChoices } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { MessageSquare, Settings2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import '@livekit/components-styles';
import './video-call.css';

type Connection = { server_url: string; participant_token: string; choices: LocalUserChoices };

function CallRoom({ onDeviceError }: { onDeviceError: () => void }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const participants = useParticipants();
  const { chatMessages, send, isSending } = useChat();
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [chatError, setChatError] = useState('');
  return <div className="video-room">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 text-sm">
      <span className="inline-flex items-center gap-2 font-medium text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> În apel · {participants.length} {participants.length === 1 ? 'participant' : 'participanți'}</span>
      {participants.length < 2 && <span className="text-slate-500">Așteptăm celălalt participant...</span>}
    </div>
    <div className={`video-stage ${chatOpen ? 'video-stage-with-chat' : ''}`}>
      <GridLayout tracks={tracks}><ParticipantTile /></GridLayout>
      {chatOpen && <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Mesaje în apel</h2><button onClick={() => setChatOpen(false)} aria-label="Închide mesajele" className="text-sm text-primary">Închide</button></div>
        <p className="mb-3 text-xs text-slate-500">Mesajele din apel sunt temporare. Pentru istoricul consultației folosește chatul platformei.</p>
        <div role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
          {chatMessages.map((message) => <div key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="mb-1 text-xs font-semibold text-primary">{message.from?.name || 'Participant'}</p><p className="whitespace-pre-wrap break-words text-slate-700">{message.message}</p></div>)}
        </div>
        {chatError && <p role="alert" className="text-xs text-red-600">{chatError}</p>}
        <form className="mt-3 flex gap-2" onSubmit={async (event) => {
          event.preventDefault(); if (!draft.trim() || isSending) return;
          setChatError('');
          try { await send(draft.trim()); setDraft(''); } catch { setChatError('Mesajul nu a fost trimis. Încearcă din nou.'); }
        }}><Input aria-label="Mesaj în apel" placeholder="Scrie un mesaj..." value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} /><Button disabled={isSending || !draft.trim()} type="submit">Trimite</Button></form>
      </aside>}
    </div>
    <div className="video-controls">
      <TrackToggle source={Track.Source.Microphone} onDeviceError={onDeviceError}>Microfon</TrackToggle>
      <TrackToggle source={Track.Source.Camera} onDeviceError={onDeviceError}>Cameră</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare} onDeviceError={onDeviceError}>Partajează ecranul</TrackToggle>
      <Button variant="outline" onClick={() => setChatOpen(!chatOpen)} aria-pressed={chatOpen}><MessageSquare size={16} /> Mesaje</Button>
      <DisconnectButton>Ieși din apel</DisconnectButton>
    </div>
    <details className="border-t border-slate-100 px-5 py-3 text-sm"><summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-600"><Settings2 size={16} /> Alege camera și microfonul</summary><div className="grid gap-4 pt-4 sm:grid-cols-2"><div><p className="mb-2 font-medium">Microfon</p><MediaDeviceSelect kind="audioinput" onError={onDeviceError} /></div><div><p className="mb-2 font-medium">Cameră</p><MediaDeviceSelect kind="videoinput" onError={onDeviceError} /></div></div></details>
    <RoomAudioRenderer />
    <StartAudio label="Activează sunetul" />
  </div>;
}

export default function VideoCallPanel({ connection, joining, onJoin, onDisconnected, onConnectionError, onDeviceError }: {
  connection: Connection | null;
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
    <CallRoom onDeviceError={onDeviceError} />
  </LiveKitRoom> : <div data-lk-theme="default" className="telemed-video video-prejoin" aria-busy={joining} style={{ pointerEvents: joining ? 'none' : undefined }}>
    <div className="mx-auto mb-6 max-w-lg text-center"><h2 className="text-xl font-semibold text-slate-900">Pregătește-te pentru consultație</h2><p className="mt-2 text-sm text-slate-500">Verifică imaginea și sunetul. Poți intra și cu camera sau microfonul oprite.</p></div>
    <PreJoin defaults={{ username: 'Participant', audioEnabled: true, videoEnabled: true }} persistUserChoices={false}
      joinLabel={joining ? 'Se conectează...' : 'Intră în apel'} micLabel="Microfon" camLabel="Cameră" userLabel="Nume afișat local"
      onSubmit={onJoin} onError={onDeviceError} />
  </div>;
}
