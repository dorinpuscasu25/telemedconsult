import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RoleName, useAuth } from '../contexts/AuthContext';
import { useFeatureFlags, type FeatureKey } from '../contexts/FeatureFlagsContext';
import { useSiteContent } from '../contexts/SiteContentContext';
import {
  Activity,
  BarChart2,
  Building2,
  Check,
  ChevronDown,
  ClipboardList,
  Gift,
  Home,
  LogOut,
  MessageSquare,
  MessageSquareWarning,
  Newspaper,
  Plane,
  Plus,
  Send,
  Stethoscope,
  User,
  UserRound,
  Users,
  Wallet,
  type LucideIcon
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/dropdown-menu';
import { NotificationBell } from '../components/NotificationBell';
import { TelegramConnectionBanner } from '../components/TelegramConnectionBanner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ActiveConsultationBanner } from '../components/ActiveConsultationBanner';
import { cn } from '../components/ui/utils';

const ROLE_LABELS: Record<RoleName, string> = {
  admin: 'Admin',
  patient: 'Pacient',
  doctor: 'Medic',
  operator: 'Operator',
  coordinator: 'Coordonator',
  institution: 'Instituție medicală'
};

const roleHome = (role: RoleName) => role === 'admin' ? '/admin' : `/${role}`;

type NavItem = { label: string; path: string; icon: LucideIcon; feature?: FeatureKey; mobileLabel?: string };

/**
 * Navigația principală are cel mult cinci destinații pe rol — exact cât încape
 * în bara de jos pe telefon. Restul (afiliere, reclamații, noutăți, Telegram)
 * stă în secțiunea „Mai mult” și în meniul contului.
 */
function primaryNav(role: RoleName | null): NavItem[] {
  switch (role) {
    case 'patient':
      return [
        { label: 'Acasă', path: '/patient', icon: Home },
        { label: 'Consultații', path: '/patient/consultations', icon: ClipboardList },
        { label: 'Mesaje', path: '/patient/chat', icon: MessageSquare },
        { label: 'Pacienții mei', path: '/patient/profile', icon: Users, mobileLabel: 'Pacienți' },
        { label: 'Portofel', path: '/patient/wallet', icon: Wallet, feature: 'payments' }
      ];
    case 'doctor':
      return [
        { label: 'Acasă', path: '/doctor', icon: Home },
        { label: 'Consultații', path: '/doctor/consultations', icon: ClipboardList },
        { label: 'Mesaje', path: '/doctor/chat', icon: MessageSquare },
        { label: 'Statistici', path: '/doctor/stats', icon: BarChart2 },
        { label: 'Profil', path: '/doctor/profile', icon: UserRound }
      ];
    case 'institution':
      return [
        { label: 'Acasă', path: '/institution', icon: Home },
        { label: 'Medici', path: '/institution/doctors', icon: Stethoscope },
        { label: 'Plăți', path: '/institution/payouts', icon: Wallet },
        { label: 'Setări', path: '/institution/settings', icon: Building2 }
      ];
    case 'operator':
      return [
        { label: 'Acasă', path: '/operator', icon: Home },
        { label: 'Vizite', path: '/operator/patients', icon: ClipboardList },
        { label: 'Mesaje', path: '/operator/chat', icon: MessageSquare },
        { label: 'Profil', path: '/operator/profile', icon: UserRound }
      ];
    default:
      return [];
  }
}

function secondaryNav(role: RoleName | null, newsLabel: string): NavItem[] {
  const items: NavItem[] = [];
  if (role === 'patient') {
    items.push({ label: 'Program de afiliere', path: '/patient/profile?tab=referrals', icon: Gift, feature: 'affiliate_program' });
    items.push({ label: 'Reclamații și recenzii', path: '/patient/complaints', icon: MessageSquareWarning });
  }
  if (role) {
    items.push({ label: newsLabel, path: `/${role}/noutati`, icon: Newspaper });
    items.push({ label: 'Notificări Telegram', path: `/${role}/telegram`, icon: Send });
  }
  return items;
}

export function AppLayout() {
  const { user, logout, role, roles, switchRole } = useAuth();
  const { isEnabled } = useFeatureFlags();
  const { text } = useSiteContent();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSwitchRole = async (nextRole: RoleName) => {
    await switchRole(nextRole);
    navigate(roleHome(nextRole));
  };

  const visible = (item: NavItem) => !item.feature || isEnabled(item.feature);
  const navItems = primaryNav(role).filter(visible);
  const moreItems = secondaryNav(role, text('header.nav_news')).filter(visible);

  const isActive = (target: string) => {
    const [targetPath, targetQuery = ''] = target.split('?');
    const pathMatches = location.pathname === targetPath ||
      (location.pathname.startsWith(`${targetPath}/`) && targetPath !== `/${role}`);
    if (!pathMatches) return false;

    const targetTab = new URLSearchParams(targetQuery).get('tab');
    const currentTab = new URLSearchParams(location.search).get('tab');
    if (targetTab) return currentTab === targetTab;
    if (targetPath === '/patient/profile') return !['referrals', 'account'].includes(currentTab ?? '');
    return true;
  };

  const doctorsEnabled = isEnabled('doctors');
  const operatorsEnabled = isEnabled('operators');
  const initials = (user?.name || '?').split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
  const profilePath = role === 'patient' ? '/patient/profile?tab=account' : role === 'institution' ? '/institution/settings' : `/${role}/profile`;

  const accountMenu = (
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuLabel className="normal-case">
        <span className="block truncate text-sm font-semibold text-slate-900">{user?.name}</span>
        <span className="block truncate text-xs font-normal text-slate-500">{user?.email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {roles.length > 1 && (
        <>
          <DropdownMenuLabel>Schimbă rolul</DropdownMenuLabel>
          {roles.map((item) => (
            <DropdownMenuItem key={item} onClick={() => handleSwitchRole(item)} className="cursor-pointer">
              <span className="flex-1">{ROLE_LABELS[item]}</span>
              {role === item && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={() => navigate(profilePath)} className="cursor-pointer">
        <User className="mr-2 h-4 w-4" />
        {role === 'patient' ? 'Datele contului' : 'Profilul meu'}
      </DropdownMenuItem>
      {role === 'doctor' && (
        <DropdownMenuItem onClick={() => navigate('/doctor/profile?vacations=1')} className="cursor-pointer">
          <Plane className="mr-2 h-4 w-4" />
          Concediu și disponibilitate
        </DropdownMenuItem>
      )}
      {moreItems.map((item) => (
        <DropdownMenuItem key={item.path} onClick={() => navigate(item.path)} className="cursor-pointer lg:hidden">
          <item.icon className="mr-2 h-4 w-4" />
          {item.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 focus:text-red-600">
        <LogOut className="mr-2 h-4 w-4" />
        Deconectare
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const newConsultationButton = role === 'patient' && (doctorsEnabled || operatorsEnabled) && (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <Plus className="h-4 w-4" />
        Consultație nouă
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {doctorsEnabled && (
          <DropdownMenuItem onClick={() => navigate('/patient/doctors')} className="cursor-pointer items-start gap-3 py-2.5">
            <Stethoscope className="mt-0.5 h-4 w-4 text-primary" />
            <span><span className="block font-semibold text-slate-900">Consultație cu un medic</span><span className="block text-xs text-slate-500">Online, cu sau fără examinare</span></span>
          </DropdownMenuItem>
        )}
        {operatorsEnabled && (
          <DropdownMenuItem onClick={() => navigate('/patient/operators')} className="cursor-pointer items-start gap-3 py-2.5">
            <Activity className="mt-0.5 h-4 w-4 text-primary" />
            <span><span className="block font-semibold text-slate-900">Examinare la domiciliu</span><span className="block text-xs text-slate-500">Un operator vine la pacient</span></span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="app-bg min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex" aria-label="Navigație principală">
        <Link to={`/${role}`} className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-100 px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white shadow-sm">
            <Activity className="h-5 w-5" />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">telemedconsult<span className="text-primary">.md</span></span>
        </Link>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
          {newConsultationButton && <div className="px-1">{newConsultationButton}</div>}

          <nav className="space-y-0.5">
            {navItems.map((item) => <SidebarLink key={item.path} item={item} active={isActive(item.path)} />)}
          </nav>

          {moreItems.length > 0 && (
            <div>
              <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Mai mult</p>
              <nav className="space-y-0.5">
                {moreItems.map((item) => <SidebarLink key={item.path} item={item} active={isActive(item.path)} subtle />)}
              </nav>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Avatar className="size-9">
                {user?.avatar && <AvatarImage src={user.avatar} />}
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{user?.name}</span>
                <span className="block text-xs text-slate-500">{role ? ROLE_LABELS[role] : ''}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </DropdownMenuTrigger>
            {accountMenu}
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
            <Link to={`/${role}`} className="flex items-center gap-2 lg:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">
                <Activity className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold tracking-tight text-slate-900">telemedconsult<span className="text-primary">.md</span></span>
            </Link>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-2">
              {role === 'patient' && doctorsEnabled && (
                <Link to="/patient/doctors" className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white lg:hidden" aria-label="Consultație nouă">
                  <Plus className="h-5 w-5" />
                </Link>
              )}
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 lg:hidden" aria-label="Meniul contului">
                  <Avatar className="size-9">
                    {user?.avatar && <AvatarImage src={user.avatar} />}
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                {accountMenu}
              </DropdownMenu>
            </div>
          </div>
        </header>

        <ActiveConsultationBanner />
        <main className="w-full min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {/* Boundary per pagină: o pagină care crapă nu mai omoară navigația.
              `key` resetează boundary-ul la fiecare schimbare de rută. */}
          <ErrorBoundary inline key={location.pathname} label={`app:${location.pathname}`}>
            <TelegramConnectionBanner />
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Bara de jos — mobil */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navigație principală">
        <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors', active ? 'text-primary' : 'text-slate-500 hover:text-slate-900')}>
                <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', active && 'bg-primary/10')}>
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="max-w-full truncate px-1">{item.mobileLabel ?? item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({ item, active, subtle = false }: { item: NavItem; active: boolean; subtle?: boolean }) {
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active ? 'bg-primary/10 text-primary' : subtle ? 'text-slate-500 hover:bg-slate-50 hover:text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}>
      <item.icon className={cn('h-[18px] w-[18px]', active ? 'text-primary' : 'text-slate-400')} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
