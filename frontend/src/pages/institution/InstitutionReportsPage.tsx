import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { PageHeader } from '../../components/app/PageHeader';
import { apiRequest } from '../../lib/api';
import { dateTime, money } from '../../lib/format';

const STATUSES: Record<string, string> = { new: 'În așteptare', accepted: 'Acceptată', rescheduled: 'Reprogramată', completed: 'Finalizată', cancelled: 'Anulată', rejected: 'Respinsă', expired: 'Expirată', no_operator_available: 'Fără operator' };
type ReportRow = { id: number; request_id?: number; doctor: string; status?: string; date: string; amount?: number; gross?: number; provider?: number; doctor_amount?: number; institution_amount?: number; doctor_share_percent?: number; payment_status?: string; service?: string | null };
type Report = {
  timezone: string;
  mode: 'appointments' | 'earnings';
  rows: { data: ReportRow[]; current_page: number; last_page: number; total: number };
  summary: { appointments: number; settled_consultations: number; gross: number; provider: number; doctor_total: number; institution_total: number };
  doctors: Array<{ id: number; name: string; is_current: boolean; appointments: number; consultations: number; doctor_total: number; institution_total: number }>;
};
const selectClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm';

export function InstitutionReportsPage() {
  const [params, setParams] = useSearchParams();
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [doctor, setDoctor] = useState(params.get('doctor_id') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const mode = params.get('mode') === 'earnings' ? 'earnings' : 'appointments';
  const query = params.toString();
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    apiRequest<Report>(`/institution/reports?${query}`).then((response) => { if (!cancelled) setData(response); }).catch((err) => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Nu am putut încărca raportul.'); setData(null); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams({ mode });
    Object.entries({ from, to, doctor_id: doctor, status }).forEach(([key, value]) => { if (value) next.set(key, value); });
    setParams(next);
  };
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); if (key !== 'page') next.delete('page'); setParams(next); };
  const summary = data?.summary;

  return <div className="space-y-6">
    <PageHeader title="Rapoarte instituție" description="Programări și decontări, inclusiv activitatea medicilor care au plecat din instituție." />
    <form onSubmit={apply} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_1.2fr_auto]">
      <div className="space-y-1.5"><Label htmlFor="report-from">De la</Label><Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="report-to">Până la</Label><Input id="report-to" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="report-doctor">Medic</Label><select id="report-doctor" value={doctor} onChange={(event) => setDoctor(event.target.value)} className={selectClass}><option value="">Toți medicii</option>{data?.doctors.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_current ? '' : ' · fost afiliat'}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="report-status">Starea programării</Label><select id="report-status" value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}><option value="">Toate stările</option>{Object.entries(STATUSES).map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></div>
      <div className="flex items-end gap-2"><Button type="submit" disabled={loading}>Aplică</Button><Button type="button" variant="outline" onClick={() => { setFrom(''); setTo(''); setDoctor(''); setStatus(''); setParams({ mode }); }}>Resetează</Button></div>
    </form>
    <p className="text-xs text-slate-500">Perioada filtrează programările după data programată (sau data creării, când ora nu este stabilită) și decontările după data înregistrării lor. Orele și perioadele sunt în fusul Republicii Moldova. Sumele sunt decontate la publicarea rezultatului; recenzia este opțională.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-busy={loading}>{[
      ['Programări în selecție', summary?.appointments ?? 0], ['Consultații decontate', summary?.settled_consultations ?? 0], ['Partea medicilor', `${money(summary?.doctor_total)} MDL`], ['Partea instituției', `${money(summary?.institution_total)} MDL`],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{loading ? '…' : value}</p></div>)}</div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex gap-2 border-b border-slate-100 p-4" role="tablist" aria-label="Tipul raportului"><Button role="tab" aria-selected={mode === 'appointments'} variant={mode === 'appointments' ? 'default' : 'outline'} onClick={() => change('mode', 'appointments')}>Programări</Button><Button role="tab" aria-selected={mode === 'earnings'} variant={mode === 'earnings' ? 'default' : 'outline'} onClick={() => change('mode', 'earnings')}>Decontări</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Consultație</th><th className="p-3">Medic</th><th className="p-3">{mode === 'earnings' ? 'Decontată la' : 'Programată la'}</th>{mode === 'earnings' ? <><th className="p-3 text-right">După comision</th><th className="p-3 text-right">Medic</th><th className="p-3 text-right">Instituție</th></> : <><th className="p-3">Stare</th><th className="p-3">Serviciu</th><th className="p-3 text-right">Preț</th></>}</tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={6} className="p-5 text-slate-500">Se încarcă raportul…</td></tr> : !data?.rows.data.length ? <tr><td colSpan={6} className="p-5 text-slate-500">Nu sunt înregistrări pentru filtrele alese.</td></tr> : data.rows.data.map((row) => <tr key={row.id}><td className="p-3">#{row.request_id ?? row.id}</td><td className="p-3 font-medium">{row.doctor ?? 'Medic indisponibil'}</td><td className="p-3 text-slate-500">{dateTime(row.date, '-', data?.timezone)}</td>{mode === 'earnings' ? <><td className="p-3 text-right">{money(row.provider)}</td><td className="p-3 text-right">{money(row.doctor_amount)} <span className="text-xs text-slate-400">({row.doctor_share_percent}%)</span></td><td className="p-3 text-right font-semibold">{money(row.institution_amount)}</td></> : <><td className="p-3">{STATUSES[row.status ?? ''] ?? row.status}</td><td className="p-3">{row.service ?? '—'}</td><td className="p-3 text-right">{money(row.amount)} MDL</td></>}</tr>)}</tbody></table></div>
      {data && <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm"><span>{data.rows.total} înregistrări · pagina {data.rows.current_page} / {data.rows.last_page}</span><div className="flex gap-2"><Button variant="outline" disabled={loading || data.rows.current_page <= 1} onClick={() => change('page', String(data.rows.current_page - 1))}>Înapoi</Button><Button variant="outline" disabled={loading || data.rows.current_page >= data.rows.last_page} onClick={() => change('page', String(data.rows.current_page + 1))}>Înainte</Button></div></div>}
    </section>
    {data && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">Totaluri per medic pentru selecția curentă</h2><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-2">Medic</th><th className="py-2 text-right">Programări</th><th className="py-2 text-right">Decontate</th><th className="py-2 text-right">Partea medicului</th><th className="py-2 text-right">Partea instituției</th></tr></thead><tbody className="divide-y divide-slate-100">{data.doctors.filter((item) => !params.get('doctor_id') || String(item.id) === params.get('doctor_id')).map((item) => <tr key={item.id}><td className="py-3">{item.name}{!item.is_current && <span className="ml-1 text-xs text-slate-400">fost afiliat</span>}</td><td className="py-3 text-right">{item.appointments}</td><td className="py-3 text-right">{item.consultations}</td><td className="py-3 text-right">{money(item.doctor_total)}</td><td className="py-3 text-right">{money(item.institution_total)}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
