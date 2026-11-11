import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { apiRequest } from '../../lib/api';
import { dateOnly, money } from '../../lib/format';
import { PeriodPicker, SummaryTiles, periodQuery, usePeriod } from './ReferralStatsPage';

type ReferredPatient = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  registered_at: string;
  profiles_count: number;
  topup_count: number;
  first_topup_at: string | null;
  topups_total: number;
  spent_total: number;
  reserved_total: number;
  revenue_total: number;
  consultations_count: number;
  commission_total: number;
  last_activity_at: string | null;
};

type ReferrerDetail = {
  referrer: { id: number; name: string; email: string; phone: string | null; roles: string[]; code: string | null };
  totals: {
    invited_count: number;
    invited_in_period: number;
    topped_up_count: number;
    spending_count: number;
    consultations_count: number;
    topups_total: number;
    spent_total: number;
    reserved_total: number;
    revenue_total: number;
    commission_total: number;
  };
  patients: ReferredPatient[];
};

const FILTERS: Array<[string, string]> = [['all', 'Toți'], ['paid', 'Au alimentat'], ['spent', 'Au cheltuit'], ['none', 'Fără alimentare']];

/** Un invitator în detaliu: fiecare pacient adus și ce a adus platformei. */
export function ReferralReferrerPage() {
  const { id } = useParams();
  const [period, setPeriod] = usePeriod();
  const [data, setData] = useState<ReferrerDetail | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const query = periodQuery(period);

  useEffect(() => {
    setData(null);
    setError('');
    apiRequest<ReferrerDetail>(`/admin/referral-stats/${id}?${query}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca invitatorul.'));
  }, [id, query]);

  const shown = useMemo(() => (data?.patients ?? []).filter((patient) => {
    if (filter === 'paid' && patient.topup_count === 0) return false;
    if (filter === 'spent' && patient.spent_total <= 0) return false;
    if (filter === 'none' && patient.topup_count > 0) return false;
    return `${patient.name} ${patient.email ?? ''} ${patient.phone ?? ''}`.toLowerCase().includes(search.toLowerCase());
  }), [data, filter, search]);

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/admin/referrals?${query}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Afiliere</Link>
        <h1 className="mb-1 text-3xl font-bold tracking-tight text-slate-900">{data?.referrer.name ?? 'Invitator'}</h1>
        {data && <p className="text-slate-500">{data.referrer.email}{data.referrer.phone ? ` · ${data.referrer.phone}` : ''} · cod <span className="font-mono text-xs">{data.referrer.code ?? '—'}</span></p>}
      </div>

      <PeriodPicker period={period} onChange={setPeriod} />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-500">Se încarcă...</p>}

      {totals && (
        <SummaryTiles items={[
          ['Pacienți aduși', String(totals.invited_count), `${totals.invited_in_period} noi în perioadă`],
          ['Au alimentat', String(totals.topped_up_count), `${totals.spending_count} au cheltuit`],
          ['Alimentat', `${money(totals.topups_total)} MDL`],
          ['Cheltuit', `${money(totals.spent_total)} MDL`, totals.reserved_total > 0 ? `+ ${money(totals.reserved_total)} rezervat` : `${totals.consultations_count} consultații`],
          ['Venit platformă', `${money(totals.revenue_total)} MDL`],
          ['Bonus deja primit', `${money(totals.commission_total)} MDL`, 'pe cartela de bonusuri'],
        ]} />
      )}

      {data && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl border px-3 py-2 text-sm font-medium ${filter === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-blue-50'}`}>{label}</button>
              ))}
            </div>
            <Input placeholder="Caută pacient..." value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl bg-white/60 sm:w-72" />
          </div>

          <Card className="glass-card border-0">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pacient</TableHead>
                      <TableHead>Înregistrat</TableHead>
                      <TableHead className="text-right">Profiluri</TableHead>
                      <TableHead className="text-right">Alimentări</TableHead>
                      <TableHead className="text-right">Alimentat</TableHead>
                      <TableHead className="text-right">Cheltuit</TableHead>
                      <TableHead className="text-right">Consultații</TableHead>
                      <TableHead className="text-right">Venit platformă</TableHead>
                      <TableHead>Ultima activitate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell><p className="font-medium text-slate-900">{patient.name}</p><p className="text-xs text-slate-500">{[patient.email, patient.phone].filter(Boolean).join(' · ')}</p></TableCell>
                        <TableCell className="text-sm">{dateOnly(patient.registered_at)}</TableCell>
                        <TableCell className="text-right">{patient.profiles_count}</TableCell>
                        <TableCell className="text-right">{patient.topup_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(patient.topups_total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(patient.spent_total)}{patient.reserved_total > 0 && <p className="text-xs text-slate-400">+{money(patient.reserved_total)} rezervat</p>}</TableCell>
                        <TableCell className="text-right">{patient.consultations_count}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-emerald-700">{money(patient.revenue_total)}</TableCell>
                        <TableCell className="text-sm text-slate-500">{dateOnly(patient.last_activity_at)}</TableCell>
                      </TableRow>
                    ))}
                    {shown.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-slate-500">Niciun pacient pentru acest filtru.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-slate-500">Lista arată toți pacienții aduși vreodată; sumele sunt doar din perioada aleasă.</p>
        </>
      )}
    </div>
  );
}
