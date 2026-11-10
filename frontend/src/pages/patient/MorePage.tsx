import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Gift, LogOut, MessageSquareWarning, Newspaper, Send, Settings, Users } from 'lucide-react';
import { NotificationBell } from '../../components/NotificationBell';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { useSiteContent } from '../../contexts/SiteContentContext';
import { apiRequest } from '../../lib/api';
import { useShellCounts } from '../../lib/use-shell-counts';

type ProfileSummary = { patient_profiles: unknown[]; card_purchases?: Array<{ available_slots: number }> };

/** N2b: „Mai mult” pe telefon — pacienții, afilierea, reclamațiile, noutățile, Telegramul și contul. */
export function MorePage() {
  const { user, logout } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const { text } = useSiteContent();
  const { telegramLinked } = useShellCounts(true);
  const [profiles, setProfiles] = useState<ProfileSummary | null>(null);
  const [commission, setCommission] = useState<number | null>(null);
  const affiliate = isEnabled('affiliate_program');

  useEffect(() => {
    document.title = 'Mai mult · telemedconsult.md';
    apiRequest<ProfileSummary>('/patient/profile').then(setProfiles).catch(() => undefined);
    if (affiliate) apiRequest<{ commission_rate: number }>('/patient/referrals').then((response) => setCommission(response.commission_rate)).catch(() => undefined);
  }, [affiliate]);

  const count = profiles?.patient_profiles.length ?? 0;
  const free = (profiles?.card_purchases ?? []).reduce((sum, item) => sum + item.available_slots, 0);
  const initials = (user?.name || '?').split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();

  return (
    <div className="-mx-4 -mt-5 min-h-[calc(100dvh-72px)] bg-slate-50 px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between pb-2.5 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Mai mult</h1>
        <NotificationBell bare />
      </div>
      <div className="flex flex-col gap-3.5 py-2">
        <Link to="/patient/profile?tab=account" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{initials}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-base font-semibold text-slate-950">{user?.name}</span><span className="truncate text-[13px] text-slate-500">{user?.email}</span></span>
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </Link>

        <Group>
          <Row to="/patient/profile" icon={<Users className="h-5 w-5" />} title="Pacienții mei" sub={profiles ? `${count} ${count === 1 ? 'pacient' : 'pacienți'}${free ? ` · ${free} ${free === 1 ? 'loc liber' : 'locuri libere'}` : ''}` : undefined} />
        </Group>

        <Group>
          {affiliate && <Row to="/patient/profile?tab=referrals" icon={<Gift className="h-5 w-5" />} title="Program de afiliere" sub={commission ? `${commission}% din alimentările celor invitați` : 'Invită pe cineva și primești bonusuri'} />}
          <Row to="/patient/complaints" icon={<MessageSquareWarning className="h-5 w-5" />} title="Reclamații și recenzii" sub="Scrie-ne dacă ceva n-a fost în regulă" />
          <Row to="/patient/noutati" icon={<Newspaper className="h-5 w-5" />} title={text('header.nav_news')} sub="Articole și ghiduri" />
          <Row to="/patient/telegram" icon={<Send className="h-5 w-5" />} title="Notificări Telegram" sub={telegramLinked ? 'Conectat' : 'Neconectat'}
            end={telegramLinked === false ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Conectează</span> : undefined} />
        </Group>

        <Group>
          <Row to="/patient/profile?tab=account" icon={<Settings className="h-5 w-5" />} title="Setările contului" />
          <button type="button" onClick={logout} className="flex w-full items-center gap-3.5 border-t border-slate-100 px-4 py-3.5 text-left text-slate-700">
            <LogOut className="h-5 w-5" /><span className="flex-1 text-[15px] font-medium text-slate-950">Ieși din cont</span>
          </button>
        </Group>
      </div>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white [&>*:first-child]:border-t-0">{children}</div>;
}

function Row({ to, icon, title, sub, end }: { to: string; icon: ReactNode; title: string; sub?: string; end?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3.5 border-t border-slate-100 px-4 py-3.5 text-slate-700 hover:bg-slate-50">
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-medium text-slate-950">{title}</span>{sub && <span className="text-xs text-slate-500">{sub}</span>}</span>
      {end ?? <ChevronRight className="h-5 w-5 text-slate-400" />}
    </Link>
  );
}
