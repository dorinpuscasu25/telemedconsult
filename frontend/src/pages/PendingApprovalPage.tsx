import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Building2, Clock, LogOut, RefreshCw, Search, UserRound } from 'lucide-react';
import { DoctorRegistrationSteps } from '../components/auth/DoctorRegistrationSteps';
import { cn } from '../components/ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';

interface Institution { id: number; name: string; address?: string | null }

const ROLE_LABEL: Record<string, string> = { doctor: 'medic', operator: 'operator' };
const INDEPENDENT = 0;

/**
 * Ultimii pași ai înregistrării. Medicul alege instituția la care lucrează (sau
 * că lucrează independent), confirmă alegerea, apoi așteaptă aprobarea.
 * Operatorul trece direct la așteptare.
 */
export function PendingApprovalPage() {
  const { user, role, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const registration = user?.doctor_registration ?? null;
  const isDoctor = role === 'doctor' && Boolean(registration);
  const [editing, setEditing] = useState(false);
  const choosing = isDoctor && (!registration?.institution_chosen || editing);

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-4 py-8 sm:items-center">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white"><Activity className="h-6 w-6" /></span>
          <span className="text-2xl font-bold tracking-tight text-slate-950">telemedconsult<span className="text-blue-600">.md</span></span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          {isDoctor && <DoctorRegistrationSteps current={choosing ? 3 : 4} />}
          {choosing
            ? <ChooseInstitution initial={registration?.institution_chosen ? (registration.requested_institution?.id ?? INDEPENDENT) : null} onSaved={() => { setEditing(false); void refreshUser(); }} onCancel={registration?.institution_chosen ? () => setEditing(false) : undefined} />
            : <Waiting label={role ? ROLE_LABEL[role] ?? 'furnizor' : 'furnizor'} name={user?.name} institution={isDoctor ? registration?.requested_institution ?? null : undefined}
                onChange={isDoctor ? () => setEditing(true) : undefined}
                onChecked={(next) => { if (next) navigate(next, { replace: true }); }} refreshUser={refreshUser} />}
        </div>
        <button type="button" onClick={() => void logout()} className="mx-auto mt-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"><LogOut className="h-4 w-4" />Ieși din cont</button>
      </div>
    </div>
  );
}

function ChooseInstitution({ initial, onSaved, onCancel }: { initial: number | null; onSaved: () => void; onCancel?: () => void }) {
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number | null>(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ data: Institution[] }>('/catalog/institutions', { auth: false })
      .then((response) => setInstitutions(response.data ?? []))
      .catch(() => { setInstitutions([]); setError('Nu am putut încărca instituțiile.'); });
  }, []);

  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('ro');
    return (institutions ?? []).filter((item) => !term || `${item.name} ${item.address ?? ''}`.toLocaleLowerCase('ro').includes(term));
  }, [institutions, query]);
  const chosen = picked === INDEPENDENT ? null : institutions?.find((item) => item.id === picked) ?? null;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/auth/registration/institution', { method: 'POST', body: JSON.stringify({ institution_id: picked === INDEPENDENT ? null : picked }) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva alegerea.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (confirming && picked !== null) {
    return (
      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Confirmă alegerea</h1>
          <p className="text-sm text-slate-500">Administratorul verifică datele tale și te adaugă în instituția aleasă. Poți schimba alegerea până la aprobare.</p>
        </div>
        <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-600">{chosen ? <Building2 className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold text-slate-950">{chosen ? chosen.name : 'Lucrez independent'}</span>
            <span className="text-[13px] text-slate-500">{chosen ? chosen.address || 'Instituție medicală' : 'Primești plățile direct de la platformă.'}</span>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={() => void save()} disabled={busy} className="h-12 flex-1 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Se trimite…' : 'Confirmă și trimite spre aprobare'}</button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-12 rounded-[10px] border border-slate-200 bg-white px-5 text-sm font-medium text-slate-950 hover:bg-slate-50">Înapoi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Unde lucrezi?</h1>
        <p className="text-sm text-slate-500">Alege instituția medicală prin care oferi consultații. Dacă lucrezi pe cont propriu, alege „Lucrez independent”.</p>
      </div>
      <label className="flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 px-3 focus-within:border-blue-600">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caută instituția" aria-label="Caută instituția" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
      </label>
      <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto" role="radiogroup" aria-label="Instituția">
        {institutions === null ? <p className="py-6 text-center text-sm text-slate-500">Se încarcă instituțiile…</p> : (
          <>
            {shown.map((item) => <Choice key={item.id} on={picked === item.id} onPick={() => setPicked(item.id)} icon={<Building2 className="h-[18px] w-[18px]" />} title={item.name} sub={item.address} />)}
            {!shown.length && <p className="py-3 text-center text-sm text-slate-500">{query ? 'Nicio instituție nu se potrivește căutării.' : 'Nu există încă instituții pe platformă.'}</p>}
          </>
        )}
        <Choice on={picked === INDEPENDENT} onPick={() => setPicked(INDEPENDENT)} icon={<UserRound className="h-[18px] w-[18px]" />} title="Lucrez independent" sub="Fără instituție; plățile vin de la platformă." />
      </div>
      <p className="text-xs text-slate-500">Nu-ți găsești instituția? Alege „Lucrez independent” și scrie-i administratorului după aprobare.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" onClick={() => setConfirming(true)} disabled={picked === null} className="h-12 flex-1 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">Continuă</button>
        {onCancel && <button type="button" onClick={onCancel} className="h-12 rounded-[10px] border border-slate-200 bg-white px-5 text-sm font-medium text-slate-950 hover:bg-slate-50">Renunță</button>}
      </div>
    </div>
  );
}

