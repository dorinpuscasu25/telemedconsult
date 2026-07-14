import React, { useEffect, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';

interface Specialty {
  id: number;
  name: string;
  slug: string;
  doctor_profiles_count?: number;
  created_at?: string;
}

const DEFAULT_FORM = {
  name: '',
  slug: ''
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function SpecialtiesPage() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingSpecialty, setEditingSpecialty] = useState<Specialty | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loadSpecialties = () => {
    apiRequest<{data: Specialty[]}>('/admin/specialties').then((response) => setSpecialties(response.data));
  };

  useEffect(() => {
    loadSpecialties();
  }, []);

  const visibleSpecialties = specialties.filter((specialty) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return specialty.name.toLowerCase().includes(query) || specialty.slug.toLowerCase().includes(query);
  });

  const openCreateModal = () => {
    setError('');
    setEditingSpecialty(null);
    setForm(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (specialty: Specialty) => {
    setError('');
    setEditingSpecialty(specialty);
    setForm({ name: specialty.name, slug: specialty.slug });
    setIsModalOpen(true);
  };

  const closeModal = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingSpecialty(null);
      setForm(DEFAULT_FORM);
      setError('');
    }
  };

  const saveSpecialty = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name)
      };

      await apiRequest(editingSpecialty ? `/admin/specialties/${editingSpecialty.id}` : '/admin/specialties', {
        method: editingSpecialty ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      closeModal(false);
      loadSpecialties();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva specialitatea.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSpecialty = async (specialty: Specialty) => {
    const usedBy = specialty.doctor_profiles_count || 0;
    const message = usedBy
      ? `Ștergi specialitatea ${specialty.name}? ${usedBy} profil(e) de medic vor rămâne fără specialitate.`
      : `Ștergi specialitatea ${specialty.name}?`;

    if (!window.confirm(message)) return;

    setError('');
    setProcessingId(specialty.id);

    try {
      await apiRequest(`/admin/specialties/${specialty.id}`, {
        method: 'DELETE'
      });
      loadSpecialties();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut șterge specialitatea.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
            Specialități
          </h1>
          <p className="max-w-3xl text-slate-500">
            Administrează specialitățile medicale folosite în profilurile medicilor și în cererile pacienților.
          </p>
        </div>
        <Button type="button" size="lg" className="h-11 rounded-lg px-4 sm:self-center" onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Adaugă specialitate
        </Button>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Lista specialităților</CardTitle>
            <Button variant="outline" size="sm" className="h-9 self-start rounded-lg lg:self-center" onClick={loadSpecialties}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reîncarcă
            </Button>
          </div>
          <form onSubmit={(event) => event.preventDefault()} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[460px]">
            <Input
              className="h-10 rounded-lg bg-white"
              placeholder="Caută după nume sau slug"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Button type="submit" variant="outline" className="h-10 rounded-lg">
              <Search className="mr-2 h-4 w-4" />
              Caută
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Specialitate</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Utilizare</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSpecialties.map((specialty) => {
                  const isProcessing = processingId === specialty.id;

                  return (
                    <TableRow key={specialty.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{specialty.name}</div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">{specialty.slug}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50 text-slate-700">
                          {specialty.doctor_profiles_count || 0} medici
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Acțiuni specialitate</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openEditModal(specialty)}>
                              <Pencil className="h-4 w-4" />
                              Editează
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              className={`cursor-pointer ${isProcessing ? 'opacity-50' : ''}`}
                              onClick={() => {
                                if (!isProcessing) deleteSpecialty(specialty);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Șterge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {visibleSpecialties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-sm text-slate-500">
                      Nu există specialități pentru filtrul selectat.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={closeModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-lg bg-white p-0 sm:max-w-xl">
          <form onSubmit={saveSpecialty}>
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                {editingSpecialty ? 'Editează specialitate' : 'Adaugă specialitate'}
              </DialogTitle>
              <DialogDescription>
                Numele apare în aplicație, iar slug-ul este folosit ca identificator stabil.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-6 py-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label>Nume</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value, slug: form.slug || slugify(event.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  className="h-11 rounded-lg bg-white"
                  value={form.slug}
                  onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })}
                  placeholder="ex: cardiologie"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => closeModal(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={isSaving} className="h-10 rounded-lg">
                {isSaving ? 'Se salvează...' : editingSpecialty ? 'Salvează modificările' : 'Creează specialitate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
