import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';
import { dateTime } from '../lib/format';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';

type Room = { id: number; target: { id: number; name: string }; unread_count: number };
type Message = { id: number; sender: { id: number; name: string }; sender_is_admin: boolean; body: string | null; created_at: string; read_at: string | null; attachments: Array<{ name: string; url: string; size: number }> };

export function AdministrativeMessagesPage() {
  const { role } = useAuth();
  const admin = role === 'admin';
  const [params, setParams] = useSearchParams();
  const conversationId = Number(params.get('conversation')) || 0;
  const targetId = Number(params.get('target')) || 0;
  const [selected, setSelected] = useState(conversationId);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomPage, setRoomPage] = useState(1);
  const [roomLast, setRoomLast] = useState(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useRef({ selected, page, roomPage });
  const roomRequest = useRef(0);
  const messageRequest = useRef(0);
  current.current = { selected, page, roomPage };

  useEffect(() => { if (!targetId) setSelected(conversationId); }, [conversationId, targetId]);
  useEffect(() => {
    setBody(''); setFiles([]); setMessages([]); setTitle(''); setPage(1); setNotice(''); setError('');
    if (fileInput.current) fileInput.current.value = '';
  }, [selected]);
  useEffect(() => { setMessages([]); }, [page]);

  const loadRooms = useCallback(async () => {
    const requestId = ++roomRequest.current;
    const response = await apiRequest<{ data: Room[]; last_page: number }>(`/administrative-conversations?page=${roomPage}`);
    if (current.current.roomPage !== roomPage || requestId !== roomRequest.current) return;
    setRooms(response.data); setRoomLast(response.last_page); setLoaded(true);
  }, [roomPage]);

  const loadMessages = useCallback(async (id: number, messagePage: number) => {
    const requestId = ++messageRequest.current;
    const response = await apiRequest<{ conversation: Room; messages: { data: Message[]; last_page: number } }>(`/administrative-conversations/${id}?page=${messagePage}`);
    if (current.current.selected !== id || current.current.page !== messagePage || requestId !== messageRequest.current) return;
    setTitle(admin ? response.conversation.target.name : 'Echipa de administrare');
    setMessages(response.messages.data.slice().reverse()); setLast(response.messages.last_page);
  }, [admin]);

  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      const outcomes: PromiseSettledResult<void>[] = await Promise.allSettled(selected ? [loadMessages(selected, page)] : []);
      outcomes.push(...await Promise.allSettled([loadRooms()]));
      if (!cancelled) setRefreshError(outcomes.some((outcome) => outcome.status === 'rejected') ? 'Conversațiile nu au putut fi actualizate. Reîncercăm automat.' : '');
      fetching = false;
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [loadRooms, loadMessages, selected, page]);

  useEffect(() => {
    if (admin || selected || !rooms.length) return;
    setSelected(rooms[0].id); setParams({ conversation: String(rooms[0].id) }, { replace: true });
  }, [admin, selected, rooms, setParams]);

  useEffect(() => {
    if (!admin || !targetId) return;
    let cancelled = false;
    apiRequest<{ id: number }>('/administrative-conversations', { method: 'POST', body: JSON.stringify({ target_id: targetId }) })
      .then((response) => {
        if (cancelled) return;
        setSelected(response.id); setParams({ conversation: String(response.id) }, { replace: true });
        void loadRooms().catch(() => setRefreshError('Lista conversațiilor nu a putut fi actualizată.'));
      }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Conversația nu a putut fi deschisă.'); });
    return () => { cancelled = true; };
  }, [admin, targetId, setParams, loadRooms]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !selected) return;
    const id = selected;
    setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData(); form.append('body', body);
      files.forEach((file) => form.append('attachments[]', file));
      await apiRequest(`/administrative-conversations/${id}/messages`, { method: 'POST', body: form });
      if (current.current.selected !== id) return;
      setBody(''); setFiles([]); setPage(1); setNotice('Mesajul a fost trimis.');
      if (fileInput.current) fileInput.current.value = '';
      const outcomes = await Promise.allSettled([loadMessages(id, 1)]);
      outcomes.push(...await Promise.allSettled([loadRooms()]));
      setRefreshError(outcomes.some((outcome) => outcome.status === 'rejected') ? 'Mesajul a fost trimis, dar conversația nu a putut fi actualizată. Reîncercăm automat.' : '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Nu am primit confirmarea trimiterii. Verifică conversația înainte de a reîncerca.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">Mesaje {admin ? 'administrative' : 'cu administratorul'}</h1>
    <p className="text-sm text-slate-500">Corespondență administrativă separată de consultațiile medicale.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {refreshError && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{refreshError}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2 rounded-2xl border bg-white p-3">
        {rooms.map((room) => <button key={room.id} disabled={busy} onClick={() => { setSelected(room.id); setPage(1); setParams({ conversation: String(room.id) }); }} className={`flex w-full justify-between gap-2 rounded-xl p-3 text-left text-sm ${selected === room.id ? 'bg-blue-50 font-semibold text-blue-800' : 'bg-slate-50'}`}>
          {admin ? room.target.name : 'Echipa de administrare'}{room.unread_count > 0 && <span className="rounded-full bg-blue-600 px-2 text-white">{room.unread_count}</span>}
        </button>)}
        {!loaded && !refreshError && <p role="status" className="p-3 text-sm text-slate-500">Se încarcă conversațiile…</p>}
        {loaded && !rooms.length && <p className="p-3 text-sm text-slate-500">Nu ai conversații administrative încă.{admin ? ' Deschide un utilizator și alege „Trimite mesaj”.' : ''}</p>}
        {roomLast > 1 && <div className="flex gap-2"><Button variant="outline" disabled={busy || roomPage === 1} onClick={() => setRoomPage(roomPage - 1)}>Înapoi</Button><Button variant="outline" disabled={busy || roomPage === roomLast} onClick={() => setRoomPage(roomPage + 1)}>Înainte</Button></div>}
      </aside>
      <section className="min-w-0 space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
        {selected ? <>
          <h2 className="font-semibold">{title || 'Conversație administrativă'}</h2>
          <div className="flex gap-2 text-sm"><Button variant="outline" disabled={busy || page === last} onClick={() => setPage(page + 1)}>Mai vechi</Button><span className="self-center">{page}/{last}</span><Button variant="outline" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Mai noi</Button></div>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto">
            {messages.map((message) => <article key={message.id} className={`rounded-xl p-4 ${message.sender_is_admin ? 'bg-blue-50' : 'bg-slate-50'}`}>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><strong>{message.sender.name}</strong><span>{dateTime(message.created_at)}</span></div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{message.body}</p>
              {message.attachments.map((file) => <a key={file.url} href={file.url} className="mt-2 block break-all text-sm text-blue-700 underline" target="_blank" rel="noreferrer">{file.name} · {Math.ceil(file.size / 1024)} KB</a>)}
              {message.read_at && <p className="mt-2 text-xs text-slate-500">Citit</p>}
            </article>)}
          </div>
          <form onSubmit={send} className="space-y-3 border-t pt-4">
            <label className="block text-sm font-medium" htmlFor="administrative-body">Mesaj</label>
            <Textarea id="administrative-body" disabled={busy} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Scrie mesajul…" />
            <input ref={fileInput} disabled={busy} aria-label="Atașamente administrative" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" onChange={(event) => {
              const next = Array.from(event.target.files ?? []);
              if (next.length > 5 || next.some((file) => file.size > 10 * 1024 * 1024)) { setFiles([]); setError('Alege cel mult 5 fișiere, de maximum 10 MB fiecare.'); event.target.value = ''; return; }
              setError(''); setFiles(next);
            }} className="sr-only" />
            <div className="flex flex-wrap items-center gap-2"><Button type="button" disabled={busy} variant="outline" onClick={() => fileInput.current?.click()}>Adaugă fișiere</Button><span className="text-xs text-slate-500">{files.length ? files.map((file) => file.name).join(', ') : 'Niciun fișier selectat'}</span></div>
            <p className="text-xs text-slate-500">Maximum 5 fișiere, 10 MB fiecare. PDF, imagini sau DOCX.</p>
            <Button disabled={busy || (!body.trim() && !files.length)}>{busy ? 'Se trimite…' : 'Trimite mesajul'}</Button>
          </form>
        </> : <p className="text-sm text-slate-500">Alege o conversație.</p>}
      </section>
    </div>
  </div>;
}
