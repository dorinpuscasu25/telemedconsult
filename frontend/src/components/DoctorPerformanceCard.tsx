import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export type DoctorPerformance = { score: number; current_month_consultations: number; previous_total_consultations: number; rating: number; current_rating_sum: number; previous_rating_sum: number; promotion_points_spent: number; referral_points_earned: number; average_response_minutes: number | null; response_uses_default: boolean; weights: Record<string, number>; components: { current_month: number; previous_consultations: number; rating: number; response: number; promotion: number } };
export function DoctorPerformanceCard({ performance: p }: { performance?: DoctorPerformance | null }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />Indicator de performanță</CardTitle></CardHeader><CardContent className="space-y-4"><p><strong className="text-3xl text-primary">{p?.score.toLocaleString('ro-MD', { maximumFractionDigits: 2 }) ?? '—'}</strong> puncte</p>
    {p && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ['Consultații luna curentă', `${p.current_month_consultations} × ${p.weights.current_consultation}`, p.components.current_month],
      ['Consultații anterioare', `${p.previous_total_consultations} × ${p.weights.previous_consultation}`, p.components.previous_consultations],
      ['Suma evaluărilor', `${p.current_rating_sum} × ${p.weights.current_rating} + ${p.previous_rating_sum} × ${p.weights.previous_rating}`, p.components.rating],
      ['Prima reacție', p.average_response_minutes === null ? 'Fără date' : `În medie ${p.average_response_minutes} minute`, p.components.response],
      ['Promovare consumată', `${p.promotion_points_spent} × ${p.weights.promotion_spend}`, p.components.promotion],
    ].map(([label, detail, points]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><dt className="text-sm font-medium">{label}</dt><dd className="mt-1 text-sm text-slate-500">{detail}<strong className="mt-1 block text-slate-900">{points} puncte</strong></dd></div>)}</dl>}
    {p && <p className="text-sm text-slate-600">Puncte primite din referali: <strong>{p.referral_points_earned}</strong>. Acestea pot finanța promovarea și nu se adaugă direct scorului. Numai punctele consumate efectiv pentru afișări aduc performanță; bugetul rezervat și punctele returnate nu se punctează.</p>}
    <details className="text-sm text-slate-600"><summary className="cursor-pointer font-medium text-primary">Cum se calculează?</summary><p className="mt-2">Scorul adună consultațiile, suma notelor din recenzii, punctele pentru prima reacție și {p?.weights.promotion_spend ?? 0.1} puncte pentru fiecare punct consumat la promovare. Perioada curentă este luna calendaristică în Republica Moldova. Consumul pentru promovare include afișările până la sfârșitul perioadei, iar evaluările anterioare se însumează separat.</p><p className="mt-2">Răspunsul primește {p?.weights.response_max ?? 100} puncte până la 10 minute, apoi scade cu {p?.weights.response_decrement ?? 5} la fiecare interval de 10 minute, minimum 0. Fără o reacție înregistrată componenta este 0. Durata până la publicarea concluziei nu înlocuiește prima reacție.</p></details>
  </CardContent></Card>;
}
