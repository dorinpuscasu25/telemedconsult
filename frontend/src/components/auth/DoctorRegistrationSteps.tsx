import { Check } from 'lucide-react';
import { cn } from '../ui/utils';

const STEPS = ['Date personale', 'Confirmă emailul', 'Instituția', 'Aprobare'];

/** Înregistrarea medicului, în patru pași: datele, emailul, instituția, aprobarea. */
export function DoctorRegistrationSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 px-6 pt-6" aria-label={`Pasul ${current} din 4`}>
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex flex-col gap-1.5" aria-current={active ? 'step' : undefined}>
            <span className={cn('h-1 rounded-sm', step <= current ? 'bg-blue-600' : 'bg-slate-200')} />
            <span className={cn('flex items-center gap-1 text-[11px] leading-tight sm:text-xs', active ? 'font-semibold text-slate-950' : done ? 'font-medium text-blue-600' : 'text-slate-400')}>
              {done && <Check className="h-3 w-3 shrink-0" strokeWidth={3} />}{label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
