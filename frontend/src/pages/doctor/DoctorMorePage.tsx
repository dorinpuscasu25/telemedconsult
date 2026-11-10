import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { NotificationBell } from '../../components/NotificationBell';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { mdl } from '../../lib/doctor';
import { useShellCounts } from '../../lib/use-shell-counts';

const MONTH = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

/** MBc: pe telefon, Statisticile, Noutățile și Telegramul stau în „Mai mult”. */
export function DoctorMorePage() {
  const { logout } = useAuth();
  const { unreadNews, telegramLinked } = useShellCounts(true, 'doctor');
  const [stats, setStats] = useState<{ balance: number; month: number } | null>(null);

  useEffect(() => {
    document.title = 'Mai mult · telemedconsult.md';
    apiRequest<{ summary: { available_balance: number; current_month_revenue: number } }>('/doctor/stats')
      .then((response) => setStats({ balance: response.summary.available_balance, month: response.summary.current_month_revenue }))
      .catch(() => undefined);
  }, []);

  return (
    <div className="-mx-4 -mt-5 min-h-[calc(100dvh-72px)] bg-slate-50 px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between pb-2.5 pt-4">
        <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">Mai mult</h1>
        <NotificationBell bare />
      </div>
      <div className="flex flex-col gap-3.5 py-2">
        <div className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-slate-300">Balanță disponibilă</span>
            <span className="text-[22px] font-bold">{stats ? mdl(stats.balance) : '—'}</span>
          </div>
          <Link to="/doctor/stats?withdraw=1" className="flex h-9 items-center rounded-[10px] bg-white px-3 text-[13px] font-semibold text-slate-900">Extrage</Link>
        </div>

        <Group>
          <Row to="/doctor/stats" title="Statistici și venituri" sub={stats ? `${MONTH[new Date().getMonth()]}: ${mdl(stats.month)}` : undefined} />
          <Row to="/doctor/noutati" title="Noutăți" sub={unreadNews ? `${unreadNews} ${unreadNews === 1 ? 'anunț necitit' : 'anunțuri necitite'}` : 'Anunțuri de la platformă'}
            dot={unreadNews > 0} />
          <Row to="/doctor/telegram" title="Notificări Telegram" sub={telegramLinked ? 'Conectat' : 'Neconectat'} />
        </Group>

        <Group>
          <Link to="/doctor/profile" className="block px-4 py-3.5 text-[15px] font-medium text-slate-950 hover:bg-slate-50">Setările contului</Link>
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
      {dot && <span className="h-2 w-2 rounded-full bg-blue-600" />}
      <ChevronRight className="h-[18px] w-[18px] text-slate-400" />
    </Link>
  );
}
