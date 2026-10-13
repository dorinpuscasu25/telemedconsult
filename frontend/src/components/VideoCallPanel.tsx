import { LiveKitRoom, PreJoin, VideoConference, type LocalUserChoices } from '@livekit/components-react';
import '@livekit/components-styles';

type Connection = { server_url: string; participant_token: string; choices: LocalUserChoices };

export default function VideoCallPanel({ connection, joining, onJoin, onDisconnected, onConnectionError, onDeviceError }: {
  connection: Connection | null;
  joining: boolean;
  onJoin: (choices: LocalUserChoices) => void;
  onDisconnected: () => void;
  onConnectionError: () => void;
  onDeviceError: () => void;
}) {
  return connection ? <LiveKitRoom
    data-lk-theme="default"
    style={{ height: 'min(65dvh, 650px)' }}
    serverUrl={connection.server_url} token={connection.participant_token} connect
    audio={connection.choices.audioEnabled ? { deviceId: connection.choices.audioDeviceId } : false}
    video={connection.choices.videoEnabled ? { deviceId: connection.choices.videoDeviceId } : false}
    onDisconnected={onDisconnected} onError={onConnectionError}>
    <VideoConference />
  </LiveKitRoom> : <div data-lk-theme="default" className="rounded-xl bg-slate-950 p-4" style={{ pointerEvents: joining ? 'none' : undefined }}>
    <PreJoin defaults={{ username: 'Participant', audioEnabled: true, videoEnabled: true }} persistUserChoices={false}
      joinLabel={joining ? 'Se conectează...' : 'Intră în apel'} micLabel="Microfon" camLabel="Cameră" userLabel="Nume afișat local"
      onSubmit={onJoin} onError={onDeviceError} />
  </div>;
}
