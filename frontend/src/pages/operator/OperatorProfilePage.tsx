import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePageTitle } from '../../lib/use-page-title';
import { Avatar } from '../doctor/DoctorHome';

/**
 * Profilul operatorului. Datele contului le modifică administratorul, așa că
 * pagina e de consultare, cu scurtături spre setările personale.
 */
export function OperatorProfilePage() {
  usePageTitle('Profil');
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950 lg:text-[28px]">Profilul meu</h1>

      <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        {user?.avatar ? <img src={user.avatar} alt="" className="h-14 w-14 rounded-full object-cover" /> : <Avatar name={user?.name ?? '?'} size={56} />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-lg font-bold text-slate-950">{user?.name}</span>
          <span className="text-[13px] text-slate-500">Operator · examinări la domiciliu</span>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Group title="DATELE CONTULUI">
          <Info label="Nume" value={user?.name} />
          <Info label="Email" value={user?.email} />
          <Info label="Telefon" value={user?.phone || 'Necompletat'} />
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Pentru a schimba aceste date, scrie administratorului platformei.</p>
        </Group>

        <Group title="SETĂRI">
          <Row to="/operator/referrals" title="Pacienți aduși" sub="Linkul tău și pacienții înregistrați prin el" />
          <Row to="/operator/telegram" title="Notificări Telegram" sub="Primește cererile noi direct pe telefon" />
          <Row to="/forgot-password" title="Schimbă parola" sub="Primești un cod de resetare pe email" />
          <Row to="/operator/noutati" title="Noutăți" sub="Anunțuri de la echipa platformei" />
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="px-5 pb-2 pt-4 text-xs font-semibold tracking-[.04em] text-slate-500">{title}</div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3.5">
      <span className="w-20 shrink-0 text-[13px] text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-[15px] font-medium text-slate-950">{value || '—'}</span>
    </div>
  );
}

function Row({ to, title, sub }: { to: string; title: string; sub: string }) {
  return (
    <Link to={to} className="flex items-center gap-3.5 border-t border-slate-100 px-5 py-3.5 hover:bg-slate-50">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-medium text-slate-950">{title}</span><span className="text-xs text-slate-500">{sub}</span></span>
      <ChevronRight className="h-[18px] w-[18px] text-slate-400" />
    </Link>
  );
}
