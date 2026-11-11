import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CreditCard, Pencil, Plus } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { ListSkeleton } from '../../components/ui/skeleton';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { ToneBadge } from '../../components/app/StatusBadge';
import { apiRequest } from '../../lib/api';
import { mdl } from '../../lib/doctor';

type CardPackage = {
  id?: number;
  name: string;
  description: string;
  profile_slots: number;
  price: number;
  bonus_points: number;
  validity_days: number;
  is_active: boolean;
};

const emptyPackage: CardPackage = {
  name: '',
  description: '',
  profile_slots: 1,
  price: 0,
  bonus_points: 0,
  validity_days: 365,
  is_active: true
};

/**
 * Abonamentele care deblochează profiluri de pacient. Lista rămâne compactă;
 * adăugarea și editarea se fac într-un dialog.
 */
export function PatientCardPackagesPage() {
  const [packages, setPackages] = useState<CardPackage[] | null>(null);
  const [editing, setEditing] = useState<CardPackage | null>(null);
  const [deactivating, setDeactivating] = useState<CardPackage | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadPackages = useCallback(() => {
    apiRequest<{ data: CardPackage[] }>('/admin/patient-card-packages')
      .then((response) => setPackages(response.data ?? []))
      .catch((err) => { setPackages([]); toast.error(err instanceof Error ? err.message : 'Nu am putut încărca pachetele.'); });
  }, []);

  useEffect(() => { loadPackages(); }, [loadPackages]);

  const openForm = (pack: CardPackage | null) => {
    setError('');
    setEditing(pack ? { ...pack, description: pack.description ?? '' } : { ...emptyPackage });
  };

  const savePackage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setIsSaving(true);
    setError('');
    try {
      const path = editing.id ? `/admin/patient-card-packages/${editing.id}` : '/admin/patient-card-packages';
      await apiRequest(path, { method: editing.id ? 'PUT' : 'POST', body: JSON.stringify(editing) });
      toast.success(editing.id ? 'Pachet actualizat.' : 'Pachet creat.');
      setEditing(null);
      loadPackages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva pachetul.');
    } finally {
      setIsSaving(false);
    }
  };

  const deactivatePackage = async () => {
    if (!deactivating?.id) return;
    setIsSaving(true);
    try {
      await apiRequest(`/admin/patient-card-packages/${deactivating.id}`, { method: 'DELETE' });
      toast.success('Pachet dezactivat.');
      setDeactivating(null);
      loadPackages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut dezactiva pachetul.');
    } finally {
      setIsSaving(false);
    }
  };

  const addButton = <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" />Adaugă pachet</Button>;

  return (
    <div className="space-y-6">
      <PageHeader title="Pachete / Cartele" description="Abonamentele care deblochează profiluri de pacient. Prețul și descrierea apar pe cardurile din contul pacientului." actions={addButton} />

      {!packages ? <ListSkeleton rows={3} /> : packages.length === 0 ? (
        <EmptyState icon={CreditCard} title="Niciun pachet încă" description="Adaugă primul pachet pe care pacienții îl pot cumpăra." action={addButton} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_110px_90px_110px_90px_88px] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <span>Pachet</span>
            <span className="text-right">Preț</span>
            <span className="text-right">Bonus</span>
            <span className="text-right">Profiluri</span>
            <span className="text-right">Valabilitate</span>
            <span>Status</span>
            <span className="sr-only">Acțiuni</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {packages.map((pack) => (
              <li key={pack.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_110px_110px_90px_110px_90px_88px]">
                <button type="button" className="min-w-0 text-left" onClick={() => openForm(pack)}>
                  <span className="block truncate font-medium text-slate-950">{pack.name || 'Pachet fără nume'}</span>
                  <span className="block truncate text-sm text-slate-500">{pack.description || 'Fără descriere'}</span>
                  <span className="mt-1 block text-sm text-slate-600 md:hidden">
                    {mdl(pack.price)} · {pack.profile_slots} {pack.profile_slots === 1 ? 'profil' : 'profiluri'} · {pack.validity_days} zile{pack.bonus_points > 0 && ` · +${pack.bonus_points} puncte`}
                  </span>
                </button>
                <span className="hidden text-right font-semibold tabular text-slate-900 md:block">{mdl(pack.price)}</span>
                <span className="hidden text-right tabular text-slate-600 md:block">{pack.bonus_points > 0 ? `${pack.bonus_points} puncte` : '—'}</span>
                <span className="hidden text-right tabular text-slate-600 md:block">{pack.profile_slots}</span>
                <span className="hidden text-right tabular text-slate-600 md:block">{pack.validity_days} zile</span>
                <span className="hidden md:block"><ToneBadge tone={pack.is_active ? 'success' : 'neutral'}>{pack.is_active ? 'Activ' : 'Inactiv'}</ToneBadge></span>
                <div className="row-span-1 flex shrink-0 items-center justify-end gap-1 max-md:col-start-2 max-md:row-start-1">
                  <span className="md:hidden"><ToneBadge tone={pack.is_active ? 'success' : 'neutral'}>{pack.is_active ? 'Activ' : 'Inactiv'}</ToneBadge></span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Editează ${pack.name}`} onClick={() => openForm(pack)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Dezactivează ${pack.name}`} disabled={!pack.is_active} className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeactivating(pack)}><Ban className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(value) => { if (!value && !isSaving) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {editing && (
            <form onSubmit={savePackage} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{editing.id ? 'Editează pachetul' : 'Pachet nou'}</DialogTitle>
                <DialogDescription>Prețul și descrierea apar pe cardurile din contul pacientului. Cumpărările existente își păstrează condițiile.</DialogDescription>
              </DialogHeader>
              {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <PackageForm pack={editing} onChange={setEditing} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={isSaving}>Renunță</Button>
                <Button type="submit" disabled={isSaving || !editing.name.trim()}>{isSaving ? 'Se salvează…' : editing.id ? 'Salvează' : 'Adaugă pachetul'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deactivating)} onOpenChange={(value) => { if (!value && !isSaving) setDeactivating(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dezactivezi {deactivating?.name}?</DialogTitle>
            <DialogDescription>Pachetul nu mai poate fi cumpărat. Cumpărările vechi rămân valabile, iar pachetul rămâne în istoric. Îl poți reactiva din editare.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeactivating(null)} disabled={isSaving}>Renunță</Button>
            <Button type="button" variant="destructive" onClick={() => { void deactivatePackage(); }} disabled={isSaving}>{isSaving ? 'Se dezactivează…' : 'Dezactivează'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PackageForm({ pack, onChange }: { pack: CardPackage; onChange: (pack: CardPackage) => void }) {
  return (
    <div className="grid gap-4">
      <TextField id="pack-name" label="Nume" value={pack.name} onChange={(value) => onChange({ ...pack, name: value })} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <NumberField id="pack-price" label="Preț (MDL)" value={pack.price} onChange={(value) => onChange({ ...pack, price: value })} />
        <NumberField id="pack-bonus" label="Bonus (puncte)" value={pack.bonus_points ?? 0} onChange={(value) => onChange({ ...pack, bonus_points: Math.max(0, value) })} />
        <NumberField id="pack-slots" label="Profiluri" value={pack.profile_slots} onChange={(value) => onChange({ ...pack, profile_slots: value })} />
        <NumberField id="pack-days" label="Valabilitate (zile)" value={pack.validity_days} onChange={(value) => onChange({ ...pack, validity_days: value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pack-description">Descriere</Label>
        <Textarea
          id="pack-description"
          value={pack.description || ''}
          onChange={(event) => onChange({ ...pack, description: event.target.value })}
          className="min-h-[90px] rounded-xl bg-white/70"
          placeholder="Explică pe scurt ce primește pacientul în acest pachet."
        />
      </div>
      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4">
        <span className="text-sm font-medium">Activ (poate fi cumpărat)</span>
        <Switch checked={pack.is_active} onCheckedChange={(checked) => onChange({ ...pack, is_active: checked })} />
      </label>
    </div>
  );
}

function TextField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl bg-white/70" />
    </div>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} className="rounded-xl bg-white/70" />
    </div>
  );
}
