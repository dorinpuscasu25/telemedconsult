import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Check, Copy, Pencil, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { ListSkeleton } from '../../components/ui/skeleton';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { ToneBadge } from '../../components/app/StatusBadge';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/format';

interface AdminInstitution {
  id: number;
  name: string;
  legal_name?: string | null;
  fiscal_code?: string | null;
  iban?: string | null;
  bank_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  doctor_share_percent: number;
  revenue_share_percent: number;
  status: 'active' | 'suspended' | string;
  notes?: string | null;
  doctors_count: number;
  managers: Array<{ id: number; name: string; email: string }>;
  earned_total: number;
  institution_total: number;
  owed_to_doctors: number;
  platform_balance: number;
  platform_pending: number;
}

const EMPTY = {
  name: '', legal_name: '', fiscal_code: '', iban: '', bank_name: '', email: '', phone: '', address: '', doctor_share_percent: '30', revenue_share_percent: '80', notes: '', status: 'active',
  manager_name: '', manager_email: '', manager_phone: '', manager_password: ''
};

type Form = typeof EMPTY;
type ManagerUser = { id: string | number; name: string; email: string; status: string };

/**
 * Instituțiile medicale partenere. Adminul le creează împreună cu contul
 * managerului; de acolo instituția își adaugă singură medicii.
 */
