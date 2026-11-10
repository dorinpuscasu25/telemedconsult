import { useEffect, useState } from 'react';
import { UserCheck, Check, X, Stethoscope, Users, Mail, Phone, CalendarDays } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { apiRequest } from '../../lib/api';

type Registration = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roles: string[];
  active_role: string | null;
  created_at: string | null;
  profiles?: {
    doctor?: { license_number?: string | null; specialty?: { name?: string } | null; institution_chosen_at?: string | null; requested_institution?: { id: number; name: string } | null } | null;
    operator?: { region?: string | null } | null;
  };
};

const ROLE_LABEL: Record<string, string> = { doctor: 'Medic', operator: 'Operator' };

function formatDate(value: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function RegistrationsPage() {
  const [items, setItems] = useState<Registration[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<Array<{ id: number; name: string }>>([]);
  // Instituția cu care e aprobat medicul: cea aleasă de el, dacă administratorul n-o schimbă.
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const load = () => {
    apiRequest<{ data: Registration[] }>('/admin/registrations')
      .then((response) => setItems(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca cererile.'));
  };

  useEffect(() => {
    load();
    apiRequest<{ data: Array<{ id: number; name: string }> }>('/catalog/institutions', { auth: false }).then((response) => setInstitutions(response.data ?? [])).catch(() => undefined);
  }, []);

  const act = async (item: Registration, action: 'approve' | 'reject') => {
    if (action === 'reject' && !window.confirm(`Respingi cererea lui ${item.name}?`)) return;
    setBusyId(item.id);
    setError('');
    setMessage('');
    try {
      const override = overrides[item.id];
      await apiRequest(`/admin/users/${item.id}/${action}`, { method: 'POST', body: action === 'approve' && override !== undefined ? JSON.stringify({ institution_id: override ? Number(override) : null }) : undefined });
      setMessage(action === 'approve' ? `${item.name} a fost aprobat.` : `Cererea lui ${item.name} a fost respinsă.`);
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setBusyId(null);
    }
  };

  const roleOf = (item: Registration) => item.roles.find((role) => role === 'doctor' || role === 'operator') ?? item.active_role ?? '';

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Cereri de înregistrare</h1>
        <p className="text-slate-500">Aprobă sau respinge conturile de medic și operator create prin înregistrare publică.</p>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {items.length === 0 ? (
        <Card className="glass-card border-0">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-slate-500">
            <UserCheck className="h-8 w-8 text-slate-400" />
            Nu există cereri în așteptare.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const role = roleOf(item);
            const RoleIcon = role === 'doctor' ? Stethoscope : Users;
            const detail = role === 'doctor'
              ? item.profiles?.doctor?.specialty?.name
                ? `Specialitate: ${item.profiles.doctor.specialty.name}${item.profiles.doctor.license_number ? ` · Licență: ${item.profiles.doctor.license_number}` : ''}`
                : item.profiles?.doctor?.license_number ? `Licență: ${item.profiles.doctor.license_number}` : null
              : item.profiles?.operator?.region ? `Regiune: ${item.profiles.operator.region}` : null;

            return (
              <Card key={item.id} className="border-slate-200/70 bg-white shadow-sm">
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        <RoleIcon className="h-3.5 w-3.5" />
                        {ROLE_LABEL[role] ?? role}
                      </span>
                      <h3 className="truncate text-lg font-semibold text-slate-900">{item.name}</h3>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{item.email}</span>
                      {item.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{item.phone}</span>}
                      {item.created_at && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(item.created_at)}</span>}
                    </div>
                    {detail && <p className="mt-1 text-sm text-slate-600">{detail}</p>}
                    {role === 'doctor' && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className={item.profiles?.doctor?.institution_chosen_at ? 'text-slate-600' : 'font-medium text-amber-700'}>
                          {!item.profiles?.doctor?.institution_chosen_at ? 'Încă nu a ales instituția.' : item.profiles.doctor.requested_institution ? `A ales: ${item.profiles.doctor.requested_institution.name}` : 'A ales: lucrează independent'}
                        </span>
                        <label className="flex items-center gap-2 text-slate-500">
                          Aprobă în
                          <select aria-label="Instituția la aprobare" value={overrides[item.id] ?? String(item.profiles?.doctor?.requested_institution?.id ?? '')}
                            onChange={(event) => setOverrides((current) => ({ ...current, [item.id]: event.target.value }))}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900">
                            <option value="">Independent (fără instituție)</option>
                            {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700" disabled={busyId === item.id} onClick={() => act(item, 'approve')}>
                      <Check className="mr-1.5 h-4 w-4" />
                      Aprobă
                    </Button>
                    <Button variant="outline" className="rounded-xl text-red-600" disabled={busyId === item.id} onClick={() => act(item, 'reject')}>
                      <X className="mr-1.5 h-4 w-4" />
                      Respinge
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
