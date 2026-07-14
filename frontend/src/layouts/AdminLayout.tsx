import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RoleName, useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Stethoscope,
  Receipt,
  MessageSquareWarning,
  FileText,
  CreditCard,
  MapPin,
  ToggleLeft,
  Newspaper,
  Handshake,
  Settings,
  LogOut,
  Activity,
  Menu } from
'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Sheet, SheetContent } from '../components/ui/sheet';
import { NotificationBell } from '../components/NotificationBell';

const ROLE_LABELS: Record<RoleName, string> = {
  admin: 'Admin',
  patient: 'Pacient',
  doctor: 'Medic',
  operator: 'Operator',
  coordinator: 'Coordonator'
};

const roleHome = (role: RoleName) => role === 'admin' ? '/admin' : `/${role}`;

export function AdminLayout() {
  const { user, logout, roles, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const handleSwitchRole = async (nextRole: RoleName) => {
    await switchRole(nextRole);
    navigate(roleHome(nextRole));
  };
  const isCoordinator = user?.role === 'coordinator';
  const navItems = isCoordinator ? [
  {
    icon: LayoutDashboard,
    label: 'Coordonare',
    path: '/coordinator'
  },
  {
    icon: Users,
    label: 'Utilizatori',
    path: '/coordinator/users'
  },
  {
    icon: Stethoscope,
    label: 'Medici',
    path: '/coordinator/doctors'
  }] : [
  {
    icon: LayoutDashboard,
    label: 'Dashboard',
    path: '/admin'
  },
  {
    icon: Users,
    label: 'Utilizatori',
    path: '/admin/users'
  },
  {
    icon: UserCheck,
    label: 'Cereri înregistrare',
    path: '/admin/registrations'
  },
  {
    icon: Stethoscope,
    label: 'Specialități',
    path: '/admin/specialties'
  },
  {
    icon: Receipt,
    label: 'Tranzacții',
    path: '/admin/transactions'
  },
  {
    icon: MessageSquareWarning,
    label: 'Reclamații',
    path: '/admin/complaints'
  },
  {
    icon: FileText,
    label: 'Contracte',
    path: '/admin/contracts'
  },
  {
    icon: CreditCard,
    label: 'Pachete / Cartele',
    path: '/admin/card-packages'
  },
  {
    icon: MapPin,
    label: 'Regiuni',
    path: '/admin/regions'
  },
  {
    icon: Activity,
    label: 'Investigații',
    path: '/admin/investigations'
  },
  {
    icon: ToggleLeft,
    label: 'Funcționalități',
    path: '/admin/features'
  },
  {
    icon: Newspaper,
    label: 'Blog',
    path: '/admin/blog'
  },
  {
    icon: Handshake,
    label: 'Parteneri',
    path: '/admin/partners'
  },
  {
    icon: Settings,
    label: 'Setări',
    path: '/admin/settings'
  }];
  const currentTitle =
    location.pathname === '/admin/operators' || location.pathname === '/admin/users' || location.pathname === '/coordinator/users' ?
    'Utilizatori' :
    navItems.find((item) => item.path === location.pathname)?.label || 'Admin Panel';

  const renderNav = (onNavigate?: () => void) => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-slate-200/50">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white shadow-md shadow-primary/20 mr-3">
          <Activity className="h-5 w-5" />
        </div>
        <span className="font-bold text-xl text-slate-900 tracking-tight">
          {isCoordinator ? 'Coordonator' : 'telemedconsult.md'}
        </span>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
          location.pathname === item.path ||
          location.pathname.startsWith(item.path) &&
          item.path !== '/admin';
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}>
              
              <item.icon
                className={`h-5 w-5 mr-3 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              
              {item.label}
            </Link>);

        })}
      </nav>

      <div className="p-4 border-t border-slate-200/50">
        <button
          onClick={logout}
          className="flex items-center w-full px-4 py-2.5 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50/80 transition-colors">
          
          <LogOut className="h-5 w-5 mr-3" />
          Deconectare
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen gradient-bg flex">
      {/* Sidebar */}
      <aside className="hidden w-64 glass-panel border-r border-slate-200/50 md:flex flex-col z-20">
        {renderNav()}
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-80 max-w-[calc(100%-2rem)] gap-0 p-0 glass-panel" showCloseButton>
          {renderNav(() => setMobileNavOpen(false))}
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {/* Top Header */}
        <header className="h-16 glass-panel border-b border-slate-200/50 flex items-center justify-between px-4 md:px-8 shrink-0 sticky top-0">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Deschide meniul"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="truncate text-lg font-semibold text-slate-800">
              {currentTitle}
            </h1>
          </div>

          <div className="flex items-center space-x-3 md:space-x-4">
            <NotificationBell />
            {roles.length > 1 &&
            <div className="hidden lg:flex items-center gap-2">
              {roles.map((item) =>
              <Button
                key={item}
                type="button"
                variant={user?.role === item ? 'default' : 'outline'}
                size="sm"
                className="rounded-lg"
                onClick={() => handleSwitchRole(item)}>
                {ROLE_LABELS[item]}
              </Button>
              )}
            </div>
            }
            <div className="flex items-center space-x-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-900">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-500 capitalize">
                  {user?.role}
                </p>
              </div>
              <Avatar>
                <AvatarImage src={user?.avatar} />
                <AvatarFallback>AD</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>);

}
