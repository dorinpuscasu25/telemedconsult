import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound, Mail, Newspaper, Phone, Send, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { PageHeader } from '../../components/app/PageHeader';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Profilul operatorului. Datele contului se modifică de către administrator,
 * așa că pagina e doar de consultare, cu scurtături spre setările personale.
 */
export function OperatorProfilePage() {
  const { user } = useAuth();
  const initials = (user?.name || '?').split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader title="Profilul meu" description="Datele contului de operator și setările de notificare." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {user?.avatar && <AvatarImage src={user.avatar} />}
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-950">{user?.name}</p>
            <p className="text-sm text-slate-500">Operator · examinări la domiciliu</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
          <InfoRow icon={UserRound} label="Nume" value={user?.name} />
          <InfoRow icon={Mail} label="Email" value={user?.email} />
          <InfoRow icon={Phone} label="Telefon" value={user?.phone || 'Nu este completat'} />
        </dl>
        <p className="mt-4 text-xs text-slate-500">Pentru a modifica aceste date, contactează administratorul platformei.</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <ShortcutRow to="/operator/telegram" icon={Send} title="Notificări Telegram" description="Primește cererile noi direct pe telefon." />
        <ShortcutRow to="/forgot-password" icon={KeyRound} title="Schimbă parola" description="Primești un cod de resetare pe email." />
        <ShortcutRow to="/operator/noutati" icon={Newspaper} title="Noutăți" description="Anunțuri de la echipa platformei." />
      </section>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <dt className="w-20 shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}

function ShortcutRow({ to, icon: Icon, title, description }: { to: string; icon: React.ElementType; title: string; description: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 border-b border-slate-100 p-4 transition last:border-b-0 hover:bg-slate-50">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </Link>
  );
}
