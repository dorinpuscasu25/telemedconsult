import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { CheckCircle2, FileText, Hash, MessageSquare, Paperclip, Search, Send, History, CalendarDays, ChevronRight, ChevronDown, Stethoscope, Info, Check } from 'lucide-react';
import { motion } from 'framer-motion';
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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from '../../components/ui/dropdown-menu';

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
  const activePeer = peers.find((peer) => peer.key === activePeerKey);
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
      <Card className="glass-card border-0 p-10 text-center">
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{loading ? 'Se încarcă conversațiile…' : emptyTitle}</h1>
        <Button variant="outline" onClick={() => setSearchParams({})}>Toate conversațiile</Button>
        <p className="text-slate-500">
          Conversațiile apar automat după crearea sau preluarea unei solicitări.
        </p>
      </Card>
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

  return (
    <div className={`${patientProfileId ? 'h-[600px]' : channelChat ? 'h-[calc(100dvh-10rem)] min-h-[480px] lg:h-[calc(100dvh-7.5rem)]' : 'h-[calc(100vh-8rem)]'} flex gap-3`}>
      {channelChat && <Card className="hidden w-64 shrink-0 flex-col overflow-hidden border border-slate-200/70 bg-white py-0 gap-0 lg:flex 2xl:w-80">
        <div className="border-b border-slate-200/50 p-4">
          <h2 className="text-lg font-bold text-slate-900">Chat</h2>
          <p className="mb-3 text-xs text-slate-500">{role === 'patient' ? 'Medici și operatori' : 'Titulari de cont'}</p>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input aria-label={role === 'patient' ? 'Caută un medic sau operator' : 'Caută titularul contului'} placeholder={role === 'patient' ? 'Caută un medic…' : 'Caută un utilizator…'} value={peerSearch} onChange={(event) => setPeerSearch(event.target.value)} className="pl-9" /></div>
        </div>
        <ScrollArea className="min-h-0 flex-1 p-2">
          {peers.filter((account) => account.name.toLocaleLowerCase('ro').includes(peerSearch.toLocaleLowerCase('ro'))).map((account) => {
            const lastMessage = account.latest.messages[account.latest.messages.length - 1];
            return <button key={account.key} onClick={() => selectPeer(account.key)} aria-pressed={activePeerKey === account.key} className={`mb-1 flex w-full items-center gap-3 rounded-xl border p-3 text-left ${activePeerKey === account.key ? 'border-blue-300 bg-blue-100 shadow-sm' : 'border-transparent hover:bg-slate-50/80'}`}>
              <Avatar className="h-10 w-10 shrink-0"><AvatarFallback>{account.name.charAt(0)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{account.name}</p><p className="truncate text-xs text-slate-500">{lastMessage?.type === 'image' ? 'Imagine atașată' : lastMessage?.type === 'file' ? 'Fișier atașat' : lastMessage?.body || 'Conversație nouă'}</p></div>
              {account.unread > 0 && <span aria-label={`${account.unread} mesaje necitite`} className="rounded-full bg-blue-600 px-2 text-xs text-white">{account.unread}</span>}
            </button>;
          })}
          {peerSearch && !peers.some((account) => account.name.toLocaleLowerCase('ro').includes(peerSearch.toLocaleLowerCase('ro'))) && <p className="p-3 text-sm text-slate-500">{role === 'patient' ? 'Niciun medic sau operator găsit.' : 'Niciun utilizator găsit.'}</p>}
        </ScrollArea>
      </Card>}
      <Card className="min-w-0 flex-1 border border-slate-200/70 bg-white py-0 gap-0 flex flex-col overflow-hidden relative">
        {channelChat && <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-white p-3 md:grid-cols-1 lg:hidden">
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="min-w-0 justify-between gap-2 rounded-xl px-3 text-slate-700" aria-label="Alege interlocutorul"><MessageSquare size={16} className="shrink-0 text-primary" /><span className="truncate">{activePeer?.name || activeParticipant.name}</span><ChevronDown size={14} className="shrink-0 text-slate-400" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-80 overflow-y-auto"><DropdownMenuLabel>{role === 'patient' ? 'Medici și operatori' : 'Titulari de cont'}</DropdownMenuLabel>{peers.map((account) => <DropdownMenuItem key={account.key} onSelect={() => selectPeer(account.key)}><span className="flex-1">{account.name}</span>{account.key === activePeerKey && <Check size={15} className="text-primary" />}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={openingDirect} className="min-w-0 justify-between gap-2 rounded-xl px-3 text-slate-700 md:hidden" aria-label="Alege pacientul"><Hash size={16} className="shrink-0 text-primary" /><span className="truncate">{activeChat.is_direct ? 'Discuție directă' : activeChat.patient_profile?.display_name || 'General'}</span><ChevronDown size={14} className="shrink-0 text-slate-400" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="max-h-80 overflow-y-auto"><DropdownMenuItem onSelect={() => void openDirectConversation()}><MessageSquare size={16} />Discuție directă</DropdownMenuItem><DropdownMenuLabel>Pacienți</DropdownMenuLabel>{patientGroups.map(([id, patient]) => <DropdownMenuItem key={id} onSelect={() => { const item = peerConversations.find((item) => item.patient_profile_id === id); if (item) selectConversation(item); }}><Hash size={16} /><span className="flex-1">{patient?.display_name || `Pacient ${id}`}</span>{id === activeChat.patient_profile_id && <Check size={15} className="text-primary" />}</DropdownMenuItem>)}{peerConversations.some((item) => !item.patient_profile_id && !item.is_direct) && <DropdownMenuItem onSelect={() => { const item = peerConversations.find((item) => !item.patient_profile_id && !item.is_direct); if (item) selectConversation(item); }}>General</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
        </div>}
        <div className="flex min-h-0 flex-1">
        {channelChat && <aside aria-label="Canale pacienți" className="hidden w-44 shrink-0 flex-col border-r border-slate-200/60 bg-slate-50/70 md:flex xl:w-52 2xl:w-60">
          <div className="p-2 pt-3"><button disabled={openingDirect} onClick={openDirectConversation} aria-pressed={Boolean(activeChat.is_direct)} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm font-medium ${activeChat.is_direct ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white'}`}><MessageSquare className="h-4 w-4 shrink-0" /><span className="flex-1">Discuție directă</span>{directUnread > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-xs text-white">{directUnread}</span>}</button></div>
          <h2 className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pacienți</h2>
          <ScrollArea className="min-h-0 flex-1 p-2">
            {patientGroups.map(([id, patient]) => {
              const patientConversations = peerConversations.filter((item) => item.patient_profile_id === id);
              const unread = patientConversations.reduce((total, item) => total + (item.unread_count || 0), 0);
              return <button key={id} onClick={() => selectConversation(patientConversations[0])} aria-pressed={activeChat.patient_profile_id === id} className={`mb-1 flex w-full items-start gap-2 rounded-xl border p-3 text-left ${activeChat.patient_profile_id === id ? 'border-blue-300 bg-blue-100 text-blue-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white'}`}>
                <Hash className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{patient?.display_name || `Pacient ${id}`}</span>{patient?.patient_code && <span className="text-xs text-slate-500">{patient.patient_code}</span>}</span>
                {unread > 0 && <span aria-label={`${unread} mesaje necitite`} className="rounded-full bg-blue-600 px-1.5 text-xs text-white">{unread}</span>}
              </button>;
            })}
            {peerConversations.some((item) => !item.patient_profile_id && !item.is_direct) && <button aria-pressed={!activeChat.patient_profile_id && !activeChat.is_direct} onClick={() => { const conversation = peerConversations.find((item) => !item.patient_profile_id && !item.is_direct); if (conversation) selectConversation(conversation); }} className={`flex w-full items-center gap-2 rounded-xl p-3 text-left text-sm ${!activeChat.patient_profile_id && !activeChat.is_direct ? 'bg-blue-100 text-blue-800' : 'text-slate-600 hover:bg-white'}`}><Hash className="h-4 w-4" />General</button>}
          </ScrollArea>
        </aside>}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!patientProfileId && !channelChat && <div className="flex flex-wrap gap-2 border-b p-3">
          {!patientProfileId && <select aria-label={channelChat ? 'Canal' : 'Pacient'} disabled={openingDirect} className={`max-w-full rounded-lg border p-2 text-sm ${channelChat ? 'md:hidden' : ''}`} value={channelChat ? (activeChat.is_direct ? 'direct' : activeChat.patient_profile_id || '') : requestedPatient || ''} onChange={(event) => {
            if (channelChat) {
              if (event.target.value === 'direct') { void openDirectConversation(); return; }
              const conversation = peerConversations.find((item) => !item.is_direct && Number(item.patient_profile_id || 0) === Number(event.target.value));
              if (conversation) selectConversation(conversation);
              return;
            }
            const next = new URLSearchParams(searchParams); next.delete('conversation'); next.delete('request');
            if (event.target.value) next.set('patient_profile', event.target.value); else next.delete('patient_profile');
            setSearchParams(next);
          }}>
            {channelChat ? <option value="direct">Discuție directă</option> : <option value="">Toți pacienții</option>}
            {channelChat && peerConversations.some((item) => !item.patient_profile_id && !item.is_direct) && <option value="">General</option>}
            {patientGroups.map(([id, patient]) => <option key={id} value={id ?? ''}>{patient?.display_name || `Pacient ${id}`}{patient?.patient_code ? ` · ${patient.patient_code}` : ''}</option>)}
          </select>}
          {!channelChat && !patientProfileId && <><Button variant="outline" size="sm" disabled={openingDirect} onClick={openDirectConversation}><MessageSquare className="mr-2 h-4 w-4" />Discuție directă</Button><Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>Toate conversațiile</Button></>}
        </div>
        }
        {error && <p role="alert" className="p-3 text-sm text-red-600">{error}</p>}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 bg-white px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-11 w-11 shrink-0 border border-indigo-100 bg-indigo-50 text-primary"><AvatarFallback>{(activeChat.patient_profile?.display_name || activeParticipant.name).charAt(0)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold leading-tight text-slate-900"><button type="button" className="text-left hover:text-primary" disabled={!activeChat.patient_profile_id} onClick={() => setShowChart(true)}>{activeChat.is_direct ? 'Discuție directă' : activeChat.patient_profile?.display_name || activeParticipant.name}</button></h3><Badge variant="outline" className={`${chatBadge.className} rounded-full text-[11px]`}>{chatBadge.label}</Badge></div>
              <p className="mt-1 text-xs text-slate-500">{role === 'patient' ? activeParticipant.name : `Răspunde: ${activeChat.patient?.name || activeParticipant.name}`}{activeChat.patient_profile?.patient_code && <span className="ml-2 hidden text-slate-400 sm:inline">· Cod {activeChat.patient_profile.patient_code}</span>}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {activePatientConversations.length > 1 && <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-slate-600" onClick={() => setPanel('history')}><History size={17} /><span>Consultații</span><span className="rounded-md bg-slate-100 px-1.5 text-xs">{activePatientConversations.length}</span></Button>}
            {activeChat.patient_profile_id && <Button variant="ghost" size="sm" className="gap-2 rounded-xl text-slate-600" onClick={() => setShowChart(true)}><Stethoscope size={17} /><span className="hidden sm:inline">Fișa pacientului</span><span className="sr-only sm:hidden">Fișa pacientului</span></Button>}
            {activeChat.consultation_request_id && <Button variant="outline" size="sm" className="gap-2 rounded-xl border-indigo-100 text-primary" onClick={() => setPanel('details')}><FileText size={17} />Consultația</Button>}
          </div>
        </div>
        {activeChat.consultation_request_id && <ConsultationChatNavigation key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} onRefresh={loadConversations} />}
        <Sheet open={panel !== null} onOpenChange={(open) => { if (!open) setPanel(null); }}>
          <SheetContent className="w-[min(28rem,100%)] gap-0" aria-describedby="chat-panel-description">
            <SheetHeader className="border-b border-slate-100 pr-14">
              <SheetTitle>{panel === 'history' ? 'Consultațiile pacientului' : 'Detalii consultație'}</SheetTitle>
              <SheetDescription id="chat-panel-description">{activeChat.patient_profile?.display_name || activeParticipant.name}{panel === 'details' && ` · Consultație #${activeChat.consultation_request_id}`}</SheetDescription>
            </SheetHeader>
            {panel === 'history' && <div className="space-y-2 p-4"><p className="mb-4 text-xs text-slate-500">Alege consultația pentru a vedea discuția corespunzătoare.</p>{[...activePatientConversations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item) => <button type="button" key={item.id} aria-pressed={item.id === activeChat.id} onClick={() => { selectConversation(item); setPanel(null); }} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${item.id === activeChat.id ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10' : 'border-slate-200 hover:border-primary/20 hover:bg-slate-50'}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${item.id === activeChat.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}><CalendarDays size={20} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{item.is_direct ? 'Discuție directă' : item.consultation_request_id ? `Consultație #${item.consultation_request_id}` : 'Discuție generală'}</span><span className="mt-1 block text-xs text-slate-500">{dateOnly(item.created_at)}{!channelChat && ` · ${participantFor(item).name}`}</span></span>{item.id === activeChat.id ? <Check size={18} className="text-primary" /> : <ChevronRight size={18} className="text-slate-400" />}</button>)}</div>}
            {panel === 'details' && activeChat.consultation_request_id && <div className="space-y-6 p-5">
              <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-500"><Info size={16} className="mt-0.5 shrink-0 text-primary" /><p>Chatul este pentru clarificări. Diagnosticul și recomandările medicului se găsesc în consultația PDF.</p></div>
              <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileText size={17} className="text-primary" />Documente medicale</h3><ConsultationDocuments key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} /></section>
              <ConsultationAnamnesis key={`anamnesis-${activeChat.consultation_request_id}`} requestId={activeChat.consultation_request_id} />
              <HigoConsultationProposal key={`higo-${activeChat.consultation_request_id}`} requestId={activeChat.consultation_request_id} />
              <Button asChild variant="outline" className="w-full gap-2 rounded-xl"><Link to={role === 'doctor' ? `/doctor/consultations?request=${activeChat.consultation_request_id}` : role === 'patient' ? `/patient/profile?patient_profile=${activeChat.patient_profile_id}&section=consultations&request=${activeChat.consultation_request_id}` : `/operator/patients?request=${activeChat.consultation_request_id}`}><FileText size={17} />Deschide consultația<ChevronRight size={16} /></Link></Button>
            </div>}
          </SheetContent>
        </Sheet>
        <Dialog open={showChart} onOpenChange={setShowChart}><DialogContent className="max-h-[85vh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>Fișa pacientului</DialogTitle></DialogHeader>{activeChat.patient_profile_id && <ChatPatientRecord id={activeChat.patient_profile_id} name={activeChat.patient_profile?.display_name} />}</DialogContent></Dialog>
        <ScrollArea className="min-h-0 flex-1 p-4 sm:p-6 bg-slate-50/50">
          <div className="space-y-6 flex flex-col">
            {activeChat.messages.map((message) => {
              const isMine = currentUserId === message.sender_id;
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col max-w-[75%] ${isMine ? 'self-end items-end' : 'self-start items-start'}`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl shadow-sm whitespace-pre-wrap ${isMine ? 'bg-gradient-to-br from-primary to-purple-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-slate-100'}`}>
                    {message.type === 'image' && message.metadata?.url ? (
                      <a href={message.metadata.url} target="_blank" rel="noreferrer" className="block">
                        <img src={message.metadata.url} alt={message.metadata.file_name || 'Atașament'} className="max-h-64 rounded-xl object-cover" />
                        <span className="mt-2 block text-sm">{message.body}</span>
                      </a>
                    ) : message.type === 'file' && message.metadata?.url ? (
                      <a href={message.metadata.url} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        <span>{message.metadata.file_name || message.body}</span>
                      </a>
                    ) : (
                      message.body
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">
                    {new Date(message.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </motion.div>
              );
            })}
            {typingName && (
              <div className="self-start rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                {typingName} scrie...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-4 bg-white/60 backdrop-blur-md border-t border-slate-200/50 shrink-0">
          {chat.can_write ? (
            <form onSubmit={handleSend} className="flex items-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-slate-500 hover:text-primary rounded-xl h-12 w-12">
                <Paperclip className="h-5 w-5" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={handleAttachment}
              />
              <Input
                value={newMessage}
                onChange={(event) => handleTyping(event.target.value)}
                placeholder="Scrieți un mesaj..."
                className="flex-1 rounded-xl border-slate-200 bg-white/80 h-12"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSending}
                className="shrink-0 rounded-xl bg-gradient-to-r from-primary to-purple-600 border-0 h-12 w-12 shadow-md shadow-primary/20">
                <Send className="h-5 w-5" />
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center p-2 text-center">
              <p className="mb-3 text-sm text-slate-500">
                {chat.message ?? 'Această conversație nu este activă.'}
              </p>
              {/* Reactivarea are sens doar după concluzie, cât timp fereastra e
                  deschisă — nu cât încă se așteaptă examinarea. */}
              {chat.can_reactivate && (
                <Button className="rounded-xl bg-slate-900 text-white" onClick={reactivateChat}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Reactivează chat
                </Button>
              )}
            </div>
          )}
        </div>
        </div>
        </div>
      </Card>
    </div>
  );
}

function ChatPatientRecord({ id }: { id: number; name?: string }) {
  const [data, setData] = useState<React.ComponentProps<typeof PatientChart>['profile'] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiRequest<{ patient_profile: React.ComponentProps<typeof PatientChart>['profile'] }>(`/patient/profiles/${id}/medical-record`).then((response) => setData(response.patient_profile)).catch((err) => setError(err.message)); }, [id]);
  return error ? <p role="alert">{error}</p> : data ? <PatientChart profile={data} /> : <p>Se încarcă fișa…</p>;
}
