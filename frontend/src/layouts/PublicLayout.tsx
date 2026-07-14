import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, Menu, X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';

const NAV_LINKS = [
  { label: 'Acasă', to: '/' },
  { label: 'Blog', to: '/blog' },
  { label: 'Parteneri', to: '/parteneri' }
];

function dashboardPath(role: string | null, status?: string): string {
  if (status === 'pending') return '/pending';
  if (!role) return '/login';
  return role === 'admin' ? '/admin' : `/${role}`;
}

export function PublicLayout() {
  const { isAuthenticated, role, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const target = dashboardPath(role, user?.status);

  return (
    <div className="flex min-h-screen flex-col gradient-bg">
      <header className="sticky top-0 z-30 glass-panel border-b border-white/20">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shadow-md shadow-primary/20">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-slate-900">
              telemedconsult<span className="text-primary">.md</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`
                }>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <Button className="rounded-xl" onClick={() => navigate(target)}>
                Panoul meu
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="rounded-xl" onClick={() => navigate('/login')}>
                  Autentificare
                </Button>
                <Button className="rounded-xl bg-gradient-to-r from-primary to-purple-600 shadow-lg shadow-primary/20" onClick={() => navigate('/register')}>
                  Creează cont
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-white/60 md:hidden"
            aria-label="Meniu"
            onClick={() => setMobileOpen((open) => !open)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/20 bg-white/80 px-4 py-3 backdrop-blur-xl md:hidden">
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-4 py-2.5 text-sm font-medium ${isActive ? 'bg-primary/10 text-primary' : 'text-slate-700'}`
                  }>
                  {link.label}
                </NavLink>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-slate-200/70 pt-3">
                {isAuthenticated ? (
                  <Button className="rounded-xl" onClick={() => { setMobileOpen(false); navigate(target); }}>
                    Panoul meu
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" className="rounded-xl" onClick={() => { setMobileOpen(false); navigate('/login'); }}>
                      Autentificare
                    </Button>
                    <Button className="rounded-xl" onClick={() => { setMobileOpen(false); navigate('/register'); }}>
                      Creează cont
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="glass-panel border-t border-white/20">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 py-7 text-center text-sm text-slate-500 md:flex-row md:px-8 md:py-8 md:text-left">
          <div className="flex items-start gap-2 sm:items-center">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
            <span>© {new Date().getFullYear()} telemedconsult.md. Toate drepturile rezervate.</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="transition-colors hover:text-slate-800">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
