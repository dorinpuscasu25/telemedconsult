import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export type DoctorPerformance = { score: number; current_month_consultations: number; previous_total_consultations: number; rating: number; average_response_minutes: number | null; response_uses_default: boolean; components: { current_month: number; previous_consultations: number; rating: number; response: number } };
export function DoctorPerformanceCard({ performance }: { performance?: DoctorPerformance | null }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Indicator de performanță</CardTitle></CardHeader><CardContent className="space-y-4">
    <div><strong className="text-3xl text-primary">{performance ? performance.score.toLocaleString('ro-MD', { maximumFractionDigits: 2 }) : '—'}</strong><span className="ml-2 text-sm text-slate-500">puncte</span><p className="mt-2 text-sm text-slate-600">Scorul sintetizează activitatea ta în platformă și determină poziția în clasamentul administrativ al medicilor. Se actualizează din consultațiile finalizate, rating și timpul de răspuns.</p></div>
    {performance && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ['Consultații în luna curentă', `${performance.current_month_consultations} × 4`, performance.components.current_month],
      ['Consultații din lunile anterioare', `${performance.previous_total_consultations} × 1,5`, performance.components.previous_consultations],
      ['Rating mediu', `${performance.rating.toFixed(1)} × 10`, performance.components.rating],
      ['Timp mediu de răspuns', performance.average_response_minutes === null ? 'Fără date încă' : `${performance.average_response_minutes} minute`, performance.components.response],
    ].map(([label, detail, points]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 text-sm text-slate-500">{detail}<strong className="mt-1 block text-slate-900">{points} puncte</strong></dd></div>)}</dl>}
    <details className="text-sm text-slate-600"><summary className="cursor-pointer font-medium text-primary">Cum se calculează și cum îl poți îmbunătăți?</summary><p className="mt-2">Fiecare consultație finalizată luna aceasta aduce 4 puncte; fiecare consultație din lunile anterioare aduce 1,5 puncte. Ratingul se înmulțește cu 10. Componenta de răspuns este 60 minus timpul mediu în minute, cu minimum 0 puncte și maximum 60. Scorul total este suma celor patru componente și nu are o limită fixă.</p><p className="mt-2">Finalizează consultațiile cu recomandările publicate în fișa pacientului și răspunde solicitărilor preluate. Timpul folosit aici este cel înregistrat la publicarea concluziei medicale.</p>{performance?.response_uses_default && <p className="mt-2">Până la înregistrarea primului timp de răspuns, această componentă folosește valoarea inițială de 60 de puncte, la fel ca în clasamentul administrativ.</p>}</details>
  </CardContent></Card>;
}
