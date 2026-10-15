import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { CheckCircle2, Clock, FileText, Paperclip, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiRequest } from '../../lib/api';
import { getEcho } from '../../lib/realtime';
import { ConsultationVideoButton } from '../../components/ConsultationVideoButton';
import { PatientChart } from '../../components/PatientChart';
import { ConsultationAnamnesis } from '../../components/ConsultationAnamnesis';
import { HigoConsultationProposal } from '../../components/HigoConsultationProposal';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { useAuth } from '../../contexts/AuthContext';

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

export function ChatView({ emptyTitle = 'Nu ai conversații încă', patientProfileId }: { emptyTitle?: string; patientProfileId?: number }) {
  const { user, role } = useAuth();
  const currentUserId = user ? Number(user.id) : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [showChart, setShowChart] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [typingName, setTypingName] = useState('');
  const [isSending, setIsSending] = useState(false);
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
  const filteredConversations = useMemo(() => conversations.filter((item) =>
    (!requestedPatient || Number(item.patient_profile_id) === requestedPatient) &&
    (!requestedAccount || item.patient_id === requestedAccount) &&
    (!requestedDoctor || item.doctor_id === requestedDoctor)), [conversations, requestedPatient, requestedAccount, requestedDoctor]);
  const activeChat = filteredConversations.find((item) => item.id === activeId) || filteredConversations[0];
  const patientGroups = Array.from(new Map(conversations.filter((item) => !requestedAccount || item.patient_id === requestedAccount).filter((item) => !requestedDoctor || item.doctor_id === requestedDoctor).map((item) => [item.patient_profile_id, item.patient_profile])).entries()).filter(([id]) => id);
  const counterparts = Array.from(new Map(conversations.map((item) => currentUserId === item.patient_id ? [item.doctor_id, item.doctor] : [item.patient_id, item.patient])).entries()).filter(([id]) => id);
  const selectConversation = (conversation: Conversation) => {
    const next = new URLSearchParams(searchParams);
    next.set('conversation', String(conversation.id));
    if (conversation.patient_profile_id) next.set('patient_profile', String(conversation.patient_profile_id));
    setSearchParams(next); setActiveId(conversation.id); setError('');
  };
  const readConversationId = activeChat?.id;
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
    <div className={`${patientProfileId ? 'h-[600px]' : 'h-[calc(100vh-8rem)]'} flex gap-6`}>
      <Card className={`${patientProfileId ? '!hidden' : ''} w-80 glass-card border-0 hidden md:flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-slate-200/50 bg-white/50">
          <h2 className="font-bold text-lg text-slate-900">Conversații pe pacienți</h2>
          <div className="mt-2 space-y-1">{counterparts.map(([id, counterpart]) => <button key={id} className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-blue-50" onClick={() => { const next = new URLSearchParams(); next.set(role === 'patient' ? 'doctor' : 'account', String(id)); setSearchParams(next); }}>{counterpart?.name}</button>)}</div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.map((conversation) => {
              const participant = participantFor(conversation);
              const lastMessage = conversation.messages[conversation.messages.length - 1];
              return (
                <button
                  key={conversation.id}
                  onClick={() => selectConversation(conversation)}
                  className={`w-full flex items-start p-3 rounded-xl transition-all text-left ${activeChat.id === conversation.id ? 'bg-primary/10' : 'hover:bg-slate-50/80'}`}>
                  <div className="relative">
                    <Avatar className="h-12 w-12 border border-white shadow-sm">
                      <AvatarFallback>{participant.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {(conversation.chat?.can_write ?? conversation.status === 'open') && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />}
                  </div>
                  <div className="ml-3 flex-1 overflow-hidden">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-semibold text-slate-900 truncate">{conversation.patient_profile?.display_name || participant.name}{Boolean(conversation.unread_count) && <span className="ml-1 rounded-full bg-blue-600 px-2 text-xs text-white">{conversation.unread_count}</span>}</span>
                      <span className="text-xs text-slate-500">
                        {lastMessage ? new Date(lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <span className="text-sm text-slate-500 truncate block pr-2">
                      {lastMessage?.type === 'image' ? 'Imagine atașată' : lastMessage?.type === 'file' ? 'Fișier atașat' : lastMessage?.body || 'Conversație nouă'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </Card>

      <Card className="min-w-0 flex-1 glass-card border-0 flex flex-col overflow-hidden relative">
        <div className="flex flex-wrap gap-2 border-b p-3">
          {!patientProfileId && <select aria-label="Pacient" className="max-w-full rounded-lg border p-2 text-sm" value={requestedPatient || ''} onChange={(event) => { const next = new URLSearchParams(searchParams); next.delete('conversation'); next.delete('request'); if (event.target.value) next.set('patient_profile', event.target.value); else next.delete('patient_profile'); setSearchParams(next); }}><option value="">Toți pacienții</option>{patientGroups.map(([id, patient]) => <option key={id} value={id ?? ''}>{patient?.display_name || `Pacient ${id}`} · {patient?.patient_code}</option>)}</select>}
          <select aria-label="Conversație" className="max-w-full rounded-lg border p-2 text-sm" value={activeChat.id} onChange={(event) => { const item = conversations.find((item) => item.id === Number(event.target.value)); if (item) selectConversation(item); }}>{filteredConversations.map((item) => <option key={item.id} value={item.id}>{participantFor(item).name} · Consultație #{item.consultation_request_id} · {new Date(item.created_at).toLocaleDateString('ro-RO')}</option>)}</select>
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>Toate conversațiile</Button>
        </div>
        {error && <p role="alert" className="p-3 text-sm text-red-600">{error}</p>}
        <div className="min-h-16 gap-2 flex-wrap py-2 border-b border-slate-200/50 bg-white/60 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center">
            <Avatar className="h-10 w-10 border border-white shadow-sm mr-3">
              <AvatarFallback>{activeParticipant.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">{activeChat.patient_profile?.display_name || activeParticipant.name}{activeChat.patient_profile?.patient_code && ` · ${activeChat.patient_profile.patient_code}`}</h3>
              <p className="text-xs text-primary font-medium">{activeParticipant.name} · {activeParticipant.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          {role === 'patient' && activeChat.patient_profile_id && <Button asChild variant="outline" size="sm"><Link to={`/patient/profile?patient_profile=${activeChat.patient_profile_id}`}>Fișa pacientului</Link></Button>}
          {role !== 'patient' && activeChat.patient_profile_id && <Button variant="outline" size="sm" onClick={() => setShowChart(true)}>Fișa pacientului</Button>}
          {role === 'doctor' && activeChat.consultation_request_id && <Button asChild variant="outline" size="sm"><Link to={`/doctor/consultations?request=${activeChat.consultation_request_id}`}>Consultație</Link></Button>}
          {activeChat.consultation_request_id && <ConsultationVideoButton key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} />}
          <Badge variant="outline" className={chatBadge.className}>
            <Clock className="w-3 h-3 mr-1" /> {chatBadge.label}
          </Badge>
          </div>
        </div>

        {activeChat.consultation_request_id && <div className="px-3 pt-2"><ConsultationAnamnesis key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} /></div>}
        {activeChat.consultation_request_id && <div className="px-3 pt-2"><HigoConsultationProposal key={activeChat.consultation_request_id} requestId={activeChat.consultation_request_id} /></div>}
        {activeChat.consultation_request_id && <details className="border-b p-3"><summary className="cursor-pointer text-sm font-medium">Documentele consultației</summary><ConsultationDocuments requestId={activeChat.consultation_request_id} /></details>}
        <Dialog open={showChart} onOpenChange={setShowChart}><DialogContent className="max-h-[85vh] max-w-3xl overflow-auto"><DialogHeader><DialogTitle>Fișa pacientului</DialogTitle></DialogHeader>{activeChat.patient_profile_id && <ChatPatientRecord id={activeChat.patient_profile_id} name={activeChat.patient_profile?.display_name} />}</DialogContent></Dialog>
        <ScrollArea className="flex-1 p-6 bg-slate-50/30">
          <div className="space-y-6 flex flex-col">
            <div className="text-center my-4">
              <span className="text-xs font-medium text-slate-400 bg-white/80 px-3 py-1 rounded-full shadow-sm">
                Conversație creată în platformă
              </span>
            </div>

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
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
