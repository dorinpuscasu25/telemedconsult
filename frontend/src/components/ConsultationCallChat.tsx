import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import type { VideoContext } from '../lib/consultation-video';
import { Button } from './ui/button';
import { Input } from './ui/input';

type CallMessage = { id: number; body: string; sender_id: number; sender_name: string | null; type: string; metadata?: { url?: string; file_name?: string }; created_at: string };
type CallChat = { messages: CallMessage[]; chat: { can_write: boolean; message: string | null } };

export function ConsultationCallChat({ context, onClose }: { context: VideoContext; onClose: () => void }) {
  const [data, setData] = useState<CallChat | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const load = async () => {
    const response = await apiRequest<{ data: CallChat }>(`/conversations/${context.conversation_id}`);
    return response.data;
  };
  useEffect(() => {
    if (!context.conversation_id) return;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try { const next = await load(); if (!cancelled) { setData(next); setError(''); } }
      catch { if (!cancelled) setError('Nu am putut actualiza mesajele. Încercăm din nou.'); }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [context.conversation_id]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [data?.messages.length]);

  return <aside className="flex min-h-0 min-w-0 flex-col border-l border-slate-200 bg-white p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Chatul consultației</h2><button onClick={onClose} aria-label="Închide mesajele" className="text-sm text-primary">Închide</button></div>
    <p className="mb-3 text-xs text-slate-500">Mesajele se păstrează în istoricul consultației.</p>
    {!context.conversation_id ? <p className="text-sm text-slate-500">Chatul va fi disponibil când începe consultația.</p> : <>
      <div ref={log} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
        {!data && !error && <p className="text-sm text-slate-500">Se încarcă mesajele...</p>}
        {data?.messages.map((message) => <div key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="mb-1 text-xs font-semibold text-primary">{context.participants.find((person) => person.id === message.sender_id)?.name || message.sender_name || 'Echipa medicală'}</p><p className="whitespace-pre-wrap break-words text-slate-700">{message.body}</p>
          {message.metadata?.url && /^(https?:\/\/|\/)/.test(message.metadata.url) && <a className="mt-1 inline-block text-primary underline" href={message.metadata.url} target="_blank" rel="noreferrer">{message.metadata.file_name || 'Deschide documentul'}</a>}
          <time className="mt-1 block text-[10px] text-slate-400">{new Date(message.created_at).toLocaleTimeString('ro-MD', { hour: '2-digit', minute: '2-digit' })}</time></div>)}
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {data?.chat.can_write ? <form className="mt-3 flex gap-2" onSubmit={async (event) => {
        event.preventDefault(); if (!draft.trim() || sending) return;
        setSending(true); setError('');
        try { await apiRequest(`/conversations/${context.conversation_id}/messages`, { method: 'POST', body: JSON.stringify({ body: draft.trim() }) }); setDraft(''); }
        catch (err) { setError(err instanceof Error ? err.message : 'Mesajul nu a fost trimis.'); }
        finally { setSending(false); }
        try { setData(await load()); } catch { /* Keep draft/error state if refresh fails. */ }
      }}><Input aria-label="Mesaj în consultație" placeholder="Scrie un mesaj..." value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} disabled={sending} /><Button disabled={sending || !draft.trim()} type="submit">Trimite</Button></form>
        : data && <p className="mt-3 text-xs text-slate-500">{data.chat.message || 'Chatul nu este activ încă.'}</p>}
    </>}
  </aside>;
}
