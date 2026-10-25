import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { CheckCircle2, FileText, MessageSquare, Paperclip, Search, Send, History, CalendarDays, ChevronLeft, ChevronRight, Stethoscope, Info, Check, Video } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getEcho } from '../../lib/realtime';
import { ConsultationChatNavigation } from '../../components/ConsultationChatNavigation';
import { PatientChart } from '../../components/PatientChart';
import { ConsultationAnamnesis } from '../../components/ConsultationAnamnesis';
import { HigoConsultationProposal } from '../../components/HigoConsultationProposal';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { dateOnly } from '../../lib/format';

interface ChatUser {
  id: number;
  name: string;
  email: string;
}

interface Message {
  id: number;
  body: string;
  sender_id: number;
  sender?: ChatUser;
  type?: 'text' | 'image' | 'file' | 'system';
  metadata?: {
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    url?: string;
  } | null;
  created_at: string;
}

/** Starea reală a chatului, calculată în backend din etapa consultației. */
interface ChatState {
  state: 'pending' | 'open' | 'reactivatable' | 'closed';
  can_write: boolean;
  can_reactivate: boolean;
  message: string | null;
  reactivate_until?: string | null;
}

const CHAT_BADGES: Record<ChatState['state'], { label: string; className: string }> = {
  pending: { label: 'În așteptare', className: 'bg-amber-50 text-amber-600 border-amber-200' },
  open: { label: 'Activ', className: 'bg-green-50 text-green-600 border-green-200' },
  reactivatable: { label: 'Închis', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  closed: { label: 'Încheiat', className: 'bg-slate-100 text-slate-500 border-slate-200' }
};

interface Conversation {
  is_direct?: boolean;
  patient_profile_id?: number | null;
  patient_profile?: { id: number; display_name: string; patient_code?: string; birth_date?: string; gender?: string; medical_record?: Record<string, unknown> };
  unread_count?: number;
  chat?: ChatState;
  id: number;
  status: string;
  consultation_request_id?: number | null;
  patient_id: number;
  doctor_id?: number | null;
  operator_id?: number | null;
  patient?: ChatUser;
  doctor?: ChatUser | null;
  operator?: ChatUser | null;
  messages: Message[];
  consultation_request?: {
    id: number;
    chat_expires_at?: string | null;
    free_chat_until?: string | null;
    chat_reactivated_until?: string | null;
  } | null;
  created_at: string;
}

type Participant = ChatUser & { role: string };
type ChatPeer = { key: string; id: number; role: 'patient' | 'doctor' | 'operator'; name: string; unread: number; latest: Conversation };

export function ChatView({ emptyTitle = 'Nu ai conversații încă', patientProfileId }: { emptyTitle?: string; patientProfileId?: number }) {
  const { user, role } = useAuth();
  const currentUserId = user ? Number(user.id) : null;
  const channelChat = (role === 'patient' || role === 'doctor' || role === 'operator') && !patientProfileId;
  const [peerSearch, setPeerSearch] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [showChart, setShowChart] = useState(false);
  const [panel, setPanel] = useState<'history' | 'details' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [typingName, setTypingName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [openingDirect, setOpeningDirect] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  // Pe telefon lista și conversația sunt ecrane separate; un link direct
  // (?conversation=, ?request=, ?doctor=…) deschide direct conversația.
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() => (hasConversationTarget() ? 'chat' : 'list'));
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const subscribedChannels = useRef<Set<string>>(new Set());

  const upsertConversation = useCallback((nextConversation: Conversation) => {
    if ((role === 'patient' && nextConversation.patient_id !== currentUserId) || (role === 'doctor' && nextConversation.doctor_id !== currentUserId) || (role === 'operator' && nextConversation.operator_id !== currentUserId)) return;
    setConversations((current) => {
      const exists = current.some((conversation) => conversation.id === nextConversation.id);
      const nextList = exists
        ? current.map((conversation) => conversation.id === nextConversation.id ? { ...nextConversation, chat: nextConversation.chat || conversation.chat, unread_count: nextConversation.unread_count ?? ((conversation.unread_count || 0) + nextConversation.messages.filter((message) => Number(message.sender_id) !== Number(user?.id) && !conversation.messages.some((previous) => previous.id === message.id)).length) } : conversation)
        : [nextConversation, ...current];

      return [...nextList].sort((first, second) => {
        const firstMessage = first.messages[first.messages.length - 1];
        const secondMessage = second.messages[second.messages.length - 1];
        return new Date(secondMessage?.created_at || second.created_at).getTime() - new Date(firstMessage?.created_at || first.created_at).getTime();
      });
    });
    setActiveId((current) => current ?? nextConversation.id);
  }, [user?.id, role, currentUserId]);

  const appendMessage = useCallback((conversationId: number, message: Message) => {
    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;

      const messageExists = conversation.messages.some((item) => item.id === message.id);
      if (messageExists) return conversation;

      return {
        ...conversation,
        unread_count: (conversation.unread_count || 0) + (message.sender_id !== currentUserId ? 1 : 0),
        messages: [...conversation.messages, message]
      };
    }));
  }, [currentUserId]);

  const loadConversations = useCallback(() => {
    apiRequest<{data: Conversation[]}>(patientProfileId ? `/conversations?patient_profile=${patientProfileId}` : '/conversations').then((response) => {
      setConversations(response.data);
      setActiveId((current) => {
        const requestedId = Number(searchParams.get('conversation'));
        if (requestedId && response.data.some((conversation) => conversation.id === requestedId)) {
          return requestedId;
        }
        const requestedConsultation = Number(searchParams.get('request'));
        const consultationChat = response.data.find((conversation) => conversation.consultation_request_id === requestedConsultation);
        if (requestedConsultation && consultationChat) return consultationChat.id;

        const requestedPatient = Number(patientProfileId || searchParams.get('patient_profile'));
        return (requestedPatient ? response.data.find((item) => Number(item.patient_profile_id) === requestedPatient)?.id : current) ?? response.data[0]?.id ?? null;
      });
    }).catch((err) => setError(err instanceof Error ? err.message : 'Conversațiile nu au putut fi încărcate.')).finally(() => setLoading(false));
  }, [searchParams, patientProfileId]);

  useEffect(() => {
    loadConversations();
    const refresh = () => { if (document.visibilityState === 'visible') loadConversations(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [loadConversations]);

  const requestedPatient = Number(patientProfileId || searchParams.get('patient_profile'));
  const requestedAccount = Number(searchParams.get('account'));
  const requestedDoctor = Number(searchParams.get('doctor'));
  const requestedOperator = Number(searchParams.get('operator'));
  const selectedConversation = conversations.find((item) => item.id === activeId);
  const defaultConversation = selectedConversation || conversations[0];
  const activePeerRole = role === 'patient' ? (requestedDoctor ? 'doctor' : requestedOperator ? 'operator' : defaultConversation?.doctor_id ? 'doctor' : 'operator') : 'patient';
  const activePeerId = role === 'patient'
    ? requestedDoctor || requestedOperator || (activePeerRole === 'doctor' ? defaultConversation?.doctor_id : defaultConversation?.operator_id)
    : requestedAccount || defaultConversation?.patient_id;
  const activePeerKey = activePeerId ? `${activePeerRole}:${activePeerId}` : '';
  const peerConversations = useMemo(() => conversations.filter((item) =>
    channelChat && activePeerId
      ? activePeerRole === 'patient' ? item.patient_id === activePeerId : activePeerRole === 'doctor' ? item.doctor_id === activePeerId : !item.doctor_id && item.operator_id === activePeerId
      : (!requestedAccount || item.patient_id === requestedAccount) && (!requestedDoctor || item.doctor_id === requestedDoctor)), [conversations, channelChat, activePeerId, activePeerRole, requestedAccount, requestedDoctor]);
  const filteredConversations = useMemo(() => peerConversations.filter((item) =>
    !requestedPatient || Number(item.patient_profile_id) === requestedPatient), [peerConversations, requestedPatient]);
  const activeChat = filteredConversations.find((item) => item.id === activeId) || filteredConversations[0];
  const activePatientConversations = channelChat ? peerConversations.filter((item) => (item.patient_profile_id ?? null) === (activeChat?.patient_profile_id ?? null)) : filteredConversations;
  const directConversations = peerConversations.filter((item) => item.is_direct);
  const directUnread = directConversations.reduce((total, item) => total + (item.unread_count || 0), 0);
  const patientGroups = Array.from(new Map(peerConversations.map((item) => [item.patient_profile_id, item.patient_profile])).entries()).filter(([id]) => id);
  const peers = useMemo(() => {
    const groups = new Map<string, ChatPeer>();
    conversations.forEach((conversation) => {
      const peerRole = role === 'patient' ? (conversation.doctor_id ? 'doctor' : 'operator') : 'patient';
      const id = peerRole === 'doctor' ? conversation.doctor_id : peerRole === 'operator' ? conversation.operator_id : conversation.patient_id;
      if (!id) return;
      const peerUser = peerRole === 'doctor' ? conversation.doctor : peerRole === 'operator' ? conversation.operator : conversation.patient;
      const key = `${peerRole}:${id}`;
      const group = groups.get(key);
      if (group) {
        group.unread += conversation.unread_count || 0;
        const time = (item: Conversation) => new Date(item.messages[item.messages.length - 1]?.created_at || item.created_at).getTime();
        if (time(conversation) > time(group.latest)) group.latest = conversation;
      } else groups.set(key, { key, id, role: peerRole, name: peerUser?.name || (peerRole === 'doctor' ? 'Medic' : peerRole === 'operator' ? 'Operator' : 'Titularul contului'), unread: conversation.unread_count || 0, latest: conversation });
    });
    return [...groups.values()];
  }, [conversations, role]);
  const selectPeer = (key: string) => {
    const peer = peers.find((item) => item.key === key);
    if (!peer) return;
    const next = new URLSearchParams();
    next.set(peer.role === 'patient' ? 'account' : peer.role, String(peer.id));
    setSearchParams(next);
    setActiveId(peer.latest.id);
    setError('');
  };
  const selectConversation = (conversation: Conversation) => {
    const next = new URLSearchParams(searchParams);
    next.set('conversation', String(conversation.id));
    next.delete('request');
    if (channelChat) {
      if (role === 'patient') {
        next.delete('account'); next.delete('doctor'); next.delete('operator');
        next.set(conversation.doctor_id ? 'doctor' : 'operator', String(conversation.doctor_id || conversation.operator_id));
      } else next.set('account', String(conversation.patient_id));
    }
    if (conversation.patient_profile_id) next.set('patient_profile', String(conversation.patient_profile_id));
    else next.delete('patient_profile');
    setSearchParams(next); setActiveId(conversation.id); setError('');
  };
  const readConversationId = activeChat?.id;
  useEffect(() => {
    setNewMessage('');
    setTypingName('');
    setShowChart(false);
  }, [readConversationId]);
  const readMessageId = activeChat?.messages[activeChat.messages.length - 1]?.id;
  useEffect(() => {
    if (!readConversationId || !readMessageId) return;
    apiRequest(`/conversations/${readConversationId}/read`, { method: 'POST', body: JSON.stringify({ last_message_id: readMessageId }) }).then(() => {
      setConversations((current) => current.map((item) => item.id === readConversationId ? { ...item, unread_count: 0 } : item));
      window.dispatchEvent(new Event('conversation-read'));
    }).catch(() => undefined);
  }, [readConversationId, readMessageId]);

  useEffect(() => {
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
  }, [activeChat?.id, activeChat?.messages.length]);

  useEffect(() => {
    const echo = getEcho();
    const channels = subscribedChannels.current;
    if (!echo || !currentUserId) return;

    const userChannelName = `App.Models.User.${currentUserId}`;
    if (!channels.has(userChannelName)) {
      echo.private(userChannelName)
        .listen('.conversation.updated', (event: { conversation: Conversation }) => {
          upsertConversation(event.conversation);
        })
        .listen('.conversation.message.sent', (event: { conversation_id: number; message: Message }) => {
          appendMessage(Number(event.conversation_id), event.message);
        });
      channels.add(userChannelName);
    }

    return () => {
      echo.leave(userChannelName);
      channels.delete(userChannelName);
    };
  }, [appendMessage, currentUserId, upsertConversation]);

  useEffect(() => {
    const echo = getEcho();
    const channels = subscribedChannels.current;
    if (!echo) return;

    conversations.forEach((conversation) => {
      const channelName = `conversation.${conversation.id}`;
      if (channels.has(channelName)) return;

      echo.private(channelName)
        .listen('.conversation.updated', (event: { conversation: Conversation }) => {
          upsertConversation(event.conversation);
        })
        .listen('.conversation.message.sent', (event: { conversation_id: number; message: Message }) => {
          appendMessage(Number(event.conversation_id), event.message);
        })
        .listenForWhisper?.('typing', (event: { user_id: number; name: string }) => {
          if (event.user_id === currentUserId) return;
          setTypingName(event.name);
          if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = window.setTimeout(() => setTypingName(''), 2200);
        });
      channels.add(channelName);
    });

    return () => {
      conversations.forEach((conversation) => {
        const channelName = `conversation.${conversation.id}`;
        echo.leave(channelName);
        channels.delete(channelName);
      });
    };
  }, [appendMessage, conversations, upsertConversation, currentUserId]);

  const participantFor = (conversation: Conversation): Participant => {
    if (currentUserId && conversation.patient_id !== currentUserId && conversation.patient) {
      return { ...conversation.patient, role: 'Titularul contului' };
    }

    if (currentUserId && conversation.doctor_id !== currentUserId && conversation.doctor) {
      return { ...conversation.doctor, role: 'Medic' };
    }

    if (currentUserId && conversation.operator_id !== currentUserId && conversation.operator) {
      return { ...conversation.operator, role: 'Operator' };
    }

    return { id: 0, name: 'Echipa telemedconsult.md', email: 'support@telemedconsult.md', role: 'Suport' };
  };

  const openDirectConversation = async () => {
    if (!activeChat || openingDirect) return;
    const existing = peerConversations.find((item) => item.is_direct && (role !== 'patient' || ((item.doctor_id ?? null) === (activeChat.doctor_id ?? null) && (item.operator_id ?? null) === (activeChat.doctor_id ? null : activeChat.operator_id ?? null))));
    if (existing) { selectConversation(existing); return; }
    setOpeningDirect(true);
    try {
      const response = await apiRequest<{ data: Conversation }>(`/conversations/${activeChat.id}/direct`, { method: 'POST' });
      setConversations((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
      selectConversation(response.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Discuția directă nu a putut fi deschisă.'); }
    finally { setOpeningDirect(false); }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    setIsSending(true);
    try {
      await apiRequest(`/conversations/${activeChat.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: newMessage })
      });
      setNewMessage('');
      if (composerRef.current) composerRef.current.style.height = 'auto';
      loadConversations();
    } catch (err) { setError(err instanceof Error ? err.message : 'Mesajul nu a putut fi trimis.'); } finally {
      setIsSending(false);
    }
  };

  const handleTyping = (value: string) => {
    setNewMessage(value);
    if (!activeChat || !currentUserId || !user) return;

    const echo = getEcho();
    const channel = echo?.private(`conversation.${activeChat.id}`) as unknown as { whisper?: (event: string, data: unknown) => void };
    channel?.whisper?.('typing', { user_id: currentUserId, name: user.name });
  };

  const handleAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeChat) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsSending(true);
    try {
      await apiRequest(`/conversations/${activeChat.id}/attachments`, {
        method: 'POST',
        body: formData
      });
      loadConversations();
    } catch (err) { setError(err instanceof Error ? err.message : 'Mesajul nu a putut fi trimis.'); } finally {
      setIsSending(false);
      event.target.value = '';
    }
  };

  const reactivateChat = async () => {
    const requestId = activeChat?.consultation_request_id || activeChat?.consultation_request?.id;
    if (!requestId) return;
    await apiRequest(`/requests/${requestId}/reactivate-chat`, { method: 'POST' });
    loadConversations();
  };

  if (!activeChat) {
    return (
      <div className="mx-auto max-w-lg py-10">
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading ? (
          <div className="space-y-3" role="status" aria-label="Se încarcă conversațiile">
            <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
            <div className="h-16 animate-pulse rounded-2xl bg-slate-200/70" />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><MessageSquare className="h-6 w-6" /></span>
            <h1 className="font-semibold text-slate-900">{emptyTitle}</h1>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Conversația se deschide automat când trimiți sau preiei o cerere de consultație.</p>
            {searchParams.toString() && <Button variant="outline" className="mt-4" onClick={() => setSearchParams({})}>Vezi toate conversațiile</Button>}
          </div>
        )}
      </div>
    );
  }

  const activeParticipant = participantFor(activeChat);
  // Backendul calculează starea din etapa consultației; `status` rămâne doar ca
  // rezervă pentru conversațiile fără cerere asociată.
  const chat: ChatState = activeChat.chat ?? {
    state: activeChat.status === 'open' ? 'open' : 'closed',
    can_write: activeChat.status === 'open',
    can_reactivate: false,
    message: null
  };
  const chatBadge = CHAT_BADGES[chat.state] ?? CHAT_BADGES.closed;
  const generalConversation = peerConversations.find((item) => !item.patient_profile_id && !item.is_direct);
  const visibleGroups = patientGroups.filter(([, patient]) => !channelSearch || `${patient?.display_name ?? ''} ${patient?.patient_code ?? ''}`.toLocaleLowerCase('ro').includes(channelSearch.toLocaleLowerCase('ro')));
  const channelLabel = activeChat.is_direct ? 'Discuție directă' : activeChat.patient_profile?.display_name || 'General';
  const visiblePeers = peers.filter((account) => account.name.toLocaleLowerCase('ro').includes(peerSearch.toLocaleLowerCase('ro')));
  const showListOnMobile = channelChat && mobileView === 'list';
  const title = activeChat.is_direct ? (role === 'patient' ? activeParticipant.name : activeChat.patient?.name || activeParticipant.name) : activeChat.patient_profile?.display_name || activeParticipant.name;
  const subtitle = role === 'patient'
    ? [activeParticipant.role === 'Medic' ? `Dr. ${activeParticipant.name}` : activeParticipant.name, !activeChat.is_direct && activeChat.patient_profile?.display_name ? `pentru ${activeChat.patient_profile.display_name}` : null].filter(Boolean).join(' · ')
    : [activeChat.patient?.name && `Titular: ${activeChat.patient.name}`, activeChat.patient_profile?.patient_code && `Cod ${activeChat.patient_profile.patient_code}`].filter(Boolean).join(' · ');

  const heightClass = patientProfileId
    ? 'h-[640px]'
    : 'h-[calc(100dvh-56px-64px-3.25rem-env(safe-area-inset-bottom))] min-h-[420px] lg:h-[calc(100dvh-64px-4.5rem)]';

  return (
    <div className={`${heightClass} flex gap-4`}>
      {channelChat && (
        <section className={`${showListOnMobile ? 'flex' : 'hidden'} w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:flex lg:w-80`} aria-label="Conversații">
          <div className="border-b border-slate-100 p-4">
            <h1 className="text-lg font-bold text-slate-950">Mesaje</h1>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input aria-label={role === 'patient' ? 'Caută un medic sau operator' : 'Caută titularul contului'} placeholder={role === 'patient' ? 'Caută medic sau operator' : 'Caută pacient sau titular'} value={peerSearch} onChange={(event) => setPeerSearch(event.target.value)} className="h-10 pl-9" />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <ul className="p-2">
              {visiblePeers.map((account) => {
                const lastMessage = account.latest.messages[account.latest.messages.length - 1];
                const active = activePeerKey === account.key;
                return (
                  <li key={account.key}>
                    <button type="button" onClick={() => { selectPeer(account.key); setMobileView('chat'); }} aria-pressed={active} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${active ? 'bg-primary/10' : 'hover:bg-slate-50'}`}>
                      <Avatar className="size-11 shrink-0"><AvatarFallback className={active ? 'bg-primary text-sm font-semibold text-white' : 'bg-slate-100 text-sm font-semibold text-slate-600'}>{initialsOf(account.name)}</AvatarFallback></Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${account.unread > 0 ? 'font-bold text-slate-950' : 'font-semibold text-slate-900'}`}>{account.role === 'doctor' ? `Dr. ${account.name}` : account.name}</span>
                          {lastMessage && <span className="shrink-0 text-[11px] text-slate-400">{shortTime(lastMessage.created_at)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${account.unread > 0 ? 'font-medium text-slate-700' : 'text-slate-500'}`}>{lastMessage?.type === 'image' ? 'Imagine' : lastMessage?.type === 'file' ? 'Fișier atașat' : lastMessage?.body || 'Conversație nouă'}</span>
                          {account.unread > 0 && <span aria-label={`${account.unread} mesaje necitite`} className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{account.unread}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {peerSearch && visiblePeers.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{role === 'patient' ? 'Niciun medic sau operator găsit.' : 'Niciun pacient găsit.'}</p>}
          </ScrollArea>
        </section>
      )}

      <section className={`${showListOnMobile ? 'hidden lg:flex' : 'flex'} min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white`} aria-label="Conversația">
        {/* Subiectele cu interlocutorul ales: discuția directă și câte un fir pe
            fiecare pacient. Coloană separată, cu căutare, ca să rămână ușor de
            folosit și când titularul are mulți pacienți. */}
        {channelChat && (
          <aside aria-label="Pacienți" className="hidden w-56 shrink-0 flex-col border-r border-slate-100 bg-slate-50/70 md:flex xl:w-64">
            <div className="space-y-2 p-3">
              <ChannelRow icon={<MessageSquare className="h-4 w-4" />} active={Boolean(activeChat.is_direct)} disabled={openingDirect} unread={directUnread} onClick={() => void openDirectConversation()}>
                Discuție directă
              </ChannelRow>
            </div>
            <div className="flex items-center justify-between px-4 pb-2 pt-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pacienți</h3>
              <span className="tabular text-xs text-slate-400">{patientGroups.length}</span>
            </div>
            {patientGroups.length > 5 && (
              <div className="px-3 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input aria-label="Caută pacient" placeholder="Caută pacient" value={channelSearch} onChange={(event) => setChannelSearch(event.target.value)} className="h-9 pl-8 text-sm" />
                </div>
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1 px-3 pb-3">
                {visibleGroups.map(([id, patient]) => {
                  const patientConversations = peerConversations.filter((item) => item.patient_profile_id === id);
                  const unread = patientConversations.reduce((total, item) => total + (item.unread_count || 0), 0);
                  const name = patient?.display_name || `Pacient ${id}`;
                  return (
                    <ChannelRow
                      key={id}
                      icon={<span className="text-[11px] font-bold">{initialsOf(name)}</span>}
                      active={!activeChat.is_direct && activeChat.patient_profile_id === id}
                      unread={unread}
                      detail={patient?.patient_code ? `Cod ${patient.patient_code}` : patientConversations.length > 1 ? `${patientConversations.length} consultații` : undefined}
                      onClick={() => selectConversation(patientConversations[0])}>
                      {name}
                    </ChannelRow>
                  );
                })}
                {channelSearch && visibleGroups.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Niciun pacient găsit.</p>}
                {patientGroups.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Discuțiile pe pacienți apar după prima consultație.</p>}
                {generalConversation && (
                  <ChannelRow icon={<span className="text-sm font-bold">#</span>} active={!activeChat.patient_profile_id && !activeChat.is_direct} onClick={() => selectConversation(generalConversation)}>
                    General
                  </ChannelRow>
                )}
              </div>
            </ScrollArea>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
        {!patientProfileId && !channelChat && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <select aria-label="Pacient" disabled={openingDirect} className="h-9 max-w-full rounded-lg border border-slate-200 px-2 text-sm" value={requestedPatient || ''} onChange={(event) => {
              const next = new URLSearchParams(searchParams); next.delete('conversation'); next.delete('request');
              if (event.target.value) next.set('patient_profile', event.target.value); else next.delete('patient_profile');
              setSearchParams(next);
            }}>
              <option value="">Toți pacienții</option>
              {patientGroups.map(([id, patient]) => <option key={id} value={id ?? ''}>{patient?.display_name || `Pacient ${id}`}{patient?.patient_code ? ` · ${patient.patient_code}` : ''}</option>)}
            </select>
            <Button variant="outline" size="sm" disabled={openingDirect} onClick={openDirectConversation}><MessageSquare className="h-4 w-4" />Discuție directă</Button>
            <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>Toate conversațiile</Button>
          </div>
        )}

        {/* Antetul conversației */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-3 sm:px-5">
          {channelChat && (
            <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Înapoi la conversații" onClick={() => setMobileView('list')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="hidden size-10 shrink-0 sm:flex"><AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initialsOf(title)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate font-semibold text-slate-950">{title}</h2>
              <Badge variant="outline" className={`${chatBadge.className} hidden shrink-0 rounded-full text-[11px] sm:inline-flex`}>{chatBadge.label}</Badge>
            </div>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {activeChat.patient_profile_id && (
              <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setShowChart(true)} aria-label="Fișa pacientului">
                <Stethoscope className="h-4 w-4" /><span className="hidden xl:inline">Fișa</span>
              </Button>
            )}
            {activePatientConversations.length > 1 && (
              <Button variant="ghost" size="sm" className="text-slate-600" onClick={() => setPanel('history')} aria-label="Consultațiile pacientului">
                <History className="h-4 w-4" /><span className="tabular text-xs">{activePatientConversations.length}</span>
              </Button>
            )}
            {!activeChat.consultation_request_id && <Button size="sm" variant="outline" disabled className="hidden sm:inline-flex" title="Selectează o consultație confirmată pentru a iniția un apel video."><Video className="h-4 w-4" />Apel video</Button>}
            {activeChat.consultation_request_id && (
              <Button variant="outline" size="sm" onClick={() => setPanel('details')} aria-label="Detaliile consultației">
                <Info className="h-4 w-4" /><span className="hidden sm:inline">Detalii</span>
              </Button>
            )}
          </div>
        </header>

        {/* Canalul: discuție directă / pacient / general */}
        {channelChat && (patientGroups.length > 0 || generalConversation) && (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-3 py-2 [scrollbar-width:none] sm:px-5 md:hidden">
            <span className="shrink-0 text-xs font-medium text-slate-500">Subiect:</span>
            <ChannelChip active={Boolean(activeChat.is_direct)} disabled={openingDirect} onClick={() => void openDirectConversation()} unread={directUnread}>Discuție directă</ChannelChip>
            {patientGroups.map(([id, patient]) => {
              const patientConversations = peerConversations.filter((item) => item.patient_profile_id === id);
              const unread = patientConversations.reduce((total, item) => total + (item.unread_count || 0), 0);
              return <ChannelChip key={id} active={!activeChat.is_direct && activeChat.patient_profile_id === id} unread={unread} onClick={() => selectConversation(patientConversations[0])}>{patient?.display_name || `Pacient ${id}`}</ChannelChip>;
            })}
            {generalConversation && <ChannelChip active={!activeChat.patient_profile_id && !activeChat.is_direct} onClick={() => selectConversation(generalConversation)}>General</ChannelChip>}
            <span className="sr-only">Subiect curent: {channelLabel}</span>
          </div>
        )}

        {error && <p role="alert" className="shrink-0 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}
        {activeChat.consultation_request_id && <ConsultationChatNavigation key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} onRefresh={loadConversations} />}

        <Sheet open={panel !== null} onOpenChange={(open) => { if (!open) setPanel(null); }}>
          <SheetContent className="w-[min(28rem,100%)] gap-0" aria-describedby="chat-panel-description">
            <SheetHeader className="border-b border-slate-100 pr-14">
              <SheetTitle>{panel === 'history' ? 'Consultațiile pacientului' : 'Detalii consultație'}</SheetTitle>
              <SheetDescription id="chat-panel-description">{activeChat.patient_profile?.display_name || activeParticipant.name}{panel === 'details' && ` · Consultația #${activeChat.consultation_request_id}`}</SheetDescription>
            </SheetHeader>
            {panel === 'history' && <div className="space-y-2 p-4"><p className="mb-4 text-xs text-slate-500">Alege consultația pentru a vedea discuția corespunzătoare.</p>{[...activePatientConversations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item) => <button type="button" key={item.id} aria-pressed={item.id === activeChat.id} onClick={() => { selectConversation(item); setPanel(null); }} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${item.id === activeChat.id ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10' : 'border-slate-200 hover:border-primary/20 hover:bg-slate-50'}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.id === activeChat.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}><CalendarDays size={20} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{item.is_direct ? 'Discuție directă' : item.consultation_request_id ? `Consultația #${item.consultation_request_id}` : 'Discuție generală'}</span><span className="mt-1 block text-xs text-slate-500">{dateOnly(item.created_at)}{!channelChat && ` · ${participantFor(item).name}`}</span></span>{item.id === activeChat.id ? <Check size={18} className="text-primary" /> : <ChevronRight size={18} className="text-slate-400" />}</button>)}</div>}
            {panel === 'details' && activeChat.consultation_request_id && <div className="space-y-6 p-5">
              <div className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-900"><Info size={16} className="mt-0.5 shrink-0" /><p>Chatul este pentru clarificări. Diagnosticul și recomandările medicului se găsesc în documentul PDF al consultației.</p></div>
              <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText size={17} className="text-primary" />Documente medicale</h3><ConsultationDocuments key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} /></section>
              <ConsultationAnamnesis key={`anamnesis-${activeChat.consultation_request_id}`} requestId={activeChat.consultation_request_id} />
              <HigoConsultationProposal key={`higo-${activeChat.consultation_request_id}`} requestId={activeChat.consultation_request_id} />
              <Button asChild variant="outline" className="w-full"><Link to={role === 'doctor' ? `/doctor/consultations?request=${activeChat.consultation_request_id}` : role === 'patient' ? `/patient/consultations` : `/operator/patients?request=${activeChat.consultation_request_id}`}><FileText size={17} />Deschide consultația<ChevronRight size={16} /></Link></Button>
            </div>}
          </SheetContent>
        </Sheet>
        <Dialog open={showChart} onOpenChange={setShowChart}><DialogContent className="max-h-[85vh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>Fișa pacientului</DialogTitle></DialogHeader>{activeChat.patient_profile_id && <ChatPatientRecord id={activeChat.patient_profile_id} name={activeChat.patient_profile?.display_name} />}</DialogContent></Dialog>

        {/* Mesajele */}
        <ScrollArea className="min-h-0 flex-1 bg-slate-50/60">
          <div className="flex flex-col px-3 py-4 sm:px-6">
            {activeChat.messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Niciun mesaj încă. Scrie primul mesaj mai jos.</p>}
            {activeChat.messages.map((message, index) => {
              const previous = activeChat.messages[index - 1];
              const next = activeChat.messages[index + 1];
              const isMine = currentUserId === Number(message.sender_id);
              const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
              const firstOfGroup = newDay || !previous || previous.sender_id !== message.sender_id || previous.type === 'system';
              const lastOfGroup = !next || next.sender_id !== message.sender_id || dayKey(next.created_at) !== dayKey(message.created_at) || next.type === 'system';
              return (
                <div key={message.id} className="flex flex-col">
                  {newDay && <div className="my-4 flex items-center gap-3 text-xs font-medium text-slate-400"><span className="h-px flex-1 bg-slate-200" />{dayLabel(message.created_at)}<span className="h-px flex-1 bg-slate-200" /></div>}
                  {message.type === 'system' ? (
                    <p className="mx-auto my-2 max-w-md rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-600">{message.body}</p>
                  ) : (
                    <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${isMine ? 'self-end items-end' : 'self-start items-start'} ${firstOfGroup ? 'mt-3' : 'mt-0.5'}`}>
                      {firstOfGroup && !isMine && message.sender?.name && <span className="mb-1 px-1 text-xs font-medium text-slate-500">{message.sender.name}</span>}
                      <div className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-relaxed shadow-sm ${isMine ? 'bg-primary text-white' : 'border border-slate-200 bg-white text-slate-800'} ${isMine ? (lastOfGroup ? 'rounded-2xl rounded-br-md' : 'rounded-2xl') : (lastOfGroup ? 'rounded-2xl rounded-bl-md' : 'rounded-2xl')}`}>
                        {message.type === 'image' && message.metadata?.url ? (
                          <a href={message.metadata.url} target="_blank" rel="noreferrer" className="block">
                            <img src={message.metadata.url} alt={message.metadata.file_name || 'Atașament'} className="max-h-64 rounded-xl object-cover" />
                            {message.body && <span className="mt-2 block text-sm">{message.body}</span>}
                          </a>
                        ) : message.type === 'file' && message.metadata?.url ? (
                          <a href={message.metadata.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline-offset-2 hover:underline">
                            <FileText className="h-5 w-5 shrink-0" />
                            <span className="min-w-0 break-all">{message.metadata.file_name || message.body}</span>
                          </a>
                        ) : (
                          message.body
                        )}
                      </div>
                      {lastOfGroup && <span className="mt-1 px-1 text-[11px] text-slate-400">{shortTime(message.created_at)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {typingName && (
              <div className="mt-3 self-start rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                {typingName} scrie…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Scrierea mesajului */}
        <div className="shrink-0 border-t border-slate-100 bg-white p-3 sm:p-4">
          {chat.can_write ? (
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isSending} className="shrink-0 text-slate-500 hover:text-primary" aria-label="Atașează un fișier" title="Atașează imagine, PDF sau document">
                <Paperclip className="h-5 w-5" />
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleAttachment} />
              <label htmlFor="chat-message" className="sr-only">Mesaj</label>
              <textarea
                id="chat-message"
                ref={composerRef}
                rows={1}
                value={newMessage}
                onChange={(event) => { handleTyping(event.target.value); autoGrow(event.target); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Scrie un mesaj…"
                className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] leading-5 outline-none transition placeholder:text-slate-400 focus-visible:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-primary/15"
              />
              <Button type="submit" size="icon" disabled={isSending || !newMessage.trim()} className="shrink-0" aria-label="Trimite mesajul">
                <Send className="h-5 w-5" />
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-1 text-center sm:flex-row">
              <p className="text-sm text-slate-500">{chat.message ?? 'Această conversație nu este activă.'}</p>
              {/* Reactivarea are sens doar după concluzie, cât timp fereastra e
                  deschisă — nu cât încă se așteaptă examinarea. */}
              {chat.can_reactivate && (
                <Button size="sm" onClick={reactivateChat}>
                  <CheckCircle2 className="h-4 w-4" />Reactivează chatul
                </Button>
              )}
            </div>
          )}
        </div>
        </div>
      </section>
    </div>
  );
}

function ChannelRow({ icon, active, unread = 0, disabled = false, detail, onClick, children }: { icon: React.ReactNode; active: boolean; unread?: number; disabled?: boolean; detail?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${active ? 'bg-white text-primary shadow-sm ring-1 ring-primary/20' : 'text-slate-700 hover:bg-white'}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-primary text-white' : 'bg-slate-200/70 text-slate-600'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${unread > 0 ? 'font-bold text-slate-950' : 'font-medium'}`}>{children}</span>
        {detail && <span className="block truncate text-xs text-slate-400">{detail}</span>}
      </span>
      {unread > 0 && <span aria-label={`${unread} mesaje necitite`} className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{unread}</span>}
    </button>
  );
}

function ChannelChip({ active, unread = 0, disabled = false, onClick, children }: { active: boolean; unread?: number; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition ${active ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
      {children}
      {unread > 0 && <span className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] ${active ? 'bg-white text-primary' : 'bg-primary text-white'}`}>{unread}</span>}
    </button>
  );
}

function initialsOf(name: string) {
  return name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';
}

const dayKey = (value: string) => new Date(value).toDateString();

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Azi';
  if (date.toDateString() === yesterday.toDateString()) return 'Ieri';
  return date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
}

function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

function autoGrow(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
}

function hasConversationTarget() {
  const params = new URLSearchParams(window.location.search);
  return ['conversation', 'request', 'doctor', 'operator', 'account', 'patient_profile'].some((key) => params.has(key));
}

function ChatPatientRecord({ id }: { id: number; name?: string }) {
  const [data, setData] = useState<React.ComponentProps<typeof PatientChart>['profile'] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<{ patient_profile: React.ComponentProps<typeof PatientChart>['profile'] }>(`/patient/profiles/${id}/medical-record`).then((response) => setData(response.patient_profile)).catch((err) => setError(err.message)); }, [id]);
  return error ? <p role="alert">{error}</p> : data ? <PatientChart profile={data} /> : <p>Se încarcă fișa…</p>;
}
