import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Handshake, ImagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

type Partner = {
  id?: number;
  name: string;
  category: string;
  logo_url: string;
  website_url: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  logo_file?: File | null;
  remove_logo?: boolean;
};

const emptyPartner: Partner = {
  name: '',
  category: '',
  logo_url: '',
  website_url: '',
  description: '',
  sort_order: 0,
  is_active: true,
  logo_file: null,
  remove_logo: false
};

/**
 * Partenerii afișați pe pagina publică. Lista rămâne compactă oricâți ar fi;
 * adăugarea și editarea se fac într-un dialog.
 */
export function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState<Partner | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadPartners = useCallback(() => {
    apiRequest<{ data: Partial<Partner>[] }>('/admin/partners')
      .then((response) => setPartners((response.data ?? []).map((partner) => ({
        ...emptyPartner,
        ...partner,
        logo_url: partner.logo_url ?? '',
        website_url: partner.website_url ?? '',
        description: partner.description ?? '',
        category: partner.category ?? '',
        logo_file: null,
        remove_logo: false
      }))))
      .catch((err) => { setPartners([]); toast.error(err instanceof Error ? err.message : 'Nu am putut încărca partenerii.'); });
  }, []);

  useEffect(() => { loadPartners(); }, [loadPartners]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!partners || !needle) return partners ?? [];
    return partners.filter((partner) => `${partner.name} ${partner.category}`.toLowerCase().includes(needle));
  }, [partners, query]);

  const openForm = (partner: Partner | null) => {
    setError('');
    setEditing(partner ? { ...partner } : { ...emptyPartner, sort_order: partners?.length ?? 0 });
  };

  const formPayload = (partner: Partner) => {
    const form = new FormData();
    form.append('name', partner.name.trim());
    form.append('category', partner.category.trim());
    form.append('website_url', partner.website_url.trim());
    form.append('description', partner.description.trim());
    form.append('sort_order', String(partner.sort_order));
    form.append('is_active', partner.is_active ? '1' : '0');
    form.append('remove_logo', partner.remove_logo ? '1' : '0');
    if (partner.logo_file) form.append('logo', partner.logo_file);
    if (partner.id) form.append('_method', 'PUT');
    return form;
  };

  const savePartner = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setIsSaving(true);
    setError('');
    try {
      const path = editing.id ? `/admin/partners/${editing.id}` : '/admin/partners';
      await apiRequest(path, { method: 'POST', body: formPayload(editing) });
      toast.success(editing.id ? 'Partener actualizat.' : 'Partener adăugat.');
      setEditing(null);
      loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva partenerul.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePartner = async () => {
    if (!deleting?.id) return;
    setIsSaving(true);
    try {
      await apiRequest(`/admin/partners/${deleting.id}`, { method: 'DELETE' });
      toast.success('Partener șters.');
      setDeleting(null);
      loadPartners();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut șterge partenerul.');
    } finally {
      setIsSaving(false);
    }
  };

  const addButton = <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" />Adaugă partener</Button>;

  return (
    <div className="space-y-6">
      <PageHeader title="Parteneri" description="Partenerii afișați pe pagina publică Parteneri, în ordinea crescătoare a câmpului „Ordine”." actions={addButton} />

      {!partners ? <ListSkeleton rows={4} /> : partners.length === 0 ? (
        <EmptyState icon={Handshake} title="Niciun partener încă" description="Adaugă primul partener afișat pe site." action={addButton} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Caută după nume sau categorie" className="pl-9" aria-label="Caută parteneri" />
            </div>
            <span className="ml-auto shrink-0 text-sm text-slate-500">{visible.length} din {partners.length}</span>
          </div>
          {visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Niciun partener nu se potrivește căutării.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((partner) => (
                <li key={partner.id} className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:w-16">
                    {partner.logo_url ? <img src={partner.logo_url} alt="" className="h-full w-full object-contain p-1" /> : <Handshake className="h-5 w-5 text-slate-300" />}
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openForm(partner)}>
                    <span className="block truncate font-medium text-slate-950">{partner.name || 'Partener fără nume'}</span>
                    <span className="block truncate text-sm text-slate-500">{partner.category || 'Fără categorie'}{partner.website_url && ` · ${partner.website_url.replace(/^https?:\/\//, '')}`}</span>
                  </button>
                  <span className="hidden w-16 shrink-0 text-right text-sm tabular text-slate-500 sm:block" title="Ordine">#{partner.sort_order}</span>
                  <ToneBadge tone={partner.is_active ? 'success' : 'neutral'}>{partner.is_active ? 'Activ' : 'Ascuns'}</ToneBadge>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Editează ${partner.name}`} onClick={() => openForm(partner)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Șterge ${partner.name}`} className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleting(partner)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(value) => { if (!value && !isSaving) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {editing && (
            <form onSubmit={savePartner} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{editing.id ? 'Editează partenerul' : 'Partener nou'}</DialogTitle>
                <DialogDescription>Ordinea afișării crește de la valori mai mici la mai mari.</DialogDescription>
              </DialogHeader>
              {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <PartnerForm partner={editing} onChange={setEditing} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={isSaving}>Renunță</Button>
                <Button type="submit" disabled={isSaving || !editing.name.trim()}>{isSaving ? 'Se salvează…' : editing.id ? 'Salvează' : 'Adaugă partenerul'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(value) => { if (!value && !isSaving) setDeleting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ștergi {deleting?.name}?</DialogTitle>
            <DialogDescription>Partenerul dispare de pe site. Acțiunea nu poate fi anulată; dacă vrei doar să-l ascunzi, dezactivează-l din editare.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)} disabled={isSaving}>Renunță</Button>
            <Button type="button" variant="destructive" onClick={() => { void deletePartner(); }} disabled={isSaving}>{isSaving ? 'Se șterge…' : 'Șterge partenerul'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartnerForm({ partner, onChange }: { partner: Partner; onChange: (partner: Partner) => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <TextField label="Nume" value={partner.name} onChange={(value) => onChange({ ...partner, name: value })} required />
        <NumberField label="Ordine" value={partner.sort_order} onChange={(value) => onChange({ ...partner, sort_order: value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Categorie (ex: Clinică)" value={partner.category} onChange={(value) => onChange({ ...partner, category: value })} />
        <TextField label="URL site" value={partner.website_url} onChange={(value) => onChange({ ...partner, website_url: value })} />
      </div>
      <PartnerLogoUpload partner={partner} onChange={onChange} />
      <div className="space-y-2">
        <Label htmlFor="partner-description">Descriere</Label>
        <Textarea
          id="partner-description"
          value={partner.description}
          onChange={(event) => onChange({ ...partner, description: event.target.value })}
          className="min-h-[80px] rounded-xl bg-white/70"
          placeholder="Scurtă descriere a partenerului."
        />
      </div>
      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4">
        <span className="text-sm font-medium">Activ (vizibil pe site)</span>
        <Switch checked={partner.is_active} onCheckedChange={(checked) => onChange({ ...partner, is_active: checked })} />
      </label>
    </div>
  );
}

function PartnerLogoUpload({ partner, onChange }: { partner: Partner; onChange: (partner: Partner) => void }) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const previewUrl = useImagePreview(partner.logo_file ?? null, partner.remove_logo ? null : partner.logo_url || null);

  const clearLogo = () => {
    if (inputRef.current) inputRef.current.value = '';
    onChange({ ...partner, logo_file: null, remove_logo: Boolean(partner.logo_url) });
  };

  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white/70 p-4 sm:grid-cols-[160px_1fr] sm:items-center">
      <div className="grid h-24 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
        {previewUrl ? <img src={previewUrl} alt={`Logo ${partner.name || 'partener'}`} className="h-full w-full object-contain p-2" /> : <ImagePlus className="h-7 w-7 text-slate-300" />}
      </div>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Încarcă logo</Label>
          <Input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="rounded-xl bg-white"
            onChange={(event) => onChange({ ...partner, logo_file: event.target.files?.[0] ?? null, remove_logo: false })}
          />
        </div>
        <p className="text-xs text-slate-500">JPG, PNG sau WebP, maximum 5 MB.</p>
        {previewUrl && (
          <Button type="button" variant="outline" size="sm" className="rounded-lg text-red-600" onClick={clearLogo}>
            <Trash2 className="mr-2 h-4 w-4" /> Elimină logo-ul
          </Button>
        )}
      </div>
    </div>
  );
}

function useImagePreview(file: File | null, currentUrl: string | null): string | null {
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => {
    if (!file) {
      setPreview(currentUrl);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [currentUrl, file]);

  return preview;
}

function TextField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl bg-white/70" />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min={0} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} className="rounded-xl bg-white/70" />
    </div>
  );
}
