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
  Menu,
  MessageSquare,
  MessageSquareWarning,
  Newspaper,
  Plane,
  Plus,
  Send,
  Settings,
  Stethoscope,
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
import { useShellCounts } from '../lib/use-shell-counts';
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
        { label: 'Afiliere', path: '/operator/referrals', icon: Gift },
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
  const initials = (user?.name || '?').split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();
  const profilePath = role === 'patient' ? '/patient/profile?tab=account' : role === 'institution' ? '/institution/settings' : `/${role}/profile`;
  const { unreadMessages, telegramLinked } = useShellCounts(Boolean(role) && role !== 'admin');
  const badgeFor = (item: NavItem) => (item.path.endsWith('/chat') ? unreadMessages : 0);
  const dotFor = (item: NavItem) => item.path.endsWith('/telegram') && telegramLinked === false;

  // Chatul ocupă tot spațiul, fără antet și fără margini (C1a / C2a).
  const bleed = location.pathname.endsWith('/chat');
  const ownMobileHeader = bleed || location.pathname === '/patient/more' || location.pathname.startsWith('/patient/patients/');
  // Conversația deschisă pe telefon ocupă tot ecranul (C2b).
  const chatParams = new URLSearchParams(location.search);
  const fullScreenChat = role === 'patient' && bleed && ['doctor', 'operator', 'conversation', 'request'].some((key) => chatParams.has(key));
  // În asistentul de pornire (5a/5b) bara cu pașii ține locul antetului.
  const wizardHeader = location.pathname === '/patient/doctors' && chatParams.get('from') === 'start';

  // Pe telefon pacientul are patru pagini și „Mai mult” (N2b).
  const mobileItems: NavItem[] = role === 'patient'
    ? [...navItems.filter((item) => item.path !== '/patient/profile'), { label: 'Mai mult', path: '/patient/more', icon: Menu }]
    : navItems;

  const accountMenu = (
    <DropdownMenuContent align="end" side="top" className="w-60">
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
        <Settings className="mr-2 h-4 w-4" />
        {role === 'patient' ? 'Setările contului' : 'Profilul meu'}
      </DropdownMenuItem>
      {role === 'doctor' && (
        <DropdownMenuItem onClick={() => navigate('/doctor/profile?vacations=1')} className="cursor-pointer">
          <Plane className="mr-2 h-4 w-4" />
          Concediu și disponibilitate
        </DropdownMenuItem>
      )}
      {role !== 'patient' && moreItems.map((item) => (
        <DropdownMenuItem key={item.path} onClick={() => navigate(item.path)} className="cursor-pointer lg:hidden">
          <item.icon className="mr-2 h-4 w-4" />
          {item.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600 focus:text-red-600">
        <LogOut className="mr-2 h-4 w-4" />
        Ieși din cont
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const logo = (size: 'lg' | 'sm') => (
    <Link to={`/${role}`} className="flex items-center gap-2 lg:gap-2.5">
      <span className={cn('grid place-items-center bg-blue-600 text-white', size === 'lg' ? 'h-8 w-8 rounded-[9px]' : 'h-7 w-7 rounded-lg')}>
        <Activity className={size === 'lg' ? 'h-[18px] w-[18px]' : 'h-4 w-4'} />
      </span>
      <span className={cn('font-bold text-slate-950', size === 'lg' ? 'text-[15px]' : 'text-sm')}>telemedconsult<span className="text-blue-600">.md</span></span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Meniul lateral — desktop (N1a) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-slate-200 bg-white lg:flex" aria-label="Navigație principală">
        <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-4">{logo('lg')}</div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {role === 'patient' && doctorsEnabled && (
            <div className="px-3 pb-2 pt-4">
              <Link to="/patient/doctors" className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
                <Plus className="h-4 w-4" />Consultație nouă
              </Link>
            </div>
          )}

          <nav className="flex flex-col gap-0.5 px-3 py-2">
            {navItems.map((item) => <SidebarLink key={item.path} item={item} active={isActive(item.path)} badge={badgeFor(item)} />)}
          </nav>

          {moreItems.length > 0 && (
            <>
              <p className="px-6 pb-1.5 pt-4 text-[11px] font-semibold tracking-[.06em] text-slate-400">MAI MULT</p>
              <nav className="flex flex-col gap-0.5 px-3">
                {moreItems.map((item) => <SidebarLink key={item.path} item={item} active={isActive(item.path)} dot={dotFor(item)} />)}
              </nav>
            </>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 border-t border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600/40">
            <Avatar className="size-9">
              {user?.avatar && <AvatarImage src={user.avatar} />}
              <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-600">{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-slate-950">{user?.name}</span>
              <span className="text-xs text-slate-500">{role ? ROLE_LABELS[role] : ''}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </DropdownMenuTrigger>
          {accountMenu}
        </DropdownMenu>
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-[232px]">
        {/* Antetul: pe desktop doar clopoțelul; pe telefon logo + clopoțel. */}
        <header className={cn('sticky top-0 z-20 border-b border-slate-200 bg-white', bleed && 'lg:hidden', ownMobileHeader && 'max-lg:hidden', wizardHeader && 'hidden')}>
          <div className="flex h-14 items-center justify-between gap-3 pl-4 pr-2 pt-[env(safe-area-inset-top)] lg:h-16 lg:justify-end lg:px-6">
            <span className="lg:hidden">{logo('sm')}</span>
            <span className="lg:hidden"><NotificationBell bare /></span>
            <span className="hidden lg:block"><NotificationBell /></span>
          </div>
        </header>

        {role !== 'patient' && <ActiveConsultationBanner />}
        <main className={cn('w-full min-w-0 flex-1', bleed ? (fullScreenChat ? '' : 'pb-[calc(60px+max(12px,env(safe-area-inset-bottom)))] lg:pb-0') : 'px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-7')}>
          {/* Boundary per pagină: o pagină care crapă nu mai omoară navigația.
              `key` resetează boundary-ul la fiecare schimbare de rută. */}
          <ErrorBoundary inline key={location.pathname} label={`app:${location.pathname}`}>
            {role !== 'patient' && <TelegramConnectionBanner />}
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Navigația de jos — telefon */}
      <nav className={cn('fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden', fullScreenChat && 'hidden')} aria-label="Navigație principală">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
          {mobileItems.map((item) => {
            const active = isActive(item.path) || (item.path === '/patient/more' && ['/patient/profile', '/patient/patients', '/patient/complaints', '/patient/noutati', '/patient/telegram'].some((path) => location.pathname.startsWith(path)));
            const badge = badgeFor(item);
            return (
              <Link key={item.path} to={item.path} aria-current={active ? 'page' : undefined}
                className={cn('relative flex h-[60px] flex-col items-center justify-center gap-[3px] text-[11px]', active ? 'font-semibold text-blue-600' : 'text-slate-500')}>
                <item.icon className="h-5 w-5" />
                <span className="max-w-full truncate px-1">{item.mobileLabel ?? item.label}</span>
                {badge > 0 && <span className="absolute left-[calc(50%+6px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SidebarLink({ item, active, badge = 0, dot = false }: { item: NavItem; active: boolean; badge?: number; dot?: boolean }) {
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      className={cn('flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors', active ? 'bg-blue-50 font-medium text-blue-600' : 'text-slate-700 hover:bg-slate-50')}>
      <item.icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-blue-600' : 'text-slate-500')} />
      <span className="flex-1 whitespace-nowrap">{item.label}</span>
      {badge > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>}
      {dot && <span title="Neconectat" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
    </Link>
  );
}
