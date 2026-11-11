import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/format';

type ReferrerRow = {
  id: number;
  name: string;
  email: string;
  roles: string[];
  code: string | null;
  invited_count: number;
  invited_in_period: number;
  active_count: number;
  spending_count: number;
  topups_total: number;
  spent_total: number;
  revenue_total: number;
  earned_total: number;
};

const ROLE_FILTERS: Array<[string, string]> = [['operator', 'Operatori'], ['doctor', 'Medici'], ['patient', 'Pacienți'], ['', 'Toți']];
const ROLE_LABELS: Record<string, string> = { operator: 'Operator', doctor: 'Medic', patient: 'Pacient', admin: 'Admin', coordinator: 'Coordonator' };

/** Perioada raportului: o lună întreagă sau tot timpul. Sumele sunt doar din perioadă. */
export type ReportPeriod = { from: string; to: string };

const pad = (value: number) => String(value).padStart(2, '0');
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function monthPeriod(offset: number): ReportPeriod {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: isoDay(first), to: isoDay(last) };
}

const PERIODS: Array<[string, string, () => ReportPeriod]> = [
  ['month', 'Luna aceasta', () => monthPeriod(0)],
  ['last', 'Luna trecută', () => monthPeriod(-1)],
  ['all', 'Tot timpul', () => ({ from: '', to: '' })],
];

export function periodQuery(period: ReportPeriod): string {
  // Cheile goale rămân: „tot timpul” se deosebește astfel de lipsa perioadei (= luna curentă).
  return new URLSearchParams({ from: period.from, to: period.to }).toString();
}

/** Perioada ținută în URL, ca linkul către detaliu să o păstreze. */
export function usePeriod(): [ReportPeriod, (period: ReportPeriod) => void] {
  const [params, setParams] = useSearchParams();
  const period = params.has('from') || params.has('to') ? { from: params.get('from') ?? '', to: params.get('to') ?? '' } : monthPeriod(0);
  const setPeriod = (next: ReportPeriod) => {
    const merged = new URLSearchParams(params);
    merged.set('from', next.from);
    merged.set('to', next.to);
    setParams(merged, { replace: true });
  };
  return [period, setPeriod];
}

