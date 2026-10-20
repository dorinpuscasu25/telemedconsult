import { apiRequest } from './api';
export type CallInvitation = { id: number; request_id: number; caller_id: number; caller_name: string; recipient_id: number; recipient_name: string; patient_name: string | null; status: 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'missed'; expires_at: string };
export const CALL_UPDATED_EVENT = 'telemed:call-updated';
export async function inviteVideoCall(requestId: string | number) {
  const result = await apiRequest<{ call: CallInvitation; message: string }>(`/requests/${requestId}/video/invite`, { method: 'POST' });
  window.dispatchEvent(new Event(CALL_UPDATED_EVENT));
  return result;
}
