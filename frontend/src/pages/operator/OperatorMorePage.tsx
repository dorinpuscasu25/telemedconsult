import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { NotificationBell } from '../../components/NotificationBell';
import { useAuth } from '../../contexts/AuthContext';
import { useShellCounts } from '../../lib/use-shell-counts';
import { loadOperatorReferrals, type OperatorReferrals } from './OperatorReferralsPage';

/** Pe telefon, Pacienții aduși, Noutățile și Telegramul stau în „Mai mult”. */
export function OperatorMorePage() {
  const { logout } = useAuth();
  const { telegramLinked } = useShellCounts(true, 'operator');
  const [referrals, setReferrals] = useState<OperatorReferrals | null>(null);

  useEffect(() => {
    document.title = 'Mai mult · telemedconsult.md';
    loadOperatorReferrals().then(setReferrals).catch(() => undefined);
  }, []);

  return (
    <div className="-mx-4 -mt-5 min-h-[calc(100dvh-72px)] bg-slate-50 px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between pb-2.5 pt-4">
        <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">Mai mult</h1>
        <NotificationBell bare />
      </div>
      <div className="flex flex-col gap-3.5 py-2">
        <Link to="/operator/referrals" className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-slate-300">Pacienți aduși</span>
            <span className="text-[22px] font-bold">{referrals ? referrals.stats.invited_count : '—'}</span>
            {referrals && <span className="text-xs text-slate-300">{referrals.stats.active_count} au pus bani pe cont</span>}
          </span>
          <span className="flex h-9 items-center rounded-[10px] bg-white px-3 text-[13px] font-semibold text-slate-900">Linkul meu</span>
        </Link>

        <Group>
          <Row to="/operator/referrals" title="Pacienți aduși" sub="Linkul tău și lista pacienților" />
          <Row to="/operator/noutati" title="Noutăți" sub="Anunțuri de la platformă" />
          <Row to="/operator/telegram" title="Notificări Telegram" sub={telegramLinked ? 'Conectat' : 'Neconectat'} dot={telegramLinked === false} />
        </Group>

        <Group>
          <Link to="/operator/profile" className="block px-4 py-3.5 text-[15px] font-medium text-slate-950 hover:bg-slate-50">Profilul meu</Link>
          <button type="button" onClick={logout} className="block w-full border-t border-slate-100 px-4 py-3.5 text-left text-[15px] font-medium text-slate-950 hover:bg-slate-50">Ieși din cont</button>
        </Group>
      </div>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white [&>*:first-child]:border-t-0">{children}</div>;
}

function Row({ to, title, sub, dot }: { to: string; title: string; sub?: string; dot?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-3.5 border-t border-slate-100 px-4 py-3.5 hover:bg-slate-50">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-medium text-slate-950">{title}</span>{sub && <span className="text-xs text-slate-500">{sub}</span>}</span>
      {dot && <span className="h-2 w-2 rounded-full bg-amber-500" />}
      <ChevronRight className="h-[18px] w-[18px] text-slate-400" />
    </Link>
  );
}
