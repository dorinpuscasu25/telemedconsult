import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export type DoctorPerformance = { score: number; current_month_consultations: number; previous_total_consultations: number; rating: number; current_rating_sum: number; previous_rating_sum: number; average_response_minutes: number | null; response_uses_default: boolean; weights: Record<string, number>; components: { current_month: number; previous_consultations: number; rating: number; response: number } };
export function DoctorPerformanceCard({ performance: p }: { performance?: DoctorPerformance | null }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Indicator de performanță</CardTitle></CardHeader><CardContent className="space-y-4"><p><strong className="text-3xl text-primary">{p?.score.toLocaleString('ro-MD', { maximumFractionDigits: 2 }) ?? '—'}</strong> puncte</p>
    {p && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ['Consultații luna curentă', `${p.current_month_consultations} × ${p.weights.current_consultation}`, p.components.current_month],
      ['Consultații anterioare', `${p.previous_total_consultations} × ${p.weights.previous_consultation}`, p.components.previous_consultations],
      ['Suma evaluărilor', `${p.current_rating_sum} × ${p.weights.current_rating} + ${p.previous_rating_sum} × ${p.weights.previous_rating}`, p.components.rating],
      ['Prima reacție', p.average_response_minutes === null ? 'Fără date' : `În medie ${p.average_response_minutes} minute`, p.components.response],
    ].map(([label, detail, points]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 text-sm text-slate-500">{detail}<strong className="mt-1 block text-slate-900">{points} puncte</strong></dd></div>)}</dl>}
    <details className="text-sm text-slate-600"><summary className="cursor-pointer font-medium text-primary">Cum se calculează?</summary><p className="mt-2">Scorul adună consultațiile, suma notelor din recenzii și punctele pentru prima acceptare sau primul mesaj al medicului. Perioada curentă este luna calendaristică în Republica Moldova. Evaluările anterioare se însumează separat.</p><p className="mt-2">Răspunsul primește {p?.weights.response_max ?? 100} puncte până la 10 minute, apoi scade cu {p?.weights.response_decrement ?? 5} la fiecare interval de 10 minute, minimum 0. Fără o reacție înregistrată componenta este 0. Durata până la publicarea concluziei nu înlocuiește prima reacție.</p></details>
  </CardContent></Card>;
}
