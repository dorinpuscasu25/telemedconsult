import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { cn } from '../ui/utils';
import { apiRequest } from '../../lib/api';
import { mdl, whenLabel, type Proposal, type RequestService } from '../../lib/doctor';

export interface ProposalRequest {
  id: string;
  status: string;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  proposal?: Proposal | null;
  service?: RequestService;
  amount?: number | null;
  doctor?: { name: string } | null;
  operator?: { name: string } | null;
  patient_profile?: { name?: string | null } | null;
}

const doctorName = (request: ProposalRequest) => {
  const name = request.doctor?.name ?? request.operator?.name ?? 'Medicul';
  return request.doctor && !/^dr\.?\s/i.test(name) ? `Dr. ${name}` : name;
};

/**
 * P1b: medicul a propus una până la trei ore. Pacientul alege una, cere altele
 * sau, la o cerere nouă, o anulează și primește banii înapoi. La o reprogramare
 * poate păstra ora confirmată.
 */
export function ProposalResponse({ request, onChanged, className }: { request: ProposalRequest; onChanged: () => void; className?: string }) {
  const proposal = request.proposal;
  const slots = proposal?.slots?.length ? proposal.slots : request.proposed_scheduled_at ? [request.proposed_scheduled_at] : [];
  const [picked, setPicked] = useState<string | null>(slots.length === 1 ? slots[0] : null);
  const [sheet, setSheet] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const reschedule = Boolean(proposal?.is_reschedule);
  const first = (request.patient_profile?.name ?? '').split(' ')[0];
  const service = request.service;
  const price = mdl(service?.price ?? request.amount ?? 0);

  if (proposal?.patient_asked_at) {
    return (
      <div className={cn('flex flex-col gap-2 rounded-2xl border border-amber-200 bg-white p-4', className)}>
        <span className="self-start rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Ai cerut alte ore</span>
        <span className="text-[17px] font-bold text-slate-950">{doctorName(request)} alege alte ore</span>
        <span className="text-sm leading-normal text-slate-600">Îți scriem aici și pe Telegram când propune. Dacă nu propune până {whenLabel(proposal.expires_at)}, cererea se anulează și banii revin.</span>
      </div>
    );
  }

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      setSheet(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a reușit.');
    } finally {
      setBusy(false);
    }
  };

  const accept = () => picked && run(() => apiRequest(`/requests/${request.id}/accept-proposed-time`, { method: 'POST', body: JSON.stringify({ scheduled_at: picked }) }), `Consultația e confirmată: ${whenLabel(picked)}.`);
  const askOthers = () => run(() => apiRequest(`/requests/${request.id}/request-other-times`, { method: 'POST', body: JSON.stringify({ note: note.trim() || 'Nicio oră nu-mi convine.' }) }), 'Am trimis medicului că ai nevoie de alte ore.');
  const alternative = () => reschedule
    ? run(() => apiRequest(`/requests/${request.id}/keep-current-time`, { method: 'POST' }), 'Rămâne ora confirmată.')
    : run(() => apiRequest(`/requests/${request.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Nicio oră propusă nu i-a convenit pacientului.' }) }), `Cererea e anulată. ${price} au revenit în portofel.`);

  return (
    <>
      <div className={cn('flex flex-col gap-3 rounded-2xl border-[1.5px] border-blue-600 bg-white p-4', className)}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{reschedule ? 'Medicul propune mutarea' : 'Medicul propune altă oră'}</span>
          {proposal?.expires_at && <span className="text-xs font-semibold text-amber-700">până {whenLabel(proposal.expires_at)}</span>}
        </div>
        <div className="flex flex-col gap-[3px]">
          <span className="text-[17px] font-bold text-slate-950">{doctorName(request)}{first ? ` · pentru ${first}` : ''}</span>
          <span className="text-[13px] text-slate-500">{[service?.name, service?.duration && service.type !== 'chat' ? `${service.duration} min` : null, price].filter(Boolean).join(' · ')}</span>
          {request.scheduled_at && <span className="text-[13px] text-slate-500">{reschedule ? `Acum: ${whenLabel(request.scheduled_at)} · rămâne dacă nu alegi` : `Ai cerut: ${whenLabel(request.scheduled_at)}`}</span>}
        </div>
        {proposal?.note && <span className="rounded-[10px] bg-slate-50 px-3 py-2.5 text-sm leading-[1.45] text-slate-950">„{proposal.note}”</span>}
        <div className="flex flex-col gap-2">
          {slots.map((slot) => {
            const on = picked === slot;
            return (
              <button key={slot} type="button" onClick={() => setPicked(slot)} aria-pressed={on}
                className={cn('flex h-12 items-center gap-3 rounded-xl px-3.5 text-left', on ? 'border-[1.5px] border-blue-600 bg-blue-50' : 'border border-slate-200 bg-white')}>
                <span className={cn('grid h-5 w-5 place-items-center rounded-full border-2', on ? 'border-blue-600' : 'border-slate-300')}><span className={cn('h-2.5 w-2.5 rounded-full', on ? 'bg-blue-600' : 'bg-transparent')} /></span>
                <span className="text-[15px] font-semibold text-slate-950">{whenLabel(slot, true)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => void accept()} disabled={!picked || busy} className={cn('h-12 rounded-[10px] text-[15px] font-semibold text-white', picked ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300')}>
          {picked ? `Accept ${whenLabel(picked)}` : 'Alege o oră'}
        </button>
        <button type="button" onClick={() => setSheet(true)} className="h-11 rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-950 hover:bg-slate-50">Nu-mi convine niciuna</button>
        <span className="text-xs leading-[1.45] text-slate-500">{reschedule ? 'Dacă nu alegi, rămâne ora de acum.' : 'Dacă nu alegi până atunci, cererea se anulează și banii revin în portofel.'}</span>
      </div>

      <Dialog open={sheet} onOpenChange={setSheet}>
        <DialogContent showCloseButton={false} className="bottom-0 top-auto flex w-full max-w-none translate-y-0 flex-col gap-3 rounded-b-none rounded-t-[20px] px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-2.5 sm:bottom-auto sm:top-1/2 sm:max-w-[420px] sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <span className="h-1 w-10 self-center rounded-sm bg-slate-300 sm:hidden" />
          <DialogTitle className="text-lg font-semibold">Nicio oră nu-ți convine?</DialogTitle>
          <DialogDescription className="sr-only">Spune medicului când ți-ar fi bine.</DialogDescription>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-slate-700">Când ți-ar fi bine?</span>
            <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Ex: Pot doar după 17:00" className="h-12 rounded-[10px] border border-slate-200 px-3.5 text-base outline-none focus:border-blue-600" />
          </label>
          <button type="button" onClick={() => void askOthers()} disabled={busy} className="h-12 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white">Cere alte ore</button>
          <button type="button" onClick={() => void alternative()} disabled={busy} className={cn('h-[46px] rounded-[10px] border border-slate-200 bg-white text-sm font-medium', reschedule ? 'text-slate-950' : 'text-red-600')}>
            {reschedule ? `Păstrez ora de acum · ${whenLabel(request.scheduled_at)}` : `Anulează și primește ${price} înapoi`}
          </button>
          <button type="button" onClick={() => setSheet(false)} className="h-10 text-sm text-slate-500">Închide</button>
        </DialogContent>
      </Dialog>
    </>
  );
}