export function AdminInstitutionsPage() {
  const [items, setItems] = useState<AdminInstitution[] | null>(null);
  const [editing, setEditing] = useState<AdminInstitution | 'new' | null>(null);
  const [managerFor, setManagerFor] = useState<AdminInstitution | null>(null);
  const [deleting, setDeleting] = useState<AdminInstitution | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [managerUsers, setManagerUsers] = useState<ManagerUser[]>([]);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerPage, setManagerPage] = useState(1);
  const [managerLastPage, setManagerLastPage] = useState(1);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerLoadError, setManagerLoadError] = useState('');
  const [selectedManager, setSelectedManager] = useState<ManagerUser | null>(null);
  const [creatingManagerUser, setCreatingManagerUser] = useState(false);
  const [newUserCredentials, setNewUserCredentials] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(() => {
    apiRequest<{ data: AdminInstitution[] }>('/admin/institutions')
      .then((response) => setItems(response.data ?? []))
      .catch((err) => { setItems([]); toast.error(err instanceof Error ? err.message : 'Nu am putut încărca instituțiile.'); });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if ((!managerFor && editing !== 'new') || creatingManagerUser) return;
    let cancelled = false;
    setManagerLoading(true);
    setManagerLoadError('');
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ search: managerSearch.trim(), page: String(managerPage) });
      apiRequest<{ data: ManagerUser[]; meta: { last_page: number } }>(`/admin/users?${params}`)
        .then((response) => {
          if (cancelled) return;
          setManagerUsers(response.data ?? []);
          setManagerLastPage(response.meta.last_page);
        })
        .catch((err) => { if (!cancelled) setManagerLoadError(err instanceof Error ? err.message : 'Nu am putut încărca utilizatorii.'); })
        .finally(() => { if (!cancelled) setManagerLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [managerFor, editing, managerSearch, managerPage, creatingManagerUser]);

  const open = (target: AdminInstitution | 'new') => {
    setError('');
    setManagerSearch('');
    setManagerPage(1);
    setManagerLastPage(1);
    setSelectedManager(null);
    setCreatingManagerUser(false);
    setNewUserCredentials(null);
    setEditing(target);
    setForm(target === 'new' ? EMPTY : {
      ...EMPTY,
      ...Object.fromEntries(Object.entries(target).filter(([key]) => key in EMPTY).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)]))
    } as Form);
  };

  const openManager = (institution: AdminInstitution) => {
    setError('');
    setForm(EMPTY);
    setManagerSearch('');
    setManagerPage(1);
    setManagerUsers([]);
    setSelectedManager(null);
    setCreatingManagerUser(false);
    setNewUserCredentials(null);
    setManagerFor(institution);
  };

  const nullable = (value: string) => (value.trim() === '' ? null : value.trim());

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const institutionPayload = {
      name: form.name, legal_name: nullable(form.legal_name), fiscal_code: nullable(form.fiscal_code), iban: nullable(form.iban), bank_name: nullable(form.bank_name),
      email: nullable(form.email), phone: nullable(form.phone), address: nullable(form.address), doctor_share_percent: Number(form.doctor_share_percent), revenue_share_percent: Number(form.revenue_share_percent), notes: nullable(form.notes)
    };
    try {
      if (editing === 'new') {
        const response = await apiRequest<{ message: string; generated_password: string | null }>('/admin/institutions', {
          method: 'POST',
          body: JSON.stringify({ ...institutionPayload, ...(creatingManagerUser ? {
            manager_name: form.manager_name, manager_email: form.manager_email, manager_phone: nullable(form.manager_phone), manager_password: nullable(form.manager_password)
          } : { manager_user_id: Number(selectedManager?.id) }) })
        });
        toast.success(response.message);
        if (creatingManagerUser) setCredentials({ email: form.manager_email, password: response.generated_password ?? form.manager_password });
      } else if (editing) {
        const response = await apiRequest<{ message: string }>(`/admin/institutions/${editing.id}`, { method: 'PUT', body: JSON.stringify({ ...institutionPayload, status: form.status }) });
        toast.success(response.message);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva instituția.');
    } finally {
      setSaving(false);
    }
  };

  const saveManager = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!managerFor || !selectedManager) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ message: string }>(`/admin/institutions/${managerFor.id}/managers`, {
        method: 'POST',
        body: JSON.stringify({ user_id: Number(selectedManager.id) })
      });
      toast.success(response.message);
      setManagerFor(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut adăuga managerul.');
    } finally {
      setSaving(false);
    }
  };

  const createManagerUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ message: string; user: ManagerUser; generated_password: string | null }>('/admin/institution-manager-users', {
        method: 'POST',
        body: JSON.stringify({ name: form.manager_name, email: form.manager_email, phone: nullable(form.manager_phone), password: nullable(form.manager_password) })
      });
      setSelectedManager(response.user);
      setNewUserCredentials({ email: response.user.email, password: response.generated_password ?? form.manager_password });
      setManagerSearch(response.user.email);
      setManagerPage(1);
      setCreatingManagerUser(false);
      setForm(EMPTY);
      toast.success(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut crea utilizatorul.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ message: string }>(`/admin/institutions/${deleting.id}`, { method: 'DELETE' });
      toast.success(response.message);
      setDeleting(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge instituția.');
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const assignedManagerIds = new Set(items?.flatMap((institution) => institution.managers.map((manager) => String(manager.id))) ?? []);
  const availableManagerUsers = managerUsers.filter((user) => user.status === 'active' && !assignedManagerIds.has(String(user.id)));

  const managerPicker = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="manager-search">Caută utilizator</Label>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <Input id="manager-search" className="pl-9" placeholder="Nume sau email" value={managerSearch} onChange={(event) => { setManagerSearch(event.target.value); setManagerPage(1); }} />
        </div>
      </div>
      <fieldset className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2" disabled={saving}>
        <legend className="sr-only">Utilizatori disponibili</legend>
        {managerLoading ? <p role="status" className="p-4 text-center text-sm text-slate-500">Se încarcă utilizatorii…</p> : managerLoadError ? (
          <p role="alert" className="p-3 text-sm text-red-700">{managerLoadError}</p>
        ) : availableManagerUsers.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-500">Niciun utilizator disponibil pe această pagină. Caută după nume sau email ori adaugă un utilizator.</p>
        ) : availableManagerUsers.map((user) => (
          <label key={user.id} className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 ${String(selectedManager?.id) === String(user.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <input type="radio" name="manager-user" value={user.id} checked={String(selectedManager?.id) === String(user.id)} onChange={() => { setSelectedManager(user); setError(''); }} className="h-4 w-4 shrink-0 accent-blue-600" />
            <span className="min-w-0"><span className="block break-words text-sm font-medium text-slate-950">{user.name}</span><span className="block break-all text-xs text-slate-500">{user.email}</span></span>
          </label>
        ))}
      </fieldset>
      {managerLastPage > 1 && <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <Button type="button" size="sm" variant="outline" disabled={managerLoading || managerPage <= 1} onClick={() => setManagerPage((page) => page - 1)}>Înapoi</Button>
        <span>Pagina {managerPage} din {managerLastPage}</span>
        <Button type="button" size="sm" variant="outline" disabled={managerLoading || managerPage >= managerLastPage} onClick={() => setManagerPage((page) => page + 1)}>Înainte</Button>
      </div>}
      {selectedManager && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Selectat: <strong>{selectedManager.name}</strong><span className="block break-all text-xs">{selectedManager.email}</span></p>}
      {newUserCredentials && <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-sm font-medium text-emerald-900">Utilizator creat. Copiază datele de acces înainte de a închide fereastra.</p>
        <CopyRow label="Email" value={newUserCredentials.email} />
        <CopyRow label="Parolă" value={newUserCredentials.password} mono />
      </div>}
      <Button type="button" variant="outline" className="w-full" disabled={saving} onClick={() => { setCreatingManagerUser(true); setError(''); }}><UserPlus className="h-4 w-4" />Adaugă utilizator</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instituții medicale"
        description="Clinicile partenere care lucrează pe platformă cu propriii medici și își plătesc singure medicii."
        actions={<Button onClick={() => open('new')}><Plus className="h-4 w-4" />Instituție nouă</Button>}
      />

      {!items ? <ListSkeleton rows={3} /> : items.length === 0 ? (
        <EmptyState icon={Building2} title="Nicio instituție încă" description="Adaugă prima clinică parteneră și contul managerului ei." action={<Button onClick={() => open('new')}><Plus className="h-4 w-4" />Instituție nouă</Button>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((institution) => (
            <article key={institution.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-slate-950">{institution.name}</h2>
                    <ToneBadge tone={institution.status === 'active' ? 'success' : 'danger'}>{institution.status === 'active' ? 'Activă' : 'Suspendată'}</ToneBadge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{[institution.legal_name, institution.fiscal_code && `IDNO ${institution.fiscal_code}`].filter(Boolean).join(' · ') || 'Date juridice necompletate'}</p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label="Editează instituția" onClick={() => open(institution)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Șterge instituția" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => { setError(''); setDeleting(institution); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label="Medici" value={String(institution.doctors_count)} />
                <Metric label="Procent instituție" value={`${institution.revenue_share_percent}%`} />
                <Metric label="Câștigat total" value={`${money(institution.earned_total)}`} />
                <Metric label="De transferat" value={`${money(institution.platform_balance)}`} highlight={institution.platform_balance > 0} />
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm">
                <span className="text-slate-500">Manageri:</span>
                {institution.managers.map((manager) => <span key={manager.id} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700" title={manager.email}>{manager.name}</span>)}
                <Button size="sm" variant="ghost" onClick={() => openManager(institution)}><UserPlus className="h-4 w-4" />Adaugă</Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(value) => { if (!value && !saving) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={save} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>{editing === 'new' ? 'Instituție nouă' : 'Editează instituția'}</DialogTitle>
              <DialogDescription>{editing === 'new' ? 'Completează instituția și alege managerul din utilizatorii existenți sau creează un cont nou.' : 'Suspendarea blochează accesul managerilor; medicii rămân afiliați.'}</DialogDescription>
            </DialogHeader>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Denumire" id="i-name" className="sm:col-span-2"><Input id="i-name" required value={form.name} onChange={set('name')} /></Field>
              <Field label="Denumire juridică" id="i-legal"><Input id="i-legal" value={form.legal_name} onChange={set('legal_name')} /></Field>
              <Field label="IDNO" id="i-fiscal"><Input id="i-fiscal" value={form.fiscal_code} onChange={set('fiscal_code')} /></Field>
              <Field label="IBAN" id="i-iban"><Input id="i-iban" value={form.iban} onChange={set('iban')} className="font-mono" /></Field>
              <Field label="Banca" id="i-bank"><Input id="i-bank" value={form.bank_name} onChange={set('bank_name')} /></Field>
              <Field label="Email" id="i-email"><Input id="i-email" type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label="Telefon" id="i-phone"><Input id="i-phone" type="tel" value={form.phone} onChange={set('phone')} /></Field>
              <Field label="Adresa" id="i-address" className="sm:col-span-2"><Input id="i-address" value={form.address} onChange={set('address')} /></Field>
              <Field label="Procent pentru instituție (%)" id="i-revenue-share" hint={`Din banii achitați efectiv. Platformei îi revin ${100 - Number(form.revenue_share_percent || 0)}%.`}><Input id="i-revenue-share" type="number" min={0} max={100} step="0.01" required value={form.revenue_share_percent} onChange={set('revenue_share_percent')} /></Field>
              <Field label="Procent implicit al medicilor (%)" id="i-share" hint="Din partea instituției. Managerul stabilește procentul medicilor săi."><Input id="i-share" type="number" min={0} max={100} step="0.5" required value={form.doctor_share_percent} onChange={set('doctor_share_percent')} /></Field>
              {editing !== 'new' && (
                <Field label="Status" id="i-status">
                  <select id="i-status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="active">Activă</option>
                    <option value="suspended">Suspendată</option>
                  </select>
                </Field>
              )}
              <Field label="Note interne" id="i-notes" className="sm:col-span-2"><Textarea id="i-notes" value={form.notes} onChange={set('notes')} className="min-h-16" /></Field>
            </div>
            {editing === 'new' && (creatingManagerUser ? <div className="space-y-3"><ManagerFields form={form} set={set} /><Button type="button" variant="outline" onClick={() => { setCreatingManagerUser(false); setError(''); }} disabled={saving}>Alege un utilizator existent</Button></div> : managerPicker)}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>Renunță</Button>
              <Button type="submit" disabled={saving || (editing === 'new' && !creatingManagerUser && !selectedManager)}>{saving ? 'Se salvează…' : editing === 'new' ? 'Creează instituția' : 'Salvează'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(managerFor)} onOpenChange={(value) => { if (!value && !saving) setManagerFor(null); }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={creatingManagerUser ? createManagerUser : saveManager} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>{creatingManagerUser ? 'Adaugă utilizator' : `Alege managerul pentru ${managerFor?.name}`}</DialogTitle>
              <DialogDescription>{creatingManagerUser ? 'După creare, utilizatorul va fi preselectat. Confirmă apoi adăugarea lui ca manager.' : 'Alege un utilizator existent sau adaugă unul nou. Managerul vede medicii, banii și plățile instituției.'}</DialogDescription>
            </DialogHeader>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {creatingManagerUser ? <ManagerFields form={form} set={set} /> : managerPicker}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { if (creatingManagerUser) { setCreatingManagerUser(false); setError(''); } else setManagerFor(null); }} disabled={saving}>{creatingManagerUser ? 'Înapoi la utilizatori' : 'Renunță'}</Button>
              <Button type="submit" disabled={saving || (!creatingManagerUser && !selectedManager)}>{saving ? 'Se salvează…' : creatingManagerUser ? 'Creează utilizatorul' : 'Adaugă managerul'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(value) => { if (!value && !saving) setDeleting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ștergi {deleting?.name}?</DialogTitle>
            <DialogDescription>Acțiunea nu poate fi anulată. Medicii instituției rămân pe platformă ca medici independenți, iar conturile managerilor se șterg. Instituțiile cu consultații sau plăți nu pot fi șterse; suspendă-le în schimb.</DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={saving}>Renunță</Button>
            <Button type="button" variant="destructive" onClick={() => { void remove(); }} disabled={saving}>{saving ? 'Se șterge…' : 'Șterge instituția'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credentials)} onOpenChange={(value) => { if (!value) setCredentials(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Datele de acces ale managerului</DialogTitle>
            <DialogDescription>Transmite-le managerului. Parola nu va mai fi afișată; o poate schimba din „Ai uitat parola?”.</DialogDescription>
          </DialogHeader>
          {credentials && <div className="min-w-0 space-y-2"><CopyRow label="Email" value={credentials.email} /><CopyRow label="Parolă" value={credentials.password} mono /><CopyRow label="Autentificare" value={`${window.location.origin}/login`} /></div>}
          <DialogFooter><Button onClick={() => setCredentials(null)}>Gata</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManagerFields({ form, set }: { form: Form; set: (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold text-slate-900">Contul managerului</legend>
      <Field label="Nume" id="m-name"><Input id="m-name" required value={form.manager_name} onChange={set('manager_name')} /></Field>
      <Field label="Email" id="m-email"><Input id="m-email" type="email" required value={form.manager_email} onChange={set('manager_email')} /></Field>
      <Field label="Telefon" id="m-phone"><Input id="m-phone" type="tel" value={form.manager_phone} onChange={set('manager_phone')} /></Field>
      <Field label="Parolă" id="m-password" hint="Gol = generăm una sigură."><Input id="m-password" minLength={8} value={form.manager_password} onChange={set('manager_password')} autoComplete="new-password" /></Field>
    </fieldset>
  );
}

function Field({ label, id, hint, className, children }: { label: string; id: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`tabular font-semibold ${highlight ? 'text-amber-700' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}

function CopyRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="w-24 shrink-0 text-xs font-medium text-slate-500">{label}</span>
      <span className={`min-w-0 flex-1 truncate text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Copiază ${label.toLowerCase()}`} onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
