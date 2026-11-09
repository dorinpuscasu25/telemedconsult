import { useId } from 'react';
import { Textarea } from './ui/textarea';

/** `symptomsFirst`: la programare (6b), acuzele (obligatorii) vin primele, istoricul e opțional, fără texte de ajutor. */
export function ConsultationComplaintFields({ history, symptoms, onHistoryChange, onSymptomsChange, symptomsFirst = false }: {
  history: string;
  symptoms: string;
  onHistoryChange: (value: string) => void;
  onSymptomsChange: (value: string) => void;
  symptomsFirst?: boolean;
}) {
  const id = useId();

  if (symptomsFirst) {
    return <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-symptoms`} className="text-sm font-medium text-slate-900">Acuze</label>
        <Textarea id={`${id}-symptoms`} value={symptoms} onChange={(event) => onSymptomsChange(event.target.value)} maxLength={4000} required placeholder="Ce te deranjează, de când, cât de des…" className="min-h-[88px] rounded-[10px] text-[15px] leading-[1.45]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-history`} className="text-sm font-medium text-slate-900">Istoricul bolii <span className="font-normal text-slate-500">(opțional)</span></label>
        <Textarea id={`${id}-history`} value={history} onChange={(event) => onHistoryChange(event.target.value)} maxLength={4000} placeholder="Cum a început, ce ai luat până acum…" className="min-h-[64px] rounded-[10px] text-[15px]" />
      </div>
    </div>;
  }

  return <div className="space-y-4">
    <div className="space-y-2">
      <label htmlFor={`${id}-history`} className="block text-sm font-medium text-slate-700">Istoricul bolii actuale</label>
      <p id={`${id}-history-help`} className="text-xs text-slate-500">De când a apărut problema? Descrie cum a început, cum a evoluat și ce măsuri sau tratamente ai încercat.</p>
      <Textarea id={`${id}-history`} aria-describedby={`${id}-history-help`} value={history} onChange={(event) => onHistoryChange(event.target.value)} maxLength={4000} placeholder="Debutul și evoluția problemei…" className="min-h-[100px] rounded-xl" />
    </div>
    <div className="space-y-2">
      <label htmlFor={`${id}-symptoms`} className="block text-sm font-medium text-slate-700">Acuzele pacientului (plângerile / simptomele)</label>
      <p id={`${id}-symptoms-help`} className="text-xs text-slate-500">Ce îl deranjează pe pacient acum? Descrie simptomele, intensitatea și cât de des apar.</p>
      <Textarea id={`${id}-symptoms`} aria-describedby={`${id}-symptoms-help`} value={symptoms} onChange={(event) => onSymptomsChange(event.target.value)} maxLength={4000} required placeholder="Simptomele și plângerile actuale…" className="min-h-[120px] rounded-xl" />
    </div>
    <p className="text-xs text-slate-500">Istoricul și acuzele se păstrează în consultația pacientului și se includ în PDF-ul publicat de medic.</p>
  </div>;
}
