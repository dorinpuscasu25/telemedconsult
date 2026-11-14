import { Gift } from 'lucide-react';
import { cn } from '../ui/utils';

export function FreeProfileChoice({ selected, onSelect, disabled = false, className }: { selected: boolean; onSelect: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect} className={cn('flex w-full items-start gap-3 rounded-2xl border bg-white p-4 text-left disabled:opacity-60', selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300', className)}>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600"><Gift size={21} /></span>
    <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-base font-semibold text-slate-950">Profil gratuit</span><span className="text-[13px] leading-5 text-slate-600">Pentru o persoană aleasă de tine, valabil un an. Se acordă o singură dată per cont.</span><span className="text-xs text-slate-500">Consultațiile se achită separat.</span></span>
    <span className="flex shrink-0 flex-col items-end gap-2"><span className="text-sm font-bold text-slate-950">0 MDL</span><span className={cn('grid h-5 w-5 place-items-center rounded-full border-[1.5px]', selected ? 'border-blue-600' : 'border-slate-300')}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</span></span>
  </button>;
}
