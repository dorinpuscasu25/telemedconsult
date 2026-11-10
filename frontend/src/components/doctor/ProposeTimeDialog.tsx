import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { cn } from '../ui/utils';
import { apiRequest } from '../../lib/api';
import { whenLabel, type Proposal, type RequestService, type Stage } from '../../lib/doctor';

interface SlotDay { date: string; slots: Array<{ starts_at: string; time: string; taken?: boolean }> }

export interface ProposableRequest {
  id: string;
  stage: Stage;
  scheduled_at?: string | null;
  service?: RequestService;
  proposal?: Proposal | null;
}

const DOW = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
const key = (value: string) => new Date(value).getTime();

/** 24 h, dar cel târziu cu 2 h înainte de prima oră propusă — ca pe server. */
function deadlineFor(selected: number[]) {
  const first = Math.min(...selected);
  return new Date(Math.max(Math.min(Date.now() + 864e5, first - 72e5), Date.now() + 15 * 60000)).toISOString();
}

/**
 * P1a · propunerea de ore: medicul alege până la trei ore libere din programul
 * lui. Ora cerută (sau cea confirmată, la reprogramare) e marcată punctat.
 */
export function ProposeTimeDialog({ request, open, onOpenChange, onSent }: {
  request: ProposableRequest | null; open: boolean; onOpenChange: (open: boolean) => void; onSent: () => void;
}) {
  const [days, setDays] = useState<SlotDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const reschedule = request?.stage === 'conf' || Boolean(request?.stage === 'prop' && request.proposal?.is_reschedule) || Boolean(request?.stage === 'ask' && request.proposal?.is_reschedule);
  const original = request?.scheduled_at ? key(request.scheduled_at) : null;

  useEffect(() => {
    if (!open || !request) return;
    setSelected(request.stage === 'prop' ? (request.proposal?.slots ?? []).map(key).filter((value) => value > Date.now()) : []);
    setNote('');
    setError('');
    setLoading(true);
    apiRequest<{ days: SlotDay[] }>(`/doctor/slots?days=8&ignore=${request.id}`)
      .then((response) => {
        const list = response.days ?? [];
        // Azi apare doar dacă mai are ore; apoi șapte zile.
        const start = list[0] && list[0].slots.length === 0 ? 1 : 0;
        const week = list.slice(start, start + 7);
        setDays(week);
        const firstWorking = week.findIndex((day) => day.slots.some((slot) => !slot.taken));
        setDayIndex(firstWorking >= 0 ? firstWorking : 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca programul.'))
      .finally(() => setLoading(false));
  }, [open, request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const day = days[dayIndex];
  const chosen = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);
  const toggle = (value: number) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : current.length < 3 ? [...current, value] : current);

  const send = async () => {
    if (!request || !chosen.length) return;
    setSending(true);
    setError('');
    try {
      await apiRequest(`/requests/${request.id}/propose-time`, { method: 'POST', body: JSON.stringify({ slots: chosen.map((value) => new Date(value).toISOString()), note: note.trim() || null }) });
      onOpenChange(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut trimite propunerea.');
    } finally {
      setSending(false);
    }
  };

  if (!request) return null;
  const service = request.service;
  const title = reschedule ? 'Reprogramează consultația' : request.stage === 'prop' ? 'Modifică propunerea' : 'Propune altă oră';
  const expiry = chosen.length ? whenLabel(deadlineFor(chosen)) : null;
  const rule = (expiry ? `Pacientul are timp să aleagă până ${expiry}. ` : 'Pacientul are 24 h să aleagă, dar cel târziu cu 2 h înainte de prima oră propusă. ')
    + (reschedule ? 'Dacă nu răspunde, rămâne ora confirmată acum.' : 'Dacă nu răspunde, cererea expiră și banii revin la pacient.');

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent showCloseButton={false} className="flex max-h-[96dvh] w-[calc(100%-1rem)] max-w-[620px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[620px] sm:p-0">
        <div className="flex items-start justify-between px-6 pt-5">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500">{service ? `${service.name}${service.duration && service.type !== 'chat' ? ` · ${service.duration} min` : ''}. ` : ''}Vezi doar orele libere din programul tău.</DialogDescription>
          </div>
          <button type="button" aria-label="Închide" onClick={() => onOpenChange(false)} className="grid h-8 w-8 place-items-center text-slate-500 hover:text-slate-700"><X className="h-[18px] w-[18px]" /></button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-[18px]">
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Se încarcă programul…</p> : days.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Nu ai program săptămânal. Adaugă intervale în Profil, la „Program”.</p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((item, index) => {
                  const date = new Date(`${item.date}T12:00:00`);
                  const free = item.slots.filter((slot) => !slot.taken).length;
                  const off = item.slots.length === 0;
                  const on = index === dayIndex;
                  return (
                    <button key={item.date} type="button" onClick={() => setDayIndex(index)}
                      className={cn('flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-[10px]', on ? 'border-[1.5px] border-blue-600 bg-blue-50 text-blue-700' : off ? 'border border-slate-200 bg-slate-50 text-slate-400' : 'border border-slate-200 bg-white text-slate-950')}>
                      <span className="text-xs">{DOW[date.getDay()]}</span>
                      <span className="text-base font-semibold">{date.getDate()}</span>
                      <span className={cn('text-[10px]', off ? 'text-slate-300' : 'text-slate-500')}>{off ? 'liber' : `${free} ${free === 1 ? 'liberă' : 'libere'}`}</span>
                    </button>
                  );
                })}
              </div>
              {day && day.slots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Nu lucrezi în această zi.</div>
              ) : day && (
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {day.slots.map((slot) => {
                    const value = key(slot.starts_at);
                    const isOriginal = value === original;
                    const taken = Boolean(slot.taken) && !isOriginal;
                    const on = selected.includes(value);
                    const full = selected.length >= 3 && !on;
                    const disabled = taken || isOriginal || full;
                    return (
                      <button key={slot.starts_at} type="button" disabled={disabled} onClick={() => toggle(value)}
                        title={taken ? 'Ocupat' : isOriginal ? (reschedule ? 'Ora confirmată acum' : 'Ora cerută de pacient') : undefined}
                        className={cn('h-[38px] rounded-lg font-mono text-[13px] font-medium',
                          on ? 'border border-blue-600 bg-blue-600 text-white'
                            : taken ? 'border border-slate-100 bg-slate-100 text-slate-400 line-through'
                              : isOriginal ? 'border-[1.5px] border-dashed border-amber-500 bg-white text-slate-950'
                                : cn('border border-slate-200 bg-white', full ? 'text-slate-300' : 'text-slate-950 hover:border-blue-300'))}>
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3.5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-slate-200" />Liber</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-slate-100" />Ocupat</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border-[1.5px] border-dashed border-amber-500" />{reschedule ? 'Ora confirmată acum' : 'Ora cerută de pacient'}</span>
              </div>
            </>
          )}
          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3.5">
            <span className="text-[13px] font-medium text-slate-700">Orele propuse · {chosen.length} din 3</span>
            <div className="flex min-h-8 flex-wrap items-center gap-1.5">
              {chosen.map((value) => (
                <button key={value} type="button" onClick={() => toggle(value)} className="flex h-8 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 pl-3 pr-2 text-[13px] font-semibold text-blue-700">
                  {whenLabel(new Date(value).toISOString())}<X className="h-3.5 w-3.5" />
                </button>
              ))}
              {!chosen.length && <span className="text-[13px] text-slate-400">Alege una până la trei ore. Pacientul o păstrează pe cea care îi convine.</span>}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-slate-700">Mesaj pentru pacient <span className="font-normal text-slate-400">· opțional</span></span>
            <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Ex: Mâine dimineață am gardă, pot după-amiază." className="h-10 rounded-[10px] border border-slate-200 px-3 text-sm outline-none focus:border-blue-600 focus:ring-[3px] focus:ring-blue-600/15" />
          </label>
          <span className="text-[13px] leading-normal text-slate-600">{rule}</span>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={() => onOpenChange(false)} className="h-[42px] rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50">Anulează</button>
          <button type="button" onClick={() => void send()} disabled={!chosen.length || sending} className={cn('h-[42px] rounded-[10px] px-4 text-sm font-semibold text-white', chosen.length ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300')}>
            {sending ? 'Se trimite…' : chosen.length > 1 ? `Trimite ${chosen.length} ore` : 'Trimite propunerea'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
