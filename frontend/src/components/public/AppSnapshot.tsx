import { FileText, Search } from 'lucide-react';
import { cn } from '../ui/utils';

/**
 * „Captura aplicatie”: fragmente reale din aplicație, pe pașii din „Cum
 * funcționează”. Textele sunt exemple, la fel ca în design.
 */
export function AppSnapshot({ kind }: { kind: 'search' | 'service' | 'conclusion' }) {
  return (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-slate-950">
      {kind === 'search' && (
        <>
          <div className="flex h-[38px] items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px]"><Search className="h-3.5 w-3.5 text-slate-400" />Pediatru</div>
          {[['IP', 'Dr. Ion Popescu', 'Clinica Pediatru', '250 MDL'], ['MR', 'Dr. Maria Rusu', 'IMSP CMF nr. 4', '200 MDL']].map(([ini, name, inst, from]) => (
            <div key={name} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
              <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-blue-100 text-[13px] font-semibold text-blue-700">{ini}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[13px] font-semibold">{name}</span><span className="text-[11px] text-slate-500">{inst}</span></span>
              <span className="flex flex-col items-end gap-px"><span className="text-[10px] text-slate-500">de la</span><span className="text-[13px] font-bold">{from}</span></span>
            </div>
          ))}
        </>
      )}
      {kind === 'service' && (
        <>
          <span className="px-0.5 pt-0.5 text-[13px] font-semibold">Alege serviciul</span>
          {[['Consultație video', 'Video · 30 min', '250 MDL'], ['Întrebare în chat', 'Chat · răspuns în 24 h', '150 MDL'], ['Vizită la domiciliu', 'Include ECG, tensiune', '600 MDL']].map(([name, meta, price], index) => (
            <div key={name} className={cn('flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5', index === 0 ? 'border-[1.5px] border-blue-600' : 'border border-slate-200')}>
              <span className={cn('h-4 w-4 shrink-0 rounded-full', index === 0 ? 'border-[5px] border-blue-600 bg-white' : 'border-[1.5px] border-slate-300')} />
              <span className="flex flex-1 flex-col gap-px"><span className="text-xs font-semibold">{name}</span><span className="text-[11px] text-slate-500">{meta}</span></span>
              <span className="text-xs font-bold">{price}</span>
            </div>
          ))}
          <div className="flex h-9 items-center justify-center rounded-[9px] bg-blue-600 text-xs font-semibold text-white">Alege ora</div>
        </>
      )}
      {kind === 'conclusion' && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center justify-between"><span className="rounded-full bg-green-50 px-2 py-[3px] text-[11px] font-semibold text-green-700">Concluzie publicată</span><span className="text-[11px] text-slate-500">Dr. Ion Popescu</span></div>
          <div className="flex flex-col gap-0.5"><span className="text-[10px] font-semibold tracking-[.04em] text-slate-500">DIAGNOSTIC</span><span className="text-[13px] font-semibold">Rinofaringită acută</span></div>
          <div className="flex flex-col gap-1 text-xs leading-[1.4] text-slate-700"><span>· Lichide calde, repaus 3 zile</span><span>· Paracetamol la febră peste 38,5°</span><span>· Revenire dacă febra trece de 3 zile</span></div>
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700"><FileText className="h-3.5 w-3.5" />Concluzie-Ana-10.11.pdf</div>
        </div>
      )}
    </div>
  );
}
