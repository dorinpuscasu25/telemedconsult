import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RoleName, useAuth } from '../contexts/AuthContext';
import {
  Activity,
  Gift,
  LogOut,
  User,
  Wallet,
  MessageSquare,
  Home,
  Users,
  Stethoscope,
  BarChart2,
  ChevronDown,
  MoreHorizontal,
  Plane,
  MessageSquareWarning } from
'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from
'../components/ui/dropdown-menu';
import { NotificationBell } from '../components/NotificationBell';

const ROLE_LABELS: Record<RoleName, string> = {
  admin: 'Admin',
  patient: 'Pacient',
  doctor: 'Medic',
  operator: 'Operator',
  coordinator: 'Coordonator'
};

const roleHome = (role: RoleName) => role === 'admin' ? '/admin' : `/${role}`;

export function AppLayout() {
  const { user, logout, role, roles, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const handleSwitchRole = async (nextRole: RoleName) => {
    await switchRole(nextRole);
    navigate(roleHome(nextRole));
  };

  const openDoctorVacationMode = () => {
    navigate('/doctor/profile?vacations=1');
  };
  const getNavItems = () => {
    switch (role) {
      case 'patient':
        return [
        {
          label: 'Acasă',
          path: '/patient',
          icon: Home
        },
        {
          label: 'Pacienții mei',
          path: '/patient/profile',
          icon: User
        },
        {
          label: 'Afiliere',
          path: '/patient/profile?tab=referrals',
          icon: Gift
        },
        {
          label: 'Medici',
          path: '/patient/doctors',
          icon: Stethoscope
        },
        {
          label: 'Operatori',
          path: '/patient/operators',
          icon: Users
        },
        {
          label: 'Portofel',
          path: '/patient/wallet',
          icon: Wallet
        },
        {
          label: 'Chat',
          path: '/patient/chat',
          icon: MessageSquare
        },
        {
          label: 'Reclamații',
          path: '/patient/complaints',
          icon: MessageSquareWarning
        }];

      case 'doctor':
        return [
        {
          label: 'Acasă',
          path: '/doctor',
          icon: Home
        },
        {
          label: 'Consultații',
          path: '/doctor/consultations',
          icon: Users
        },
        {
          label: 'Chat',
          path: '/doctor/chat',
          icon: MessageSquare
        },
        {
          label: 'Statistici',
          path: '/doctor/stats',
          icon: BarChart2
        }];

      case 'operator':
        return [
        {
          label: 'Acasă',
          path: '/operator',
          icon: Home
        },
        {
          label: 'Pacienți',
          path: '/operator/patients',
          icon: Users
        },
        {
          label: 'Chat',
          path: '/operator/chat',
          icon: MessageSquare
        }];

      default:
        return [];
    }
  };
  const navItems = getNavItems();
  const desktopPrimaryItems = role === 'patient'
    ? navItems.filter((item) => !['Operatori', 'Chat', 'Reclamații'].includes(item.label))
    : navItems;
  const desktopMoreItems = role === 'patient'
    ? navItems.filter((item) => ['Operatori', 'Chat', 'Reclamații'].includes(item.label))
    : [];
  const isNavItemActive = (target: string) => {
    const [targetPath, targetQuery = ''] = target.split('?');
    const pathMatches = location.pathname === targetPath ||
      (location.pathname.startsWith(targetPath) && targetPath !== `/${role}`);

    if (!pathMatches) return false;

    const targetTab = new URLSearchParams(targetQuery).get('tab');
    const currentTab = new URLSearchParams(location.search).get('tab');

    if (targetTab) return currentTab === targetTab;
    if (targetPath === '/patient/profile') return !['referrals', 'account'].includes(currentTab ?? '');

    return true;
  };

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Top Navbar */}
      <header className="glass-panel sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center">
              <Link to={`/${role}`} className="flex shrink-0 items-center">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <Activity className="h-6 w-6" />
                </div>
                <span className="ml-3 hidden font-bold text-xl text-slate-900 tracking-tight md:inline">
                  telemedconsult.md
                </span>
              </Link>
              <nav className="ml-6 hidden min-w-0 items-center gap-1 xl:flex" aria-label="Navigație principală">
                {desktopPrimaryItems.map((item) => {
                  const isActive = isNavItemActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-xl px-2.5 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                      
                      <item.icon
                        className={`h-4 w-4 mr-2 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      
                      {item.label}
                    </Link>);

                })}
                {desktopMoreItems.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className={`inline-flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${desktopMoreItems.some((item) => isNavItemActive(item.path)) ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                      <MoreHorizontal className="h-4 w-4" />
                      Mai multe
                      <ChevronDown className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {desktopMoreItems.map((item) => (
                        <DropdownMenuItem key={item.path} className="cursor-pointer gap-3 px-3 py-2.5" onClick={() => navigate(item.path)}>
                          <item.icon className="h-4 w-4 text-slate-400" />
                          <span>{item.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-1.5 pr-2.5 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    <Avatar size="sm">
                      {user?.avatar && <AvatarImage src={user.avatar} />}
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {user?.name?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden max-w-32 text-left lg:block">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {user?.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {role ? ROLE_LABELS[role] : ''}
                      </p>
                    </div>
                    <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 sm:block" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>Contul meu</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {roles.length > 1 && roles.map((item) =>
                  <DropdownMenuItem
                    key={item}
                    onClick={() => handleSwitchRole(item)}
                    className="cursor-pointer flex items-center">
                    <span>{user?.role === item ? '✓ ' : ''}{ROLE_LABELS[item]}</span>
                  </DropdownMenuItem>
                  )}
                  {roles.length > 1 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => navigate(role === 'patient' ? '/patient/profile?tab=account' : `/${role}/profile`)} className="cursor-pointer flex items-center">
                      <User className="mr-2 h-4 w-4" />
                      <span>{role === 'patient' ? 'Contul meu' : 'Profil'}</span>
                  </DropdownMenuItem>
                  {role === 'doctor' &&
                  <DropdownMenuItem onClick={openDoctorVacationMode} className="cursor-pointer flex items-center">
                      <Plane className="mr-2 h-4 w-4" />
                      <span>Mod Concediu</span>
                    </DropdownMenuItem>
                  }
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="cursor-pointer text-red-600 focus:text-red-600 flex items-center">
                    
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Deconectare</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <nav
            className="flex snap-x items-center gap-2 overflow-x-auto border-t border-slate-200/70 py-2 [scrollbar-width:none] xl:hidden [&::-webkit-scrollbar]:hidden"
            aria-label="Navigație principală">
            {navItems.map((item) => {
              const isActive = isNavItemActive(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`inline-flex h-10 shrink-0 snap-start items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'bg-white/60 text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                  <item.icon className={`mr-2 h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>);

}
