import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { apiRequest } from '../../lib/api';

type CardPackage = {
  id?: number;
  name: string;
  description: string;
  profile_slots: number;
  price: number;
  validity_days: number;
  is_active: boolean;
};

const emptyPackage: CardPackage = {
  name: '',
  description: '',
  profile_slots: 1,
  price: 0,
  validity_days: 365,
  is_active: true
};

export function PatientCardPackagesPage() {
  const [packages, setPackages] = useState<CardPackage[]>([]);
  const [newPackage, setNewPackage] = useState<CardPackage>(emptyPackage);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadPackages = () => {
    apiRequest<{ data: CardPackage[] }>('/admin/patient-card-packages')
      .then((response) => setPackages(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca pachetele.'));
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const notify = (text: string) => {
    setMessage(text);
    setError('');
  };

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setMessage('');
  };

  const savePackage = async (pack: CardPackage) => {
    setIsSaving(true);
    try {
      const path = pack.id ? `/admin/patient-card-packages/${pack.id}` : '/admin/patient-card-packages';
      await apiRequest(path, {
        method: pack.id ? 'PUT' : 'POST',
        body: JSON.stringify(pack)
      });
      if (!pack.id) setNewPackage(emptyPackage);
      notify(pack.id ? 'Pachet actualizat.' : 'Pachet creat.');
      loadPackages();
    } catch (err) {
      fail(err, 'Nu am putut salva pachetul.');
    } finally {
      setIsSaving(false);
    }
  };

  const deactivatePackage = async (pack: CardPackage) => {
    if (!pack.id || !window.confirm('Dezactivezi pachetul? Cumpărările vechi rămân valabile.')) return;
    setIsSaving(true);
    try {
      await apiRequest(`/admin/patient-card-packages/${pack.id}`, { method: 'DELETE' });
      notify('Pachet dezactivat.');
      loadPackages();
    } catch (err) {
      fail(err, 'Nu am putut dezactiva pachetul.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Pachete / Cartele</h1>
        <p className="text-slate-500">Configurează abonamentele care deblochează profiluri de pacient.</p>
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
            Pachet nou
          </CardTitle>
          <CardDescription>Prețul și descrierea apar pe cardurile de subscription din contul pacientului.</CardDescription>
        </CardHeader>
        <CardContent>
          <PackageForm
            pack={newPackage}
            onChange={setNewPackage}
            onSave={() => savePackage(newPackage)}
            isSaving={isSaving}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {packages.length === 0 && (
          <Card className="border-slate-200/70 bg-white shadow-sm">
            <CardContent className="p-8 text-center text-slate-500">Nu există pachete configurate.</CardContent>
          </Card>
        )}
        {packages.map((pack, index) => (
          <Card key={pack.id ?? index} className="border-slate-200/70 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <CreditCard className="mr-2 h-5 w-5 text-primary" />
                    {pack.name || 'Pachet fără nume'}
                  </CardTitle>
                  <CardDescription>{pack.is_active ? 'Activ și disponibil pentru cumpărare.' : 'Inactiv. Rămâne doar pentru istoricul cumpărărilor.'}</CardDescription>
                </div>
                <Button variant="outline" className="rounded-xl text-red-600" disabled={!pack.id || isSaving || !pack.is_active} onClick={() => deactivatePackage(pack)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Dezactivează
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PackageForm
                pack={pack}
                onChange={(next) => setPackages((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))}
                onSave={() => savePackage(pack)}
                isSaving={isSaving}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PackageForm({ pack, onChange, onSave, isSaving }: {
  pack: CardPackage;
  onChange: (pack: CardPackage) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[1.2fr_repeat(3,160px)]">
        <TextField label="Nume" value={pack.name} onChange={(value) => onChange({ ...pack, name: value })} />
        <NumberField label="Preț (MDL)" value={pack.price} onChange={(value) => onChange({ ...pack, price: value })} />
        <NumberField label="Profiluri" value={pack.profile_slots} onChange={(value) => onChange({ ...pack, profile_slots: value })} />
        <NumberField label="Valabilitate (zile)" value={pack.validity_days} onChange={(value) => onChange({ ...pack, validity_days: value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
        <div className="space-y-2">
          <Label>Descriere</Label>
          <Textarea
            value={pack.description || ''}
            onChange={(event) => onChange({ ...pack, description: event.target.value })}
            className="min-h-[90px] rounded-xl bg-white/70"
            placeholder="Explică pe scurt ce primește pacientul în acest pachet."
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 p-4">
          <Label>Activ</Label>
          <Switch checked={pack.is_active} onCheckedChange={(checked) => onChange({ ...pack, is_active: checked })} />
        </div>
        <Button className="rounded-xl" disabled={isSaving || !pack.name.trim()} onClick={onSave}>
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
