import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Mail, Percent, RotateCw, Search, Stethoscope, Trash2, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ListSkeleton } from '../../components/ui/skeleton';
import { PageHeader, SectionHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { ToneBadge } from '../../components/app/StatusBadge';
import { MoreMenu } from '../../components/app/MoreMenu';
import { useDialogs } from '../../components/app/DialogProvider';
import { apiRequest } from '../../lib/api';
import { dateOnly, money } from '../../lib/format';
import { splitExample, type Institution, type InstitutionDoctor, type InstitutionInvitation } from '../../lib/institution';

interface DoctorsResponse {
  institution: Institution;
  doctors: InstitutionDoctor[];
  invitations: InstitutionInvitation[];
}

type Specialty = { id: number; name: string };
type Mode = 'invite' | 'create' | null;

const EMPTY_FORM = { name: '', email: '', phone: '', specialty_id: '', license_number: '', doctor_share_percent: '', password: '' };

export function InstitutionDoctorsPage() {
  const dialogs = useDialogs();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<DoctorsResponse | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [invitationLink, setInvitationLink] = useState<{ email: string; url: string } | null>(null);
  const mode = (searchParams.get('add') as Mode) ?? null;

  const load = useCallback(() => {
    apiRequest<DoctorsResponse>('/institution/doctors')
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Nu am putut încărca medicii.'));
  }, []);

  useEffect(() => {
    load();
    apiRequest<{ data: Specialty[] }>('/catalog/specialties', { auth: false }).then((response) => setSpecialties(response.data ?? [])).catch(() => setSpecialties([]));
  }, [load]);

  const openMode = (next: Mode) => {
    setForm(EMPTY_FORM);
    setFormError('');
    const params = new URLSearchParams(searchParams);
    if (next) params.set('add', next); else params.delete('add');
    setSearchParams(params, { replace: true });
  };

  const defaultShare = data?.institution.doctor_share_percent ?? 70;
  const sharePayload = form.doctor_share_percent === '' ? null : Number(form.doctor_share_percent);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (mode === 'create') {
        const response = await apiRequest<{ generated_password: string | null; message: string }>('/institution/doctors', {
          method: 'POST',
          body: JSON.stringify({ ...form, specialty_id: Number(form.specialty_id), doctor_share_percent: sharePayload, password: form.password || null, phone: form.phone || null })
        });
        setCredentials({ name: form.name, email: form.email, password: response.generated_password ?? form.password });
      } else {
        const response = await apiRequest<{ message: string; invitation_url: string }>('/institution/invitations', {
          method: 'POST',
          body: JSON.stringify({ email: form.email, name: form.name || null, specialty_id: form.specialty_id ? Number(form.specialty_id) : null, license_number: form.license_number || null, doctor_share_percent: sharePayload })
        });
        toast.success(response.message);
        setInvitationLink({ email: form.email, url: response.invitation_url });
      }
      openMode(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nu am putut salva.');
    } finally {
      setSaving(false);
    }
  };

  const changeShare = async (doctor: InstitutionDoctor) => {
    const values = await dialogs.form({
      title: `Procentul pentru ${doctor.name}`,
      description: `Gol = procentul implicit al instituției (${defaultShare}%). Se aplică doar consultațiilor finalizate de acum înainte.`,
      confirmLabel: 'Salvează',
      fields: [{ name: 'share', label: 'Procentul medicului (%)', type: 'number', defaultValue: doctor.doctor_share_percent === null ? '' : String(doctor.doctor_share_percent), placeholder: String(defaultShare), min: '0' }]
    });
    if (!values) return;
    try {
      const response = await apiRequest<{ message: string }>(`/institution/doctors/${doctor.id}`, { method: 'PUT', body: JSON.stringify({ doctor_share_percent: values.share === '' ? null : Number(values.share) }) });
      toast.success(response.message);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva procentul.');
    }
  };

  const removeDoctor = async (doctor: InstitutionDoctor) => {
    const confirmed = await dialogs.confirm({
      title: `Elimini pe ${doctor.name} din instituție?`,
      description: <p>Medicul rămâne pe platformă ca medic independent. {doctor.balance > 0 && <>Instituția îi datorează în continuare <strong>{money(doctor.balance)} MDL</strong>.</>}</p>,
      confirmLabel: 'Elimină din instituție',
      tone: 'danger'
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/institution/doctors/${doctor.id}`, { method: 'DELETE' });
      toast.success('Medicul a fost eliminat din instituție.');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut elimina medicul.');
    }
  };

  const resend = async (invitation: InstitutionInvitation) => {
    try {
      const response = await apiRequest<{ message: string; invitation_url: string }>(`/institution/invitations/${invitation.id}/resend`, { method: 'POST' });
      toast.success(response.message);
      setInvitationLink({ email: invitation.email, url: response.invitation_url });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut retrimite invitația.');
    }
  };

  const revoke = async (invitation: InstitutionInvitation) => {
    if (!(await dialogs.confirm({ title: 'Anulezi invitația?', description: `Linkul trimis la ${invitation.email} nu va mai funcționa.`, confirmLabel: 'Anulează invitația', tone: 'danger' }))) return;
    try {
      await apiRequest(`/institution/invitations/${invitation.id}`, { method: 'DELETE' });
      toast.success('Invitația a fost anulată.');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut anula invitația.');
    }
  };

  const query = search.trim().toLocaleLowerCase('ro');
  const doctors = (data?.doctors ?? []).filter((doctor) => !query || `${doctor.name} ${doctor.email} ${doctor.specialty ?? ''}`.toLocaleLowerCase('ro').includes(query));
  const example = splitExample(sharePayload ?? defaultShare);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medici"
        description="Medicii care lucrează pe platformă prin instituția ta și cât primește fiecare."
        actions={
          <>
            <Button variant="outline" onClick={() => openMode('create')}><KeyRound className="h-4 w-4" />Creează cont</Button>
            <Button onClick={() => openMode('invite')}><UserPlus className="h-4 w-4" />Invită un medic</Button>
          </>
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <SectionHeader title={`Medicii instituției${data ? ` (${data.doctors.length})` : ''}`} description={`Procent implicit pentru medici: ${defaultShare}% din suma rămasă după comisionul platformei.`} />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută medic" aria-label="Caută medic" className="h-10 pl-9" />
          </div>
        </div>
        {!data ? <div className="p-5"><ListSkeleton rows={3} /></div> : doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title={data.doctors.length === 0 ? 'Niciun medic încă' : 'Niciun rezultat'}
            description={data.doctors.length === 0 ? 'Invită medicii pe email sau creează-le direct contul.' : 'Încearcă alt nume.'}
            action={data.doctors.length === 0 && <Button onClick={() => openMode('invite')}><UserPlus className="h-4 w-4" />Invită primul medic</Button>}
            className="m-5"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-3 font-medium">Medic</th>
                  <th className="px-3 py-3 font-medium">Procent</th>
                  <th className="px-3 py-3 text-right font-medium">Consultații</th>
                  <th className="px-3 py-3 text-right font-medium">Câștigat de medic</th>
                  <th className="px-3 py-3 text-right font-medium">De plătit</th>
                  <th className="px-3 py-3 text-right font-medium">Pentru instituție</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((doctor) => (
                  <tr key={doctor.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{doctor.name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('')}</AvatarFallback></Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{doctor.name}</p>
                          <p className="truncate text-xs text-slate-500">{[doctor.specialty, doctor.email].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <button type="button" onClick={() => void changeShare(doctor)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-slate-900 hover:bg-slate-100" title="Modifică procentul">
                        {doctor.effective_share_percent}%
                        {doctor.doctor_share_percent === null && <span className="text-xs font-normal text-slate-400">implicit</span>}
                      </button>
                    </td>
                    <td className="tabular px-3 py-3.5 text-right text-slate-700">{doctor.consultations}</td>
                    <td className="tabular px-3 py-3.5 text-right text-slate-700">{money(doctor.doctor_total)}</td>
                    <td className="tabular px-3 py-3.5 text-right">{doctor.balance > 0 ? <span className="font-semibold text-amber-700">{money(doctor.balance)}</span> : <span className="text-slate-400">0.00</span>}</td>
                    <td className="tabular px-3 py-3.5 text-right font-semibold text-slate-950">{money(doctor.institution_total)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <MoreMenu size="icon-sm" items={[
                        { label: 'Modifică procentul', icon: Percent, onSelect: () => void changeShare(doctor) },
                        { label: 'Elimină din instituție', icon: Trash2, onSelect: () => void removeDoctor(doctor), danger: true, separatorBefore: true }
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(data?.invitations.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeader title="Invitații trimise" description="Medicii care nu au acceptat încă invitația." />
          <ul className="mt-4 divide-y divide-slate-100">
            {data?.invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Mail className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{invitation.name ? `${invitation.name} · ` : ''}{invitation.email}</p>
                  <p className="text-xs text-slate-500">Trimisă {dateOnly(invitation.created_at)} · {invitation.expired ? 'expirată' : `valabilă până la ${dateOnly(invitation.expires_at)}`}{invitation.specialty ? ` · ${invitation.specialty}` : ''}</p>
                </div>
                {invitation.expired ? <ToneBadge tone="neutral">Expirată</ToneBadge> : <ToneBadge tone="warning">În așteptare</ToneBadge>}
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => void resend(invitation)}><RotateCw className="h-3.5 w-3.5" />Retrimite</Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Anulează invitația" onClick={() => void revoke(invitation)}><X className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Adaugă medic: invitație sau cont creat direct */}
      <Dialog open={mode === 'invite' || mode === 'create'} onOpenChange={(open) => { if (!open && !saving) openMode(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <form onSubmit={submit} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>{mode === 'create' ? 'Creează contul medicului' : 'Invită un medic'}</DialogTitle>
              <DialogDescription>
                {mode === 'create'
                  ? 'Contul e activ imediat. Primești parola o singură dată, ca s-o transmiți medicului.'
                  : 'Medicul primește un email cu link. Dacă are deja cont, se autentifică și acceptă; altfel își creează contul din link.'}
              </DialogDescription>
            </DialogHeader>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              <button type="button" onClick={() => openMode('invite')} className={`flex-1 rounded-lg px-3 py-1.5 ${mode === 'invite' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>Invitație pe email</button>
              <button type="button" onClick={() => openMode('create')} className={`flex-1 rounded-lg px-3 py-1.5 ${mode === 'create' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'}`}>Creez eu contul</button>
            </div>
            {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="doctor-email" className="sm:col-span-2"><Input id="doctor-email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
              <Field label="Nume și prenume" htmlFor="doctor-name" optional={mode !== 'create'}><Input id="doctor-name" required={mode === 'create'} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Specialitate" optional={mode !== 'create'}>
                <Select value={form.specialty_id} onValueChange={(value) => setForm({ ...form, specialty_id: value })}>
                  <SelectTrigger aria-label="Specialitate"><SelectValue placeholder="Alege" /></SelectTrigger>
                  <SelectContent>{specialties.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Nr. licenței" htmlFor="doctor-license" optional><Input id="doctor-license" value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} /></Field>
              {mode === 'create' && <Field label="Telefon" htmlFor="doctor-phone" optional><Input id="doctor-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+373 6X XXX XXX" /></Field>}
              <Field label="Procentul medicului" htmlFor="doctor-share" optional>
                <div className="relative"><Input id="doctor-share" type="number" min={0} max={100} step="0.5" value={form.doctor_share_percent} onChange={(event) => setForm({ ...form, doctor_share_percent: event.target.value })} placeholder={String(defaultShare)} className="pr-8" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span></div>
              </Field>
              {mode === 'create' && <Field label="Parolă" htmlFor="doctor-password" optional hint="Lasă gol și generăm una sigură."><Input id="doctor-password" type="text" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></Field>}
            </div>
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Exemplu: din fiecare <strong>100 MDL</strong> rămași după comisionul platformei, medicul primește <strong>{money(example.doctor)} MDL</strong>, iar instituția <strong>{money(example.institution)} MDL</strong>.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => openMode(null)} disabled={saving}>Renunță</Button>
              <Button type="submit" disabled={saving || (mode === 'create' && !form.specialty_id)}>{saving ? 'Se salvează…' : mode === 'create' ? 'Creează contul' : 'Trimite invitația'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Datele de acces, afișate o singură dată */}
      <Dialog open={Boolean(credentials)} onOpenChange={(open) => { if (!open) setCredentials(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contul a fost creat</DialogTitle>
            <DialogDescription>Transmite aceste date medicului. Parola nu va mai fi afișată; medicul o poate schimba din „Ai uitat parola?”.</DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="min-w-0 space-y-2">
              <CopyRow label="Email" value={credentials.email} />
              <CopyRow label="Parolă" value={credentials.password} mono />
              <CopyRow label="Autentificare" value={`${window.location.origin}/login`} />
            </div>
          )}
          <DialogFooter><Button onClick={() => setCredentials(null)}>Gata</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(invitationLink)} onOpenChange={(open) => { if (!open) setInvitationLink(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitație trimisă</DialogTitle>
            <DialogDescription>Am trimis linkul la {invitationLink?.email}. Îl poți trimite și direct medicului (de ex. pe WhatsApp). Este valabil 7 zile.</DialogDescription>
          </DialogHeader>
          {invitationLink && <div className="min-w-0"><CopyRow label="Link" value={invitationLink.url} /></div>}
          <DialogFooter><Button onClick={() => setInvitationLink(null)}>Gata</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, htmlFor, optional = false, hint, className, children }: { label: string; htmlFor?: string; optional?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={htmlFor}>{label}{optional && <span className="ml-1 font-normal text-slate-400">(opțional)</span>}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function CopyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Nu am putut copia. Selectează textul manual.');
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="w-24 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className={`min-w-0 flex-1 truncate text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
      <Button type="button" size="icon-sm" variant="ghost" onClick={() => void copy()} aria-label={`Copiază ${label.toLowerCase()}`}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
