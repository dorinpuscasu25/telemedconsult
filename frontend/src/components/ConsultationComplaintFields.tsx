import { useId } from 'react';
import { Textarea } from './ui/textarea';

export function ConsultationComplaintFields({ history, symptoms, onHistoryChange, onSymptomsChange }: {
  history: string;
  symptoms: string;
  onHistoryChange: (value: string) => void;
  onSymptomsChange: (value: string) => void;
}) {
  const id = useId();
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
