import { useId } from 'react';
import { Textarea } from './ui/textarea';

export function ConsultationComplaintFields({ history, symptoms, onHistoryChange, onSymptomsChange }: {
  history: string;
  symptoms: string;
  onHistoryChange: (value: string) => void;
  onSymptomsChange: (value: string) => void;
  symptomsFirst?: boolean;
}) {
  const id = useId();
  const declaration = [history ? `Istoricul declarat: ${history}` : '', symptoms].filter(Boolean).join('\n\n');
  return <div className="flex flex-col gap-1.5">
    <label htmlFor={`${id}-declaration`} className="text-sm font-medium text-slate-900">Istoricul bolii și acuzele pacientului</label>
    <Textarea id={`${id}-declaration`} value={declaration} onChange={(event) => { onHistoryChange(''); onSymptomsChange(event.target.value); }} maxLength={8000} required placeholder="Ce te deranjează, de când a început, cum a evoluat și ce tratamente ai încercat…" className="min-h-[140px] rounded-[10px] text-[15px] leading-[1.5]" />
    <p className="text-xs text-slate-500">Declarația ta se păstrează în consultație. Medicul își adaugă precizările separat.</p>
  </div>;
}
