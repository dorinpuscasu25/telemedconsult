import { useEffect, useMemo, useState } from 'react';
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
  active_count: number;
  topups_total: number;
  earned_total: number;
};

const ROLE_FILTERS: Array<[string, string]> = [['operator', 'Operatori'], ['doctor', 'Medici'], ['patient', 'Pacienți'], ['', 'Toți']];
const ROLE_LABELS: Record<string, string> = { operator: 'Operator', doctor: 'Medic', patient: 'Pacient', admin: 'Admin', coordinator: 'Coordonator' };

/** Cât a adus fiecare invitator (operator, medic, pacient) prin linkul de afiliere. */
export function ReferralStatsPage() {
  const [role, setRole] = useState('operator');
  const [rows, setRows] = useState<ReferrerRow[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    apiRequest<{ data: ReferrerRow[] }>(`/admin/referral-stats${role ? `?role=${role}` : ''}`)
      .then((response) => setRows(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca statistica.'));
  }, [role]);

  const shown = useMemo(() => (rows ?? []).filter((row) => `${row.name} ${row.email} ${row.code ?? ''}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const totals = shown.reduce((sum, row) => ({ invited: sum.invited + row.invited_count, active: sum.active + row.active_count, topups: sum.topups + row.topups_total, earned: sum.earned + row.earned_total }), { invited: 0, active: 0, topups: 0, earned: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Afiliere</h1>
        <p className="text-slate-500">Câți utilizatori a adus fiecare invitator prin linkul personal și cât au alimentat aceștia.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => setRole(value)} className={`rounded-xl border px-3 py-2 text-sm font-medium ${role === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-blue-50'}`}>{label}</button>
          ))}
        </div>
        <Input placeholder="Caută după nume, email sau cod..." value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-xl bg-white/60 sm:w-80" />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {([['Utilizatori aduși', String(totals.invited)], ['Au alimentat', String(totals.active)], ['Total alimentat de invitați', `${money(totals.topups)} MDL`], ['Bonusuri acordate (3%)', `${money(totals.earned)} puncte`]] as Array<[string, string]>).map(([label, value]) => (
          <Card key={label} className="glass-card border-0"><CardContent className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-semibold text-slate-900">{value}</p></CardContent></Card>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Card className="glass-card border-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invitator</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Cod</TableHead>
                  <TableHead className="text-right">Aduși</TableHead>
                  <TableHead className="text-right">Au alimentat</TableHead>
                  <TableHead className="text-right">Alimentat (MDL)</TableHead>
                  <TableHead className="text-right">Bonusuri primite</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><p className="font-medium text-slate-900">{row.name}</p><p className="text-xs text-slate-500">{row.email}</p></TableCell>
                    <TableCell className="text-sm">{row.roles.map((item) => ROLE_LABELS[item] ?? item).join(', ')}</TableCell>
                    <TableCell className="font-mono text-xs">{row.code ?? '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{row.invited_count}</TableCell>
                    <TableCell className="text-right">{row.active_count}</TableCell>
                    <TableCell className="text-right">{money(row.topups_total)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{money(row.earned_total)}</TableCell>
                  </TableRow>
                ))}
                {rows && shown.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-500">Nimeni nu a adus încă utilizatori prin link.</TableCell></TableRow>}
                {!rows && !error && <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-500">Se încarcă...</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
