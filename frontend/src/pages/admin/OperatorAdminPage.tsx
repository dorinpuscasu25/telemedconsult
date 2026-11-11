import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { apiRequest } from '../../lib/api';
import { dateOnly, dateTime, money } from '../../lib/format';
import { ReferralReferrerPage } from './ReferralReferrerPage';

type Operator = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  telegram_linked: boolean;
  referral_code: string | null;
  profile: { region: string | null; locality: string | null; is_approved: boolean; is_available: boolean; contract_number: string | null; has_device_subscription: boolean } | null;
  visits: { total: number; in_progress: number; exams_done: number; completed: number; cancelled: number; last_at: string | null };
  earnings: { visits_total: number; this_month: number };
};

type Wallet = {
  balance: number;
  points_balance: number;
  promo_balance: number;
  currency: string;
  transactions: Array<{ id: string; date: string; amount: number; wallet_type: 'real' | 'points' | 'promo'; type: string; description: string; admin: string | null }>;
};

const TABS = [['patients', 'Pacienți aduși'], ['wallet', 'Portofel'], ['visits', 'Vizite']] as const;
type Tab = (typeof TABS)[number][0];
const WALLET_LABELS = { real: 'Lei', points: 'Bonus', promo: 'Promo' } as const;

/**
 * Un operator în admin, pe o singură pagină: contul și zona, soldurile,
 * pacienții aduși (cu perioada aleasă) și vizitele. De aici se decide plata.
 */
export function OperatorAdminPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'patients') as Tab;
  const [operator, setOperator] = useState<Operator | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    apiRequest<{ data: Operator }>(`/admin/operators/${id}`).then((response) => setOperator(response.data)).catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca operatorul.'));
    apiRequest<{ data: Wallet }>(`/admin/users/${id}/wallet`).then((response) => setWallet(response.data)).catch(() => undefined);
  }, [id]);

  const setTab = (next: Tab) => {
    const merged = new URLSearchParams(params);
    merged.set('tab', next);
    setParams(merged, { replace: true });
  };

  const place = [operator?.profile?.locality, operator?.profile?.region].filter((item, index, list) => item && list.indexOf(item) === index).join(', ');

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/operators" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Operatori</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{operator?.name ?? 'Operator'}</h1>
          {operator && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${operator.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{operator.status === 'active' ? 'Activ' : operator.status === 'pending' ? 'Așteaptă aprobarea' : 'Blocat'}</span>}
        </div>
        {operator && (
          <p className="mt-1 text-slate-500">
            {[operator.email, operator.phone, place || null, `din ${dateOnly(operator.created_at)}`, operator.telegram_linked ? 'Telegram conectat' : 'fără Telegram'].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Sold în lei" value={wallet ? `${money(wallet.balance)} ${wallet.currency}` : null} />
        <Tile label="Bonusuri" value={wallet ? money(wallet.points_balance) : null} hint="din afiliere și promoții" />
        <Tile label="Câștigat din vizite" value={operator ? `${money(operator.earnings.visits_total)} MDL` : null} hint={operator ? `${money(operator.earnings.this_month)} MDL luna aceasta` : undefined} />
        <Tile label="Vizite" value={operator ? String(operator.visits.total) : null} hint={operator ? `${operator.visits.exams_done} examinări făcute` : undefined} />
        <Tile label="Cod de afiliere" value={operator ? (operator.referral_code ?? '—') : null} mono />
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 sm:w-fit">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium sm:flex-none ${tab === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>

      {tab === 'patients' && <ReferralReferrerPage userId={id} embedded />}

      {tab === 'wallet' && (
        <Card className="glass-card border-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Operațiune</TableHead>
                    <TableHead>Portofel</TableHead>
                    <TableHead className="text-right">Suma</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(wallet?.transactions ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-sm">{dateTime(item.date)}</TableCell>
                      <TableCell><p className="text-sm text-slate-900">{item.description}</p>{item.admin && <p className="text-xs text-slate-500">de {item.admin}</p>}</TableCell>
                      <TableCell className="text-sm">{WALLET_LABELS[item.wallet_type] ?? item.wallet_type}</TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${item.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{item.amount > 0 ? '+' : ''}{money(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {wallet && wallet.transactions.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-500">Nicio operațiune în portofel.</TableCell></TableRow>}
                  {!wallet && <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-500">Se încarcă...</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {tab === 'wallet' && <p className="text-xs text-slate-500">Ultimele 30 de operațiuni. Bonusurile se ajustează din Utilizatori → Portofel.</p>}

      {tab === 'visits' && operator && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="În lucru acum" value={String(operator.visits.in_progress)} />
          <Tile label="Examinări făcute" value={String(operator.visits.exams_done)} />
          <Tile label="Consultații încheiate" value={String(operator.visits.completed)} />
          <Tile label="Anulate sau expirate" value={String(operator.visits.cancelled)} hint={operator.visits.last_at ? `ultima activitate ${dateOnly(operator.visits.last_at)}` : undefined} />
          {operator.profile && (
            <Card className="glass-card border-0 sm:col-span-2 lg:col-span-4">
              <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-4">
                <Info label="Zona" value={place || '—'} />
                <Info label="Aprobat" value={operator.profile.is_approved ? 'Da' : 'Nu'} />
                <Info label="Disponibil" value={operator.profile.is_available ? 'Da' : 'Nu'} />
                <Info label="Contract" value={operator.profile.contract_number || '—'} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint, mono = false }: { label: string; value: string | null; hint?: string; mono?: boolean }) {
  return (
    <Card className="glass-card border-0">
      <CardContent className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`mt-1 truncate font-semibold text-slate-900 ${mono ? 'font-mono text-sm' : 'text-xl'}`}>{value ?? '…'}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="font-medium text-slate-900">{value}</p></div>;
}