export function PeriodPicker({ period, onChange }: { period: ReportPeriod; onChange: (period: ReportPeriod) => void }) {
  const active = PERIODS.find(([, , make]) => { const p = make(); return p.from === period.from && p.to === period.to; })?.[0] ?? 'custom';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODS.map(([key, label, make]) => (
        <button key={key} type="button" onClick={() => onChange(make())} className={`rounded-xl border px-3 py-2 text-sm font-medium ${active === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>
      ))}
      <div className="flex items-center gap-1.5">
        <Input type="date" aria-label="De la" value={period.from} onChange={(event) => onChange({ ...period, from: event.target.value })} className="h-9 w-[150px] rounded-xl bg-white" />
        <span className="text-slate-400">–</span>
        <Input type="date" aria-label="Până la" value={period.to} onChange={(event) => onChange({ ...period, to: event.target.value })} className="h-9 w-[150px] rounded-xl bg-white" />
      </div>
    </div>
  );
}

export function SummaryTiles({ items }: { items: Array<[string, string, string?]> }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      {items.map(([label, value, hint]) => (
        <Card key={label} className="glass-card border-0"><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>{hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}</CardContent></Card>
      ))}
    </div>
  );
}

/**
 * Ce a adus fiecare invitator prin linkul personal: pacienți, alimentări,
 * cheltuieli și venitul platformei. După aceste cifre se plătesc operatorii.
 */
export function ReferralStatsPage() {
  const [role, setRole] = useState('operator');
  const [period, setPeriod] = usePeriod();
  const [rows, setRows] = useState<ReferrerRow[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const query = periodQuery(period);

  useEffect(() => {
    setRows(null);
    setError('');
    const params = new URLSearchParams(query);
    if (role) params.set('role', role);
    apiRequest<{ data: ReferrerRow[] }>(`/admin/referral-stats?${params}`)
      .then((response) => setRows(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca statistica.'));
  }, [role, query]);

  const shown = useMemo(() => (rows ?? []).filter((row) => `${row.name} ${row.email} ${row.code ?? ''}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const totals = shown.reduce((sum, row) => ({
    invited: sum.invited + row.invited_count,
    newOnes: sum.newOnes + row.invited_in_period,
    active: sum.active + row.active_count,
    topups: sum.topups + row.topups_total,
    spent: sum.spent + row.spent_total,
    revenue: sum.revenue + row.revenue_total,
  }), { invited: 0, newOnes: 0, active: 0, topups: 0, spent: 0, revenue: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Afiliere</h1>
        <p className="text-slate-500">Pacienții aduși de fiecare invitator, cât au alimentat, cât au cheltuit și cât a încasat platforma de pe ei. Deschide un rând ca să vezi fiecare pacient.</p>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setRole(value)} className={`rounded-xl border px-3 py-2 text-sm font-medium ${role === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-blue-50'}`}>{label}</button>
          ))}
        </div>
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      <SummaryTiles items={[
        ['Pacienți aduși', String(totals.invited), `${totals.newOnes} noi în perioadă`],
        ['Au alimentat', String(totals.active), 'în perioadă'],
        ['Alimentat', `${money(totals.topups)} MDL`],
        ['Cheltuit', `${money(totals.spent)} MDL`],
        ['Venit platformă', `${money(totals.revenue)} MDL`],
        ['Invitatori', String(shown.length)],
      ]} />

      <Input placeholder="Caută după nume, email sau cod..." value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl bg-white/60 sm:w-80" />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card className="glass-card border-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invitator</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-right">Aduși</TableHead>
                  <TableHead className="text-right">Noi</TableHead>
                  <TableHead className="text-right">Au alimentat</TableHead>
                  <TableHead className="text-right">Alimentat</TableHead>
                  <TableHead className="text-right">Cheltuit</TableHead>
                  <TableHead className="text-right">Venit platformă</TableHead>
                  <TableHead className="text-right">Bonus primit</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => {
                  // Operatorii se deschid pe pagina lor (portofel, vizite, pacienți).
                  const href = row.roles.includes('operator') ? `/admin/operators/${row.id}?${query}` : `/admin/referrals/${row.id}?${query}`;
                  return (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell><Link to={href} className="block"><p className="font-medium text-slate-900">{row.name}</p><p className="text-xs text-slate-500">{row.email}</p></Link></TableCell>
                    <TableCell className="text-sm">{row.roles.map((item) => ROLE_LABELS[item] ?? item).join(', ')}</TableCell>
                    <TableCell className="text-right font-semibold">{row.invited_count}</TableCell>
                    <TableCell className="text-right">{row.invited_in_period}</TableCell>
                    <TableCell className="text-right">{row.active_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.topups_total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.spent_total)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">{money(row.revenue_total)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{money(row.earned_total)}</TableCell>
                    <TableCell className="w-8"><Link to={href} aria-label={`Detalii ${row.name}`}><ChevronRight className="h-4 w-4 text-slate-400" /></Link></TableCell>
                  </TableRow>
                  );
                })}
                {rows && shown.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">Nimeni nu a adus încă pacienți prin link.</TableCell></TableRow>}
                {!rows && !error && <TableRow><TableCell colSpan={10} className="py-8 text-center text-slate-500">Se încarcă...</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">Sumele sunt bani reali, fără bonusuri. „Cheltuit” numără doar consultațiile încheiate, pachetele și serviciile plătite; banii rezervați pentru consultații încă deschise apar separat în detaliu. „Venit platformă” e comisionul platformei plus pachetele și reactivările de chat.</p>
    </div>
  );
}
