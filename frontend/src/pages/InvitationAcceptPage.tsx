import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, Building2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { usePageTitle } from '../lib/use-page-title';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, setToken } from '../lib/api';
import { dateTime } from '../lib/format';

interface Invitation {
  institution: string;
  email: string;
  name?: string | null;
  specialty_id?: number | null;
  specialty?: string | null;
  license_number?: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | string;
  expires_at: string;
  account_exists: boolean;
}

/**
 * Pagina din linkul de invitație. Un medic nou își creează contul aici; unul
 * existent se autentifică (cu întoarcere automată pe această pagină) și acceptă.
 */
export function InvitationAcceptPage() {
  usePageTitle('Invitație');
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState('');
  const [specialties, setSpecialties] = useState<Array<{ id: number; name: string }>>([]);
  const [form, setForm] = useState({ name: '', phone: '', specialty_id: '', license_number: '', password: '', password_confirmation: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    apiRequest<{ invitation: Invitation }>(`/institution-invitations/${token}`, { auth: false })
      .then((response) => {
        setInvitation(response.invitation);
        setForm((current) => ({ ...current, name: response.invitation.name ?? '', license_number: response.invitation.license_number ?? '' }));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Invitația nu a putut fi încărcată.'));
    apiRequest<{ data: Array<{ id: number; name: string }> }>('/catalog/specialties', { auth: false }).then((response) => setSpecialties(response.data ?? [])).catch(() => undefined);
  }, [token]);

  const signedInAsInvited = isAuthenticated && user?.email?.toLowerCase() === invitation?.email.toLowerCase();

  const accept = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = invitation?.account_exists ? {} : { ...form, specialty_id: form.specialty_id ? Number(form.specialty_id) : null, phone: form.phone || null, license_number: form.license_number || null };
      const response = await apiRequest<{ message: string; token?: string }>(`/institution-invitations/${token}/accept`, {
        method: 'POST',
        auth: Boolean(invitation?.account_exists),
        body: JSON.stringify(body)
      });
      if (response.token) setToken(response.token);
      await refreshUser();
      setDone(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut accepta invitația.');
    } finally {
      setSaving(false);
    }
  };

  const loginPath = `/login?next=${encodeURIComponent(`/invitatie/${token}`)}`;

  return (
    <div className="app-bg flex min-h-screen flex-col items-center px-4 py-10">
      <Link to="/" className="mb-8 flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white"><Activity className="h-5 w-5" /></span>
        <span className="text-lg font-bold tracking-tight text-slate-900">telemedconsult<span className="text-primary">.md</span></span>
      </Link>

      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {loadError ? (
          <Status icon={XCircle} tone="red" title="Invitația nu există" text="Linkul nu este valid. Cere instituției o invitație nouă." />
        ) : !invitation ? (
          <div className="space-y-3"><Skeleton className="h-12 w-12 rounded-2xl" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /></div>
        ) : done ? (
          <>
            <Status icon={CheckCircle2} tone="green" title="Bine ai venit!" text={done} />
            <Button className="mt-6 w-full" onClick={() => navigate('/doctor')}>Deschide panoul de medic</Button>
          </>
        ) : invitation.status === 'accepted' ? (
          <>
            <Status icon={CheckCircle2} tone="green" title="Invitația a fost deja acceptată" text={`Contul ${invitation.email} face parte din ${invitation.institution}.`} />
            <Button asChild className="mt-6 w-full"><Link to={isAuthenticated ? '/doctor' : '/login'}>{isAuthenticated ? 'Deschide panoul' : 'Autentifică-te'}</Link></Button>
          </>
        ) : invitation.status !== 'pending' ? (
          <Status icon={Clock} tone="amber" title={invitation.status === 'expired' ? 'Invitația a expirat' : 'Invitația a fost anulată'} text={`Cere instituției ${invitation.institution} o invitație nouă.`} />
        ) : (
          <>
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="h-6 w-6" /></span>
              <div>
                <p className="text-sm font-medium text-slate-500">Invitație pentru {invitation.email}</p>
                <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950">{invitation.institution} te invită în echipă</h1>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Vei face consultații pe platformă ca medic al instituției. Plățile pentru consultații le primești de la {invitation.institution}, după procentul stabilit de ea.
            </p>
            <p className="mt-2 text-xs text-slate-500">Valabilă până la {dateTime(invitation.expires_at)}.</p>

            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {invitation.account_exists ? (
              signedInAsInvited ? (
                <Button className="mt-6 w-full" onClick={() => void accept()} disabled={saving}>{saving ? 'Se acceptă…' : `Accept și mă alătur instituției`}</Button>
              ) : (
                <div className="mt-6 space-y-3">
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    {isAuthenticated ? <>Ești autentificat cu alt cont ({user?.email}). Deconectează-te și intră cu <strong>{invitation.email}</strong>.</> : <>Ai deja cont cu <strong>{invitation.email}</strong>. Autentifică-te ca să accepți.</>}
                  </p>
                  {!isAuthenticated && <Button asChild className="w-full"><Link to={loginPath}>Autentifică-te și acceptă</Link></Button>}
                </div>
              )
            ) : (
              <form onSubmit={accept} className="mt-6 space-y-4">
                <div className="space-y-1.5"><Label htmlFor="inv-name">Nume și prenume</Label><Input id="inv-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></div>
                {!invitation.specialty_id && (
                  <div className="space-y-1.5">
                    <Label>Specialitatea</Label>
                    <Select value={form.specialty_id} onValueChange={(value) => setForm({ ...form, specialty_id: value })}>
                      <SelectTrigger aria-label="Specialitatea"><SelectValue placeholder="Alege specialitatea" /></SelectTrigger>
                      <SelectContent>{specialties.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="inv-phone">Telefon <span className="font-normal text-slate-400">(opțional)</span></Label><Input id="inv-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></div>
                  <div className="space-y-1.5"><Label htmlFor="inv-license">Nr. licenței <span className="font-normal text-slate-400">(opțional)</span></Label><Input id="inv-license" value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="inv-password">Parolă</Label><Input id="inv-password" type="password" required minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /><p className="text-xs text-slate-500">Minimum 8 caractere.</p></div>
                <div className="space-y-1.5"><Label htmlFor="inv-password2">Confirmă parola</Label><Input id="inv-password2" type="password" required minLength={8} value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} autoComplete="new-password" /></div>
                <Button type="submit" className="w-full" disabled={saving || (!invitation.specialty_id && !form.specialty_id)}>{saving ? 'Se creează contul…' : 'Creează contul și acceptă'}</Button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Status({ icon: Icon, tone, title, text }: { icon: React.ElementType; tone: 'green' | 'amber' | 'red'; title: string; text: string }) {
  const tones = { green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600' };
  return (
    <div className="text-center">
      <span className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl ${tones[tone]}`}><Icon className="h-7 w-7" /></span>
      <h1 className="text-xl font-bold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}
