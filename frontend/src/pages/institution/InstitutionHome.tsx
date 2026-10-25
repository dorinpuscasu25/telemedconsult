import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, Banknote, Building2, ClipboardList, HandCoins, Stethoscope, UserPlus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ListSkeleton } from '../../components/ui/skeleton';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { StatCard } from '../../components/app/StatCard';
import { EmptyState } from '../../components/app/EmptyState';
import { apiRequest } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import type { Institution, InstitutionSummary } from '../../lib/institution';

interface DashboardResponse {
  institution: Institution;
  summary: InstitutionSummary & {
    doctors_count: number;
    pending_invitations: number;
    month_consultations: number;
    month_gross: number;
    month_institution: number;
    month_doctors: number;
    pending_doctor_withdrawals: number;
    pending_doctor_withdrawals_amount: number;
  };
  monthly: Array<{ name: string; institution: number; doctors: number }>;
  recent: Array<{ id: number; doctor?: string | null; consultation_request_id: number; gross: number; provider: number; doctor_share_percent: number; doctor_amount: number; institution_amount: number; date: string }>;
}

export function InstitutionHome() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiRequest<DashboardResponse>('/institution/dashboard')
      .then((response) => { setData(response); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca datele instituției.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const loading = !data && !error;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Instituție medicală"
        title={data?.institution.name ?? 'Panoul instituției'}
        documentTitle="Acasă"
        description="Medicii tăi, consultațiile lor și banii care trec prin instituție."
        actions={<Button asChild><Link to="/institution/doctors?add=invite"><UserPlus className="h-4 w-4" />Invită un medic</Link></Button>}
      />

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {data && !data.institution.iban && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">Completează IBAN-ul instituției ca platforma să-ți poată transfera banii.</p>
          <Button asChild size="sm" variant="outline" className="bg-white"><Link to="/institution/settings">Completează datele</Link></Button>
        </div>
      )}
      {summary && summary.pending_doctor_withdrawals > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center">
          <HandCoins className="h-5 w-5 shrink-0 text-blue-600" />
          <p className="flex-1 text-sm text-blue-950"><strong>{summary.pending_doctor_withdrawals}</strong> {summary.pending_doctor_withdrawals === 1 ? 'cerere de plată' : 'cereri de plată'} de la medici, în total {money(summary.pending_doctor_withdrawals_amount)} MDL.</p>
          <Button asChild size="sm"><Link to="/institution/payouts">Vezi cererile</Link></Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Medici" value={summary?.doctors_count ?? 0} detail={summary?.pending_invitations ? `${summary.pending_invitations} invitații în așteptare` : 'Afiliați instituției'} icon={Stethoscope} loading={loading} />
        <StatCard label="Consultații luna aceasta" value={summary?.month_consultations ?? 0} detail={`${money(summary?.month_gross)} MDL încasați de la pacienți`} icon={ClipboardList} loading={loading} />
        <StatCard label="Partea instituției (luna)" value={`${money(summary?.month_institution)} MDL`} detail={`Medicilor: ${money(summary?.month_doctors)} MDL`} icon={Building2} loading={loading} />
        <StatCard label="Sold la platformă" value={`${money(summary?.platform_balance)} MDL`} detail={summary?.platform_pending ? `${money(summary.platform_pending)} MDL cerut, în procesare` : 'Disponibil pentru transfer'} icon={Banknote} loading={loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader title="Ultimele consultații" description="Cum s-a împărțit fiecare consultație finalizată." actions={<Link to="/institution/doctors" className="text-sm font-semibold text-primary hover:underline">Medicii</Link>} />
          <div className="mt-4">
            {loading ? <ListSkeleton rows={3} /> : (data?.recent.length ?? 0) === 0 ? (
              <EmptyState compact icon={ClipboardList} title="Nicio consultație încă" description="Când medicii tăi finalizează consultații, împărțirea apare aici." className="border-none bg-slate-50" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                      <th className="pb-2 font-medium">Medic</th>
                      <th className="pb-2 font-medium">Data</th>
                      <th className="pb-2 text-right font-medium">Net după comision</th>
                      <th className="pb-2 text-right font-medium">Medic</th>
                      <th className="pb-2 text-right font-medium">Instituție</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data?.recent.map((row) => (
                      <tr key={row.id}>
                        <td className="py-3 font-medium text-slate-900">{row.doctor}</td>
                        <td className="py-3 text-slate-500">{dateTime(row.date)}</td>
                        <td className="tabular py-3 text-right text-slate-700">{money(row.provider)}</td>
                        <td className="tabular py-3 text-right text-slate-700">{money(row.doctor_amount)} <span className="text-xs text-slate-400">({row.doctor_share_percent}%)</span></td>
                        <td className="tabular py-3 text-right font-semibold text-slate-950">{money(row.institution_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader title="Ultimele 6 luni" description="MDL, după comisionul platformei." />
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} width={48} />
                <Tooltip formatter={(value: number) => `${money(value)} MDL`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="institution" name="Instituție" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="doctors" name="Medici" stackId="a" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div><dt className="text-slate-500">Datorat medicilor</dt><dd className="tabular font-semibold text-slate-950">{money(summary?.owed_to_doctors)} MDL</dd></div>
            <div><dt className="text-slate-500">Total câștigat</dt><dd className="tabular font-semibold text-slate-950">{money(summary?.earned_total)} MDL</dd></div>
          </dl>
          <Button asChild variant="outline" className="mt-4 w-full"><Link to="/institution/payouts">Plăți și transferuri<ArrowRight className="h-4 w-4" /></Link></Button>
        </section>
      </div>
    </div>
  );
}
