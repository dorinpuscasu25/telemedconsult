import React, { useEffect, useState } from 'react';
import { Handshake, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

type Partner = {
  id?: number;
  name: string;
  logo_url: string;
  website_url: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

const emptyPartner: Partner = {
  name: '',
  logo_url: '',
  website_url: '',
  description: '',
  sort_order: 0,
  is_active: true
};

export function AdminPartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [newPartner, setNewPartner] = useState<Partner>(emptyPartner);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadPartners = () => {
    apiRequest<{ data: Partial<Partner>[] }>('/admin/partners')
      .then((response) => setPartners((response.data ?? []).map((partner) => ({
        ...emptyPartner,
        ...partner,
        logo_url: partner.logo_url ?? '',
        website_url: partner.website_url ?? '',
        description: partner.description ?? ''
      }))))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca partenerii.'));
  };

  useEffect(() => {
    loadPartners();
  }, []);

  const notify = (text: string) => {
    setMessage(text);
    setError('');
  };
  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setMessage('');
  };

  const cleanPayload = (partner: Partner) => ({
    name: partner.name,
    logo_url: partner.logo_url || undefined,
    website_url: partner.website_url || undefined,
    description: partner.description || undefined,
    sort_order: partner.sort_order,
    is_active: partner.is_active
  });

  const savePartner = async (partner: Partner) => {
    setIsSaving(true);
    try {
      const path = partner.id ? `/admin/partners/${partner.id}` : '/admin/partners';
      await apiRequest(path, { method: partner.id ? 'PUT' : 'POST', body: JSON.stringify(cleanPayload(partner)) });
      if (!partner.id) setNewPartner(emptyPartner);
      notify(partner.id ? 'Partener actualizat.' : 'Partener creat.');
      loadPartners();
    } catch (err) {
      fail(err, 'Nu am putut salva partenerul.');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!partner.id || !window.confirm('Ștergi definitiv acest partener?')) return;
    setIsSaving(true);
    try {
      await apiRequest(`/admin/partners/${partner.id}`, { method: 'DELETE' });
      notify('Partener șters.');
      loadPartners();
    } catch (err) {
      fail(err, 'Nu am putut șterge partenerul.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Parteneri</h1>
        <p className="text-slate-500">Gestionează partenerii afișați pe pagina publică Parteneri.</p>
      </div>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Plus className="mr-2 h-5 w-5 text-primary" />
            Partener nou
          </CardTitle>
          <CardDescription>Ordinea afișării crește de la valori mai mici la mai mari.</CardDescription>
        </CardHeader>
        <CardContent>
          <PartnerForm partner={newPartner} onChange={setNewPartner} onSave={() => savePartner(newPartner)} isSaving={isSaving} />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {partners.length === 0 && (
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardContent className="p-8 text-center text-slate-500">Nu există parteneri.</CardContent>
          </Card>
        )}
        {partners.map((partner, index) => (
          <Card key={partner.id ?? index} className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <Handshake className="mr-2 h-5 w-5 text-primary" />
                    {partner.name || 'Partener fără nume'}
                  </CardTitle>
                  <CardDescription>{partner.is_active ? 'Activ și vizibil public.' : 'Inactiv — ascuns de pe site.'}</CardDescription>
                </div>
                <Button variant="outline" className="rounded-xl text-red-600" disabled={!partner.id || isSaving} onClick={() => deletePartner(partner)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Șterge
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PartnerForm
                partner={partner}
                onChange={(next) => setPartners((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))}
                onSave={() => savePartner(partner)}
                isSaving={isSaving}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PartnerForm({ partner, onChange, onSave, isSaving }: {
  partner: Partner;
  onChange: (partner: Partner) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
        <TextField label="Nume" value={partner.name} onChange={(value) => onChange({ ...partner, name: value })} />
        <NumberField label="Ordine" value={partner.sort_order} onChange={(value) => onChange({ ...partner, sort_order: value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="URL logo" value={partner.logo_url} onChange={(value) => onChange({ ...partner, logo_url: value })} />
        <TextField label="URL site" value={partner.website_url} onChange={(value) => onChange({ ...partner, website_url: value })} />
      </div>
      <div className="space-y-2">
        <Label>Descriere</Label>
        <Textarea
          value={partner.description}
          onChange={(event) => onChange({ ...partner, description: event.target.value })}
          className="min-h-[80px] rounded-xl bg-white/70"
          placeholder="Scurtă descriere a partenerului."
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[180px_auto] md:items-center">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4">
          <Label>Activ</Label>
          <Switch checked={partner.is_active} onCheckedChange={(checked) => onChange({ ...partner, is_active: checked })} />
        </div>
        <Button className="rounded-xl md:justify-self-start" disabled={isSaving || !partner.name.trim()} onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          Salvează
        </Button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl bg-white/70" />
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
