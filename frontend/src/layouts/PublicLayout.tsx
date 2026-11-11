import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, Menu, X } from 'lucide-react';
import { cn } from '../components/ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { useSiteContent } from '../contexts/SiteContentContext';
import { ErrorBoundary } from '../components/ErrorBoundary';

function dashboardPath(role: string | null, status?: string): string {
  if (status === 'pending') return '/pending';
  if (!role) return '/login';
  return role === 'admin' ? '/admin' : `/${role}`;
}

function Logo({ small = false }: { small?: boolean }) {
  const { text } = useSiteContent();
  return (
    <Link to="/" className="flex min-w-0 items-center gap-2 lg:gap-2.5">
      <span className={cn('grid shrink-0 place-items-center bg-blue-600 text-white', small ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-[9px]')}><Activity className={small ? 'h-4 w-4' : 'h-[18px] w-[18px]'} /></span>
      <span className={cn('font-bold text-slate-950', small ? 'text-sm' : 'text-base')}>{text('header.brand_name')}<span className="text-blue-600">{text('header.brand_suffix')}</span></span>
    </Link>
  );
}

/** Antetul și subsolul paginilor publice („Antet public”, „Subsol public”). */
export function PublicLayout() {
  const { isAuthenticated, role, user } = useAuth();
  const { text } = useSiteContent();
  const homeVisits = useFeatureFlags().isEnabled('with_exam_consultations');
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const target = dashboardPath(role, user?.status);

  React.useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  const navLinks = [
    { label: text('header.nav_home'), to: '/' },
    { label: text('header.nav_doctors'), to: '/medici' },
    { label: text('header.nav_news'), to: '/noutati' },
    { label: text('header.nav_partners'), to: '/parteneri' }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        {/* Desktop */}
        <div className="mx-auto hidden h-[68px] max-w-[1200px] items-center gap-8 px-10 md:flex">
          <Logo />
          <nav className="flex flex-1 gap-1">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'}
                className={({ isActive }) => cn('flex h-9 items-center rounded-lg px-3.5 text-sm', isActive ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-700 hover:bg-slate-50')}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          {isAuthenticated ? (
            <Link to={target} className="flex h-10 items-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">{text('header.cta_dashboard')}</Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="flex h-10 items-center rounded-[10px] px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50">Intră în cont</Link>
              <Link to="/register" className="flex h-10 items-center rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">{text('header.cta_register')}</Link>
            </div>
          )}
        </div>
        {/* Telefon */}
        <div className="flex items-center gap-2 py-2 pl-4 pr-2 pt-[max(8px,env(safe-area-inset-top))] md:hidden">
          <div className="flex-1"><Logo small /></div>
          {isAuthenticated
            ? <Link to={target} className="flex h-9 items-center rounded-[10px] bg-blue-600 px-3 text-[13px] font-semibold text-white">{text('header.cta_dashboard')}</Link>
            : <Link to="/login" className="flex h-9 items-center rounded-[10px] border border-slate-200 px-3 text-[13px] font-semibold text-slate-950">Intră</Link>}
          <button type="button" aria-label="Meniu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} className="grid h-11 w-11 place-items-center text-slate-700">
            {menuOpen ? <X className="h-[22px] w-[22px]" /> : <Menu className="h-[22px] w-[22px]" />}
          </button>
        </div>
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-100 px-4 pb-4 pt-2 md:hidden">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'}
                className={({ isActive }) => cn('rounded-[10px] px-3 py-3 text-[15px]', isActive ? 'bg-blue-50 font-semibold text-blue-700' : 'font-medium text-slate-700')}>
                {link.label}
              </NavLink>
            ))}
            {!isAuthenticated && <Link to="/register" className="mt-2 flex h-12 items-center justify-center rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white">{text('header.cta_register')}</Link>}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <ErrorBoundary inline>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-[22px] px-5 pb-9 pt-7 md:gap-9 md:px-10 md:pb-7 md:pt-12">
          <div className="grid grid-cols-2 gap-[18px] md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:gap-8">
            <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
              <Logo small />
              <span className="hidden max-w-[280px] text-sm leading-[1.55] text-slate-500 md:block">{homeVisits ? 'Consultații online și examinări la domiciliu, cu dispozitive HIGO.' : 'Consultații online cu medici verificați, video și în chat.'}</span>
            </div>
            <FooterColumn title="Pacienți" links={[['Caută medic', '/medici'], ['Cum funcționează', '/#cum-functioneaza'], ['Întrebări frecvente', '/#intrebari']]} />
            <FooterColumn title="Profesioniști" links={[['Înscrie-te ca medic', '/register/specialist'], ['Înscrie-te ca operator', '/register/specialist?type=operator']]} />
            <FooterColumn title="Platformă" links={[[text('header.nav_news'), '/noutati'], [text('header.nav_partners'), '/parteneri']]} />
          </div>
          <div className="text-xs text-slate-500 md:border-t md:border-slate-100 md:pt-5 md:text-[13px]">© {new Date().getFullYear()} {text('footer.copyright')}</div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <span className="font-semibold text-slate-950">{title}</span>
      {links.map(([label, to]) => <Link key={to} to={to} className="text-slate-600 hover:text-slate-950">{label}</Link>)}
    </div>
  );
}