function Choice({ on, onPick, icon, title, sub }: { on: boolean; onPick: () => void; icon: React.ReactNode; title: string; sub?: string | null }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick}
      className={cn('flex items-center gap-3 rounded-xl p-3 text-left', on ? 'border-[1.5px] border-blue-600 bg-blue-50' : 'border border-slate-200 bg-white hover:border-slate-300')}>
      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-blue-600' : 'border-slate-300')}><span className={cn('h-2.5 w-2.5 rounded-full', on ? 'bg-blue-600' : 'bg-transparent')} /></span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-600">{icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5"><span className="text-[15px] font-semibold text-slate-950">{title}</span>{sub && <span className="truncate text-[13px] text-slate-500">{sub}</span>}</span>
    </button>
  );
}

function Waiting({ label, name, institution, onChange, onChecked, refreshUser }: {
  label: string; name?: string; institution?: Institution | null; onChange?: () => void; onChecked: (next: string | null) => void; refreshUser: () => Promise<{ status?: string; role: string } | null>;
}) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  const check = async () => {
    setChecking(true);
    setMessage('');
    const refreshed = await refreshUser();
    setChecking(false);
    if (refreshed?.status === 'active') { onChecked(refreshed.role === 'admin' ? '/admin' : `/${refreshed.role}`); return; }
    if (refreshed?.status === 'suspended' || refreshed?.status === 'rejected') { setMessage('Cererea ta nu a fost aprobată. Contactează echipa telemedconsult.md pentru detalii.'); return; }
    setMessage('Contul este încă în verificare. Te anunțăm prin email când e activat.');
  };

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-600"><Clock className="h-7 w-7" /></span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Așteaptă aprobarea</h1>
        <p className="text-sm text-slate-500">Bună{name ? `, ${name}` : ''}. Cererea ta de cont de {label} a ajuns la administrator. Te anunțăm prin email imediat ce contul e activat.</p>
      </div>
      {institution !== undefined && (
        <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-600">{institution ? <Building2 className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-xs text-slate-500">Ai ales</span>
            <span className="truncate text-[15px] font-semibold text-slate-950">{institution ? institution.name : 'Lucrez independent'}</span>
          </div>
          {onChange && <button type="button" onClick={onChange} className="text-sm font-medium text-blue-600 hover:underline">Schimbă</button>}
        </div>
      )}
      {message && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</p>}
      <button type="button" onClick={() => void check()} disabled={checking} className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />{checking ? 'Se verifică…' : 'Verifică starea contului'}
      </button>
    </div>
  );
}
