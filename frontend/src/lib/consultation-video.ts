import type { LocalUserChoices } from '@livekit/components-react';

export type VideoParticipant = { name: string; role: 'patient' | 'doctor' | 'operator'; role_label: string };
export type VideoContext = {
  participants: Array<VideoParticipant & { id: number }>;
  specialty: string | null;
  scheduled_at: string | null;
  doctor_started_at: string | null;
  conversation_id: number | null;
};
export type VideoStatus = { available: boolean; configured: boolean; status: string; participant?: VideoParticipant; consultation?: VideoContext };
export type VideoConnection = { server_url: string; participant_token: string; participant: VideoParticipant; choices: LocalUserChoices };
