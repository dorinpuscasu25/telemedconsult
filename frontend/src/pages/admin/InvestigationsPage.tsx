import React, { useEffect, useState } from 'react';
import { Activity, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';

interface InvestigationType {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  default_price: number;
  requires_device: boolean;
  higo_exam_type: string | null;
  is_active: boolean;
}

const NO_HIGO = '__none__';

const DEFAULT_FORM = {
  name: '',
  code: '',
  description: '',
  default_price: 0,
  requires_device: true,
  higo_exam_type: NO_HIGO,
  is_active: true
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export function InvestigationsPage() {
  const [investigations, setInvestigations] = useState<InvestigationType[]>([]);
  const [higoTypes, setHigoTypes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editing, setEditing] = useState<InvestigationType | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    apiRequest<{ data: InvestigationType[]; higo_exam_types: string[] }>('/admin/investigation-types').then((response) => {
      setInvestigations(response.data ?? []);
      setHigoTypes(response.higo_exam_types ?? []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const visible = investigations.filter((item) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query);
  });

  const openCreate = () => {
    setError('');
    setEditing(null);
    setForm(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (item: InvestigationType) => {
    setError('');
    setEditing(item);
    setForm({
      name: item.name,
      code: item.code,
      description: item.description ?? '',
      default_price: item.default_price,
      requires_device: item.requires_device,
      higo_exam_type: item.higo_exam_type ?? NO_HIGO,
      is_active: item.is_active
    });
    setIsModalOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const payload = {
        name: form.name,
        code: form.code || slugify(form.name),
        description: form.description || null,
        default_price: Number(form.default_price) || 0,
        requires_device: form.requires_device,
        higo_exam_type: form.higo_exam_type === NO_HIGO ? null : form.higo_exam_type,
        is_active: form.is_active
      };

      await apiRequest(editing ? `/admin/investigation-types/${editing.id}` : '/admin/investigation-types', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      setIsModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva investigația.');
    } finally {
      setIsSaving(false);
    }
  };

  const deactivate = async (item: InvestigationType) => {
    if (!window.confirm(`Dezactivezi investigația ${item.name}? Rămâne în istoricul consultațiilor existente.`)) return;
    setProcessingId(item.id);
    try {
      await apiRequest(`/admin/investigation-types/${item.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut dezactiva investigația.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Catalog investigații</h1>
          <p className="max-w-3xl text-slate-500">
            Tipurile de investigații efectuate la domiciliu, prețul default și maparea către tipul de examen HIGO.
            Prețul se setează aici (0 = nesetat); investigațiile se dezactivează, nu se șterg.
          </p>
        </div>
        <Button type="button" size="lg" className="h-11 rounded-lg px-4 sm:self-center" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Adaugă investigație
        </Button>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5 text-primary" /> Investigații
            </CardTitle>
            <Button variant="outline" size="sm" className="h-9 self-start rounded-lg lg:self-center" onClick={load}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reîncarcă
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[460px]">
            <Input
              className="h-10 rounded-lg bg-white"
              placeholder="Caută după nume sau cod"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Button type="button" variant="outline" className="h-10 rounded-lg">
              <Search className="mr-2 h-4 w-4" />
              Caută
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200/70 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investigație</TableHead>
                  <TableHead>Preț default</TableHead>
                  <TableHead>Aparat</TableHead>
                  <TableHead>Mapare HIGO</TableHead>
                  <TableHead>Stare</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item) => (
                  <TableRow key={item.id} className={item.is_active ? '' : 'opacity-60'}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-400">{item.code}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {item.default_price ? `${item.default_price} MDL` : <span className="text-amber-600">nesetat</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-50 text-slate-700">
                        {item.requires_device ? 'Necesită' : 'Nu'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{item.higo_exam_type ?? '—'}</TableCell>
                    <TableCell>
                      {item.is_active ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Activă</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Inactivă</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Acțiuni investigație</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                            Editează
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className={`cursor-pointer ${processingId === item.id || !item.is_active ? 'opacity-50' : ''}`}
                            onClick={() => {
                              if (processingId !== item.id && item.is_active) deactivate(item);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Dezactivează
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {visible.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-500">
                      Nicio investigație pentru filtrul selectat.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-lg bg-white p-0 sm:max-w-xl">
          <form onSubmit={save}>
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                {editing ? 'Editează investigație' : 'Adaugă investigație'}
              </DialogTitle>
              <DialogDescription>Numele apare la medic/operator; codul este identificatorul stabil.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              {error && (
                <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <div className="space-y-2">
                <Label>Nume</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value, code: editing ? form.code : slugify(event.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Cod</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: slugify(event.target.value) })}
                  placeholder="ex: throat_exam"
                />
              </div>
              <div className="space-y-2">
                <Label>Preț default (MDL)</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-11 rounded-lg bg-white"
                  value={form.default_price}
                  onChange={(event) => setForm({ ...form, default_price: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mapare HIGO</Label>
                <Select value={form.higo_exam_type} onValueChange={(value) => setForm({ ...form, higo_exam_type: value })}>
                  <SelectTrigger className="h-11 w-full bg-white px-3">
                    <span>{form.higo_exam_type === NO_HIGO ? 'Fără mapare' : form.higo_exam_type}</span>
                  </SelectTrigger>
                  <SelectContent className="max-h-64 w-full min-w-[240px] overflow-y-auto">
                    <SelectItem value={NO_HIGO}>Fără mapare</SelectItem>
                    {higoTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Descriere</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">Necesită aparat</span>
                <Switch checked={form.requires_device} onCheckedChange={(requires_device) => setForm({ ...form, requires_device })} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">Activă</span>
                <Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />
              </label>
            </div>

            <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => setIsModalOpen(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={isSaving} className="h-10 rounded-lg">
                {isSaving ? 'Se salvează...' : editing ? 'Salvează modificările' : 'Creează investigație'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
