import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { apiRequest } from '../../lib/api';

const REGION_TYPES = [
  { value: 'raion', label: 'Raion' },
  { value: 'municipiu', label: 'Municipiu' },
  { value: 'uta', label: 'UTA' },
  { value: 'unitate_teritoriala', label: 'Unitate teritorială' }
];

const LOCALITY_TYPES = [
  { value: 'oras', label: 'Oraș' },
  { value: 'municipiu', label: 'Municipiu' },
  { value: 'sat', label: 'Sat' },
  { value: 'comuna', label: 'Comună' }
];

interface Locality {
  id: number;
  region_id: number;
  name: string;
  type: string;
  is_active: boolean;
}

interface Region {
  id: number;
  name: string;
  type: string;
  country: string;
  is_active: boolean;
  localities: Locality[];
}

interface PatientCountry { code: string | null; name: string; profiles: number; localities: Array<{ region: string | null; city: string | null; locality: string | null; profiles: number }> }

const emptyRegionForm = { name: '', type: 'raion', country: 'Republica Moldova', is_active: true };
const emptyLocalityForm = { name: '', type: 'oras', is_active: true };

const typeLabel = (types: { value: string; label: string }[], value: string) =>
  types.find((item) => item.value === value)?.label ?? value;

export function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [countries, setCountries] = useState<PatientCountry[]>([]);
  const [geographyScope, setGeographyScope] = useState<'MD' | 'foreign'>('MD');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [geographyError, setGeographyError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [regionForm, setRegionForm] = useState(emptyRegionForm);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [isRegionModalOpen, setIsRegionModalOpen] = useState(false);

  const [localityForm, setLocalityForm] = useState(emptyLocalityForm);
  const [localityRegion, setLocalityRegion] = useState<Region | null>(null);
  const [editingLocality, setEditingLocality] = useState<Locality | null>(null);
  const [isLocalityModalOpen, setIsLocalityModalOpen] = useState(false);

  const loadRegions = () => {
    apiRequest<{ data: PatientCountry[] }>('/admin/geo/patients')
      .then((response) => { setCountries(response.data); setGeographyError(''); })
      .catch(() => setGeographyError('Distribuția pacienților nu a putut fi încărcată.'));
    apiRequest<{ data: Region[] }>('/admin/geo/regions')
      .then((response) => setRegions(response.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Nu am putut încărca regiunile.'));
  };

  useEffect(() => {
    loadRegions();
  }, []);

  const visibleRegions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return regions;

    return regions.filter(
      (region) =>
        region.name.toLowerCase().includes(query) ||
        region.localities.some((locality) => locality.name.toLowerCase().includes(query))
    );
  }, [regions, searchTerm]);
  const patientCountries = countries.filter((country) => geographyScope === 'MD' ? country.code === 'MD' : country.code !== 'MD');
  const patientCountry = patientCountries.find((country) => (country.code || country.name) === selectedCountry) ?? patientCountries[0];

  const openCreateRegion = () => {
    setError('');
    setEditingRegion(null);
    setRegionForm(emptyRegionForm);
    setIsRegionModalOpen(true);
  };

  const openEditRegion = (region: Region) => {
    setError('');
    setEditingRegion(region);
    setRegionForm({ name: region.name, type: region.type, country: region.country, is_active: region.is_active });
    setIsRegionModalOpen(true);
  };

  const saveRegion = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await apiRequest(editingRegion ? `/admin/geo/regions/${editingRegion.id}` : '/admin/geo/regions', {
        method: editingRegion ? 'PUT' : 'POST',
        body: JSON.stringify(regionForm)
      });
      setIsRegionModalOpen(false);
      loadRegions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva regiunea.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleRegionActive = async (region: Region) => {
    setError('');
    try {
      await apiRequest(`/admin/geo/regions/${region.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: region.name,
          type: region.type,
          country: region.country,
          is_active: !region.is_active
        })
      });
      loadRegions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut actualiza regiunea.');
    }
  };

  const openCreateLocality = (region: Region) => {
    setError('');
    setLocalityRegion(region);
    setEditingLocality(null);
    setLocalityForm(emptyLocalityForm);
    setIsLocalityModalOpen(true);
  };

  const openEditLocality = (region: Region, locality: Locality) => {
    setError('');
    setLocalityRegion(region);
    setEditingLocality(locality);
    setLocalityForm({ name: locality.name, type: locality.type, is_active: locality.is_active });
    setIsLocalityModalOpen(true);
  };

  const saveLocality = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!localityRegion) return;
    setError('');
    setIsSaving(true);
    try {
      await apiRequest(
        editingLocality
          ? `/admin/geo/localities/${editingLocality.id}`
          : `/admin/geo/regions/${localityRegion.id}/localities`,
        {
          method: editingLocality ? 'PUT' : 'POST',
          body: JSON.stringify(localityForm)
        }
      );
      setIsLocalityModalOpen(false);
      loadRegions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva localitatea.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleLocalityActive = async (locality: Locality) => {
    setError('');
    try {
      await apiRequest(`/admin/geo/localities/${locality.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: locality.name, type: locality.type, is_active: !locality.is_active })
      });
      loadRegions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut actualiza localitatea.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Regiuni și localități</h1>
          <p className="max-w-3xl text-slate-500">
            Catalogul de raioane, municipii și localități folosit pentru adresa pacientului și atribuirea operatorilor.
            Regiunile se dezactivează, nu se șterg, pentru a păstra adresele existente.
          </p>
        </div>
        <Button type="button" size="lg" className="h-11 rounded-lg px-4 sm:self-center" onClick={openCreateRegion}>
          <Plus className="mr-2 h-4 w-4" />
          Adaugă regiune
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Unde locuiesc pacienții</CardTitle><p className="text-sm text-slate-500">Numărăm profilurile de pacient existente. Mai multe profiluri din același cont se numără separat.</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2"><Button variant={geographyScope === 'MD' ? 'default' : 'outline'} onClick={() => setGeographyScope('MD')}>Republica Moldova</Button><Button variant={geographyScope === 'foreign' ? 'default' : 'outline'} onClick={() => setGeographyScope('foreign')}>Alte țări</Button></div>
          {geographyError && <p role="alert" className="text-sm text-red-700">{geographyError}</p>}
          {patientCountry ? <>
            <label className="flex max-w-sm flex-col gap-1 text-sm">Țara<select aria-label="Țara din raport" className="h-11 rounded-xl border border-slate-200 px-3" value={patientCountry.code || patientCountry.name} onChange={(event) => setSelectedCountry(event.target.value)}>{patientCountries.map((country) => <option key={country.code || country.name} value={country.code || country.name}>{country.name} · {country.profiles} profiluri</option>)}</select></label>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Regiune / district</th><th className="p-2">Oraș</th><th className="p-2">Localitate</th><th className="p-2 text-right">Profiluri</th></tr></thead><tbody>{patientCountry.localities.map((location, index) => <tr key={index} className="border-b border-slate-100"><td className="p-2">{location.region || '—'}</td><td className="p-2">{location.city || '—'}</td><td className="p-2">{location.locality || 'Nespecificată'}</td><td className="p-2 text-right font-semibold">{location.profiles}</td></tr>)}</tbody></table></div>
          </> : !geographyError && <p className="text-sm text-slate-500">Nu există încă profiluri în această categorie.</p>}
        </CardContent>
      </Card>

      <Card className="glass-card border-0">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center">
              <MapPin className="mr-2 h-5 w-5 text-primary" /> Catalog regiuni
            </CardTitle>
            <Button variant="outline" size="sm" className="h-9 self-start rounded-lg lg:self-center" onClick={loadRegions}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reîncarcă
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[460px]">
            <Input
              className="h-10 rounded-lg bg-white"
              placeholder="Caută după regiune sau localitate"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Button type="button" variant="outline" className="h-10 rounded-lg">
              <Search className="mr-2 h-4 w-4" />
              Caută
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {visibleRegions.map((region) => (
            <div key={region.id} className="rounded-xl border border-slate-200 bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">{region.name}</span>
                  <Badge variant="outline" className="bg-slate-50 text-slate-700">
                    {typeLabel(REGION_TYPES, region.type)}
                  </Badge>
                  {!region.is_active && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Inactivă
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    Activă
                    <Switch checked={region.is_active} onCheckedChange={() => toggleRegionActive(region)} />
                  </label>
                  <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => openEditRegion(region)}>
                    <Pencil className="mr-1 h-4 w-4" /> Editează
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openCreateLocality(region)}>
                    <Plus className="mr-1 h-4 w-4" /> Localitate
                  </Button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {region.localities.length === 0 && (
                  <span className="text-sm text-slate-400">Nicio localitate adăugată.</span>
                )}
                {region.localities.map((locality) => (
                  <button
                    key={locality.id}
                    type="button"
                    onClick={() => openEditLocality(region, locality)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                      locality.is_active
                        ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        : 'border-amber-200 bg-amber-50 text-amber-700 line-through'
                    }`}
                  >
                    {locality.name}
                    <span className="text-xs text-slate-400">{typeLabel(LOCALITY_TYPES, locality.type)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {visibleRegions.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              Nicio regiune pentru filtrul selectat.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isRegionModalOpen} onOpenChange={setIsRegionModalOpen}>
        <DialogContent className="rounded-2xl border-0 bg-white sm:max-w-lg">
          <form onSubmit={saveRegion}>
            <DialogHeader>
              <DialogTitle>{editingRegion ? 'Editează regiune' : 'Adaugă regiune'}</DialogTitle>
              <DialogDescription>Raion, municipiu sau altă unitate administrativ-teritorială.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <div className="space-y-2">
                <Label>Nume</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={regionForm.name}
                  onChange={(event) => setRegionForm({ ...regionForm, name: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tip</Label>
                <Select value={regionForm.type} onValueChange={(type) => setRegionForm({ ...regionForm, type })}>
                  <SelectTrigger className="h-11 rounded-lg bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Țară</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={regionForm.country}
                  onChange={(event) => setRegionForm({ ...regionForm, country: event.target.value })}
                  required
                />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">Regiune activă</span>
                <Switch
                  checked={regionForm.is_active}
                  onCheckedChange={(is_active) => setRegionForm({ ...regionForm, is_active })}
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => setIsRegionModalOpen(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={isSaving} className="rounded-lg">
                {isSaving ? 'Se salvează...' : 'Salvează'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isLocalityModalOpen} onOpenChange={setIsLocalityModalOpen}>
        <DialogContent className="rounded-2xl border-0 bg-white sm:max-w-lg">
          <form onSubmit={saveLocality}>
            <DialogHeader>
              <DialogTitle>{editingLocality ? 'Editează localitate' : 'Adaugă localitate'}</DialogTitle>
              <DialogDescription>{localityRegion ? `Regiune: ${localityRegion.name}` : ''}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <div className="space-y-2">
                <Label>Nume</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={localityForm.name}
                  onChange={(event) => setLocalityForm({ ...localityForm, name: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tip</Label>
                <Select value={localityForm.type} onValueChange={(type) => setLocalityForm({ ...localityForm, type })}>
                  <SelectTrigger className="h-11 rounded-lg bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALITY_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">Localitate activă</span>
                <Switch
                  checked={localityForm.is_active}
                  onCheckedChange={(is_active) => setLocalityForm({ ...localityForm, is_active })}
                />
              </label>
            </div>
            <DialogFooter>
              {editingLocality && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto rounded-lg text-amber-700"
                  onClick={() => {
                    toggleLocalityActive(editingLocality);
                    setIsLocalityModalOpen(false);
                  }}
                >
                  {editingLocality.is_active ? 'Dezactivează' : 'Reactivează'}
                </Button>
              )}
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => setIsLocalityModalOpen(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={isSaving} className="rounded-lg">
                {isSaving ? 'Se salvează...' : 'Salvează'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
