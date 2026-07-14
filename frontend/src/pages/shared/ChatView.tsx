import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { CheckCircle2, Clock, FileText, Paperclip, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiRequest } from '../../lib/api';
import { getEcho } from '../../lib/realtime';
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

interface Conversation {
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

export function ChatView({ emptyTitle = 'Nu ai conversații încă' }: { emptyTitle?: string }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
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
    setConversations((current) => {
      const exists = current.some((conversation) => conversation.id === nextConversation.id);
      const nextList = exists
        ? current.map((conversation) => conversation.id === nextConversation.id ? nextConversation : conversation)
        : [nextConversation, ...current];

      return [...nextList].sort((first, second) => {
        const firstMessage = first.messages[first.messages.length - 1];
        const secondMessage = second.messages[second.messages.length - 1];
        return new Date(secondMessage?.created_at || second.created_at).getTime() - new Date(firstMessage?.created_at || first.created_at).getTime();
      });
    });
    setActiveId((current) => current ?? nextConversation.id);
  }, []);

  const appendMessage = useCallback((conversationId: number, message: Message) => {
    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;

      const messageExists = conversation.messages.some((item) => item.id === message.id);
      if (messageExists) return conversation;

      return {
        ...conversation,
        messages: [...conversation.messages, message]
      };
    }));
  }, []);

  const loadConversations = useCallback(() => {
    apiRequest<{data: Conversation[]}>('/conversations').then((response) => {
      setConversations(response.data);
      setActiveId((current) => {
        const requestedId = Number(searchParams.get('conversation'));
        if (requestedId && response.data.some((conversation) => conversation.id === requestedId)) {
          return requestedId;
        }

        return current ?? response.data[0]?.id ?? null;
      });
    });
  }, [searchParams]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const activeChat = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || conversations[0],
    [conversations, activeId]
  );

  const currentUserId = user ? Number(user.id) : null;

  useEffect(() => {
    window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50);
  }, [activeChat?.id, activeChat?.messages.length]);

  useEffect(() => {
    const echo = getEcho();
    if (!echo || !currentUserId) return;

    const userChannelName = `App.Models.User.${currentUserId}`;
    if (!subscribedChannels.current.has(userChannelName)) {
      echo.private(userChannelName)
        .listen('.conversation.updated', (event: { conversation: Conversation }) => {
          upsertConversation(event.conversation);
        })
        .listen('.conversation.message.sent', (event: { conversation_id: number; message: Message }) => {
          appendMessage(Number(event.conversation_id), event.message);
        });
      subscribedChannels.current.add(userChannelName);
    }

    return () => {
      echo.leave(userChannelName);
      subscribedChannels.current.delete(userChannelName);
    };
  }, [appendMessage, currentUserId, upsertConversation]);

  useEffect(() => {
    const echo = getEcho();
    if (!echo) return;

    conversations.forEach((conversation) => {
      const channelName = `conversation.${conversation.id}`;
      if (subscribedChannels.current.has(channelName)) return;

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
      subscribedChannels.current.add(channelName);
    });

    return () => {
      conversations.forEach((conversation) => {
        const channelName = `conversation.${conversation.id}`;
        echo.leave(channelName);
        subscribedChannels.current.delete(channelName);
      });
    };
  }, [appendMessage, conversations, upsertConversation]);

  const participantFor = (conversation: Conversation): Participant => {
    if (currentUserId && conversation.patient_id !== currentUserId && conversation.patient) {
      return { ...conversation.patient, role: 'Pacient' };
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
    } finally {
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
    } finally {
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
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{emptyTitle}</h1>
        <p className="text-slate-500">
          Conversațiile apar automat după crearea sau preluarea unei solicitări.
        </p>
      </Card>
    );
  }

  const activeParticipant = participantFor(activeChat);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      <Card className="w-80 glass-card border-0 hidden md:flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200/50 bg-white/50">
          <h2 className="font-bold text-lg text-slate-900">Conversații</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => {
              const participant = participantFor(conversation);
              const lastMessage = conversation.messages[conversation.messages.length - 1];
              return (
                <button
                  key={conversation.id}
                  onClick={() => setActiveId(conversation.id)}
                  className={`w-full flex items-start p-3 rounded-xl transition-all text-left ${activeChat.id === conversation.id ? 'bg-primary/10' : 'hover:bg-slate-50/80'}`}>
                  <div className="relative">
                    <Avatar className="h-12 w-12 border border-white shadow-sm">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.email}`} />
                      <AvatarFallback>{participant.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {conversation.status === 'open' && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />}
                  </div>
                  <div className="ml-3 flex-1 overflow-hidden">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-semibold text-slate-900 truncate">{participant.name}</span>
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

      <Card className="flex-1 glass-card border-0 flex flex-col overflow-hidden relative">
        <div className="h-16 border-b border-slate-200/50 bg-white/60 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center">
            <Avatar className="h-10 w-10 border border-white shadow-sm mr-3">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeParticipant.email}`} />
              <AvatarFallback>{activeParticipant.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-bold text-slate-900 leading-tight">{activeParticipant.name}</h3>
              <p className="text-xs text-primary font-medium">{activeParticipant.role}</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={activeChat.status === 'open' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
            <Clock className="w-3 h-3 mr-1" /> {activeChat.status === 'open' ? 'Activ' : 'Închis'}
          </Badge>
        </div>

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
          {activeChat.status === 'open' ? (
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
              <p className="text-sm text-slate-500 mb-3">Această conversație nu este activă.</p>
              <Button className="rounded-xl bg-slate-900 text-white" onClick={reactivateChat} disabled={!activeChat.consultation_request_id && !activeChat.consultation_request?.id}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Reactivează chat
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
