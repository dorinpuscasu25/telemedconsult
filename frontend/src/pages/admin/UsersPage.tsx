import React, { useEffect, useMemo, useState } from 'react';
import { Ban, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Unlock } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';
import { Checkbox } from '../../components/ui/checkbox';
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
  SelectTrigger
} from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table';
import { apiRequest } from '../../lib/api';
import { useAuth, type RoleName } from '../../contexts/AuthContext';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  roles: RoleName[];
  active_role: RoleName | null;
  profiles?: {
    doctor?: { specialty_id?: number; consultation_price?: number; license_number?: string; is_approved?: boolean } | null;
    operator?: OperatorProfilePayload | null;
    coordinator?: { region?: string } | null;
  };
}

interface OperatorProfilePayload {
  region?: string;
  is_approved?: boolean;
  base_fee?: number;
  accepting_requests?: boolean;
  coverage?: { region_id: number; locality_id: number | null }[];
  capabilities?: { investigation_type_id: number; price_override: number | null }[];
  travel_fees?: { region_id: number; locality_id: number | null; fee: number }[];
}

interface Specialty {
  id: number;
  name: string;
}

interface CatalogLocality {
  id: number;
  name: string;
}

interface CatalogRegion {
  id: number;
  name: string;
  localities: CatalogLocality[];
}

interface CatalogInvestigation {
  id: number;
  code: string;
  name: string;
  default_price: number;
}

interface CapabilityRow {
  investigation_type_id: number;
  price_override: string;
}

interface TravelFeeRow {
  region_id: string;
  locality_id: string;
  fee: string;
}

const ROLE_LABELS: Record<RoleName, string> = {
  admin: 'Admin',
  patient: 'Pacient',
  doctor: 'Medic',
  operator: 'Operator',
  coordinator: 'Coordonator'
};

const MANAGED_ROLES: RoleName[] = ['admin', 'patient', 'doctor', 'operator'];

const STATUS_LABELS: Record<string, string> = {
  active: 'Activ',
  suspended: 'Blocat'
};

const ROLE_TABS: { value: 'doctor' | 'operator' | 'admin' | 'patient' | 'all'; label: string }[] = [
  { value: 'doctor', label: 'Medici' },
  { value: 'operator', label: 'Operatori' },
  { value: 'admin', label: 'Admin' },
  { value: 'patient', label: 'Pacienți' },
  { value: 'all', label: 'All' }
];

const DEFAULT_FORM = {
  name: '',
  email: '',
  phone: '',
  password: 'password',
  roles: ['patient'] as RoleName[],
  specialty_id: '',
  license_number: '',
  experience_years: '0',
  consultation_price: '400',
  region: 'Chișinău',
  status: 'active',
  base_fee: '0',
  accepting_requests: true,
  coverage: [] as number[],
  capabilities: [] as CapabilityRow[],
  travel_fees: [] as TravelFeeRow[]
};

const WHOLE_REGION = '__all__';

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const location = useLocation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [regionsCatalog, setRegionsCatalog] = useState<CatalogRegion[]>([]);
  const [investigationsCatalog, setInvestigationsCatalog] = useState<CatalogInvestigation[]>([]);
  const [activeTab, setActiveTab] = useState<'doctor' | 'operator' | 'admin' | 'patient' | 'all'>(
    location.pathname.includes('/operators') ? 'operator' : 'all'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [actionError, setActionError] = useState('');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  const loadUsers = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);

    apiRequest<{data: AdminUser[]}>(`/admin/users?${params.toString()}`).then((response) => setUsers(response.data));
  };

  useEffect(() => {
    apiRequest<{data: Specialty[]}>('/catalog/specialties', { auth: false }).then((response) => setSpecialties(response.data));
    apiRequest<{data: CatalogRegion[]}>('/catalog/regions', { auth: false })
      .then((response) => setRegionsCatalog(response.data ?? []))
      .catch(() => setRegionsCatalog([]));
    apiRequest<{data: CatalogInvestigation[]}>('/catalog/investigations', { auth: false })
      .then((response) => setInvestigationsCatalog(response.data ?? []))
      .catch(() => setInvestigationsCatalog([]));
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  const roles = useMemo(() => {
    return Array.from(new Set(form.roles)).filter((role) => MANAGED_ROLES.includes(role));
  }, [form.roles]);

  const isEditing = Boolean(editingUser);

  const visibleUsers = useMemo(() => {
    if (activeTab === 'all') return users;
    return users.filter((user) => user.roles.includes(activeTab));
  }, [activeTab, users]);

  const tabCounts = useMemo(() => {
    return ROLE_TABS.reduce<Record<string, number>>((acc, tab) => {
      acc[tab.value] = tab.value === 'all' ? users.length : users.filter((user) => user.roles.includes(tab.value)).length;
      return acc;
    }, {});
  }, [users]);

  const userToForm = (adminUser: AdminUser) => ({
    name: adminUser.name,
    email: adminUser.email,
    phone: adminUser.phone || '',
    password: '',
    roles: adminUser.roles.filter((role) => MANAGED_ROLES.includes(role)).length
      ? adminUser.roles.filter((role) => MANAGED_ROLES.includes(role))
      : ['patient'] as RoleName[],
    specialty_id: adminUser.profiles?.doctor?.specialty_id ? String(adminUser.profiles.doctor.specialty_id) : '',
    license_number: adminUser.profiles?.doctor?.license_number || '',
    experience_years: '0',
    consultation_price: adminUser.profiles?.doctor?.consultation_price ? String(adminUser.profiles.doctor.consultation_price) : '400',
    region: adminUser.profiles?.operator?.region || adminUser.profiles?.coordinator?.region || 'Chișinău',
    status: adminUser.status || 'active',
    base_fee: adminUser.profiles?.operator?.base_fee != null ? String(adminUser.profiles.operator.base_fee) : '0',
    accepting_requests: adminUser.profiles?.operator?.accepting_requests ?? true,
    coverage: (adminUser.profiles?.operator?.coverage ?? [])
      .filter((item) => item.locality_id == null)
      .map((item) => item.region_id),
    capabilities: (adminUser.profiles?.operator?.capabilities ?? []).map((item) => ({
      investigation_type_id: item.investigation_type_id,
      price_override: item.price_override != null ? String(item.price_override) : ''
    })),
    travel_fees: (adminUser.profiles?.operator?.travel_fees ?? []).map((item) => ({
      region_id: String(item.region_id),
      locality_id: item.locality_id != null ? String(item.locality_id) : '',
      fee: String(item.fee)
    }))
  });

  const updateTravelFee = (index: number, patch: Partial<TravelFeeRow>) => {
    setForm((current) => ({
      ...current,
      travel_fees: current.travel_fees.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    }));
  };

  const toggleRole = (role: RoleName, checked: boolean) => {
    setForm((current) => {
      const nextRoles = checked
        ? Array.from(new Set([...current.roles, role]))
        : current.roles.filter((item) => item !== role);

      return {
        ...current,
        roles: nextRoles.length ? nextRoles : current.roles
      };
    });
  };

  const openCreateModal = () => {
    setError('');
    setEditingUser(null);
    setForm(DEFAULT_FORM);
    setIsCreateOpen(true);
  };

  const openEditModal = (adminUser: AdminUser) => {
    setError('');
    setEditingUser(adminUser);
    setForm(userToForm(adminUser));
    setIsCreateOpen(true);
  };

  const closeUserModal = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setEditingUser(null);
      setForm(DEFAULT_FORM);
      setError('');
    }
  };

  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        roles,
        status: form.status,
        specialty_id: form.specialty_id ? Number(form.specialty_id) : null,
        license_number: form.license_number || null,
        experience_years: Number(form.experience_years || 0),
        consultation_price: Number(form.consultation_price || 0),
        region: form.region || null
      };

      if (roles.includes('operator')) {
        payload.base_fee = Number(form.base_fee || 0);
        payload.accepting_requests = form.accepting_requests;
        payload.coverage = form.coverage.map((region_id) => ({ region_id }));
        payload.capabilities = form.capabilities.map((item) => ({
          investigation_type_id: item.investigation_type_id,
          price_override: item.price_override === '' ? null : Number(item.price_override)
        }));
        payload.travel_fees = form.travel_fees
          .filter((item) => item.region_id && item.fee !== '')
          .map((item) => ({
            region_id: Number(item.region_id),
            locality_id: item.locality_id ? Number(item.locality_id) : null,
            fee: Number(item.fee || 0)
          }));
      }

      if (!isEditing || form.password) {
        payload.password = form.password;
      }

      await apiRequest(isEditing ? `/admin/users/${editingUser?.id}` : '/admin/users', {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      setForm(DEFAULT_FORM);
      setEditingUser(null);
      setIsCreateOpen(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva utilizatorul.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateUserStatus = async (adminUser: AdminUser) => {
    const nextStatus = adminUser.status === 'active' ? 'suspended' : 'active';
    setActionError('');
    setProcessingUserId(adminUser.id);

    try {
      await apiRequest(`/admin/users/${adminUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Nu am putut actualiza statusul.');
    } finally {
      setProcessingUserId(null);
    }
  };

  const deleteUser = async (adminUser: AdminUser) => {
    const confirmed = window.confirm(`Ștergi definitiv utilizatorul ${adminUser.name}? Această acțiune nu poate fi anulată.`);
    if (!confirmed) return;

    setActionError('');
    setProcessingUserId(adminUser.id);

    try {
      await apiRequest(`/admin/users/${adminUser.id}`, {
        method: 'DELETE'
      });
      loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Nu am putut șterge utilizatorul.');
    } finally {
      setProcessingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
            Utilizatori
          </h1>
          <p className="max-w-3xl text-slate-500">
            Gestionează medicii, operatorii, administratorii și pacienții dintr-un singur loc.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="h-11 rounded-lg px-4 sm:self-center"
          onClick={() => {
            openCreateModal();
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Adaugă utilizator
        </Button>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Lista utilizatorilor</CardTitle>
            <Button variant="outline" size="sm" className="h-9 self-start rounded-lg lg:self-center" onClick={loadUsers}>
              <RefreshCw className="mr-2 h-4 w-4" /> Reîncarcă
            </Button>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-slate-100/80 p-1 sm:w-fit">
                {ROLE_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="h-9 flex-none px-3">
                    {tab.label}
                    <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                      {tabCounts[tab.value] ?? 0}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <form onSubmit={(event) => { event.preventDefault(); loadUsers(); }} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] xl:w-[460px]">
              <Input
                className="h-10 rounded-lg bg-white"
                placeholder="Caută după nume sau email"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button type="submit" variant="outline" className="h-10 rounded-lg">
                <Search className="mr-2 h-4 w-4" />
                Caută
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {actionError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilizator</TableHead>
                  <TableHead>Roluri</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Profil</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map((adminUser) => {
                  const isSelf = currentUser?.id === adminUser.id;
                  const isProcessing = processingUserId === adminUser.id;

                  return (
                  <TableRow key={adminUser.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{adminUser.name}</div>
                      <div className="text-sm text-slate-500">{adminUser.email}</div>
                      {adminUser.phone && <div className="text-xs text-slate-400">{adminUser.phone}</div>}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {adminUser.roles.map((role) => <Badge key={role} variant="outline">{ROLE_LABELS[role]}</Badge>)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={adminUser.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
                        {STATUS_LABELS[adminUser.status] || adminUser.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {adminUser.roles.includes('doctor') && <span><ShieldCheck className="inline h-4 w-4 mr-1" /> Medic {adminUser.profiles?.doctor?.is_approved === false ? 'neaprobat' : 'aprobat'}</span>}
                      {adminUser.roles.includes('operator') && <span>Operator {adminUser.profiles?.operator?.region}</span>}
                      {adminUser.roles.includes('coordinator') && <span>Coordonator {adminUser.profiles?.coordinator?.region}</span>}
                      {adminUser.roles.includes('patient') && !adminUser.roles.includes('doctor') && <span>Pacient</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Acțiuni utilizator</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem className="cursor-pointer" onClick={() => openEditModal(adminUser)}>
                            <Pencil className="h-4 w-4" />
                            Editează
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={`cursor-pointer ${isSelf ? 'opacity-50' : ''}`}
                            onClick={() => {
                              if (!isSelf && !isProcessing) updateUserStatus(adminUser);
                            }}
                          >
                            {adminUser.status === 'active' ? <Ban className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                            {adminUser.status === 'active' ? 'Blochează' : 'Deblochează'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            className={`cursor-pointer ${isSelf ? 'opacity-50' : ''}`}
                            onClick={() => {
                              if (!isSelf && !isProcessing) deleteUser(adminUser);
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
                {visibleUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-slate-500">
                      Nu există utilizatori pentru filtrul selectat.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={closeUserModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-lg bg-white p-0 sm:max-w-2xl">
          <form onSubmit={saveUser}>
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="text-xl font-semibold text-slate-900">
                {isEditing ? 'Editează utilizator' : 'Adaugă utilizator'}
              </DialogTitle>
              <DialogDescription>
                {isEditing ? 'Actualizează datele, rolurile și statusul contului.' : 'Completează datele de bază și alege rolurile potrivite.'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</div>}
              <div className="space-y-2">
                <Label>Nume</Label>
                <Input className="h-11 rounded-lg bg-white" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input className="h-11 rounded-lg bg-white" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input className="h-11 rounded-lg bg-white" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{isEditing ? 'Parolă nouă' : 'Parolă inițială'}</Label>
                <Input
                  type="password"
                  className="h-11 rounded-lg bg-white"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={8}
                  placeholder={isEditing ? 'Lasă gol pentru neschimbat' : undefined}
                  required={!isEditing}
                />
              </div>
              <div className="space-y-3 sm:col-span-2">
                <Label>Roluri</Label>
                <div className="grid gap-2 sm:grid-cols-4">
                  {MANAGED_ROLES.map((role) => {
                    const checked = roles.includes(role);

                    return (
                      <div
                        key={role}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          checked
                            ? 'border-primary bg-primary/5 text-slate-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => toggleRole(role, nextChecked)}
                        />
                        <span className="font-medium">{ROLE_LABELS[role]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                  <SelectTrigger className="h-11 w-full bg-white px-3">
                    <span>{STATUS_LABELS[form.status] || form.status}</span>
                  </SelectTrigger>
                  <SelectContent className="w-full min-w-[220px]">
                    <SelectItem value="active">Activ</SelectItem>
                    <SelectItem value="suspended">Blocat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {roles.includes('doctor') && (
                <>
                  <div className="space-y-2">
                    <Label>Specializare</Label>
                    <Select value={form.specialty_id} onValueChange={(value) => setForm({ ...form, specialty_id: value })}>
                      <SelectTrigger className="h-11 w-full bg-white px-3">
                        <span>{specialties.find((specialty) => String(specialty.id) === form.specialty_id)?.name || 'Alege specializarea'}</span>
                      </SelectTrigger>
                      <SelectContent className="w-full min-w-[240px]">
                        {specialties.map((specialty) => <SelectItem key={specialty.id} value={String(specialty.id)}>{specialty.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Licență</Label>
                    <Input className="h-11 rounded-lg bg-white" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Preț consultație</Label>
                    <Input className="h-11 rounded-lg bg-white" type="number" value={form.consultation_price} onChange={(e) => setForm({ ...form, consultation_price: e.target.value })} />
                  </div>
                </>
              )}
              {(roles.includes('operator') || roles.includes('coordinator')) && (
                <div className="space-y-2">
                  <Label>Regiune (bază)</Label>
                  <Select value={form.region} onValueChange={(value) => setForm({ ...form, region: value })}>
                    <SelectTrigger className="h-11 w-full bg-white px-3">
                      <span className={form.region ? '' : 'text-muted-foreground'}>{form.region || 'Alege regiunea'}</span>
                    </SelectTrigger>
                    <SelectContent className="max-h-64 w-full min-w-[240px] overflow-y-auto">
                      {regionsCatalog.map((region) => (
                        <SelectItem key={region.id} value={region.name}>{region.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {roles.includes('operator') && (
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tarif de bază (MDL)</Label>
                      <Input type="number" min={0} className="h-11 rounded-lg bg-white" value={form.base_fee} onChange={(e) => setForm({ ...form, base_fee: e.target.value })} />
                    </div>
                    <label className="flex h-11 items-center justify-between self-end rounded-lg border border-slate-200 bg-white px-3">
                      <span className="text-sm text-slate-600">Acceptă solicitări</span>
                      <Switch checked={form.accepting_requests} onCheckedChange={(value) => setForm({ ...form, accepting_requests: value })} />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label>Raioane deservite</Label>
                    <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-3">
                      {regionsCatalog.map((region) => {
                        const checked = form.coverage.includes(region.id);
                        return (
                          <label key={region.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => setForm({ ...form, coverage: next ? [...form.coverage, region.id] : form.coverage.filter((id) => id !== region.id) })}
                            />
                            <span>{region.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Investigații pe care le poate efectua</Label>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                      {investigationsCatalog.map((investigation) => {
                        const row = form.capabilities.find((item) => item.investigation_type_id === investigation.id);
                        const checked = Boolean(row);
                        return (
                          <div key={investigation.id} className="flex items-center gap-3 rounded px-2 py-1 text-sm">
                            <label className="flex flex-1 items-center gap-2">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => setForm({
                                  ...form,
                                  capabilities: next
                                    ? [...form.capabilities, { investigation_type_id: investigation.id, price_override: '' }]
                                    : form.capabilities.filter((item) => item.investigation_type_id !== investigation.id)
                                })}
                              />
                              <span>{investigation.name}</span>
                            </label>
                            {checked && (
                              <Input
                                type="number"
                                min={0}
                                className="h-9 w-32 rounded-lg bg-white"
                                placeholder={`Catalog: ${investigation.default_price}`}
                                value={row?.price_override ?? ''}
                                onChange={(e) => setForm({
                                  ...form,
                                  capabilities: form.capabilities.map((item) => item.investigation_type_id === investigation.id ? { ...item, price_override: e.target.value } : item)
                                })}
                              />
                            )}
                          </div>
                        );
                      })}
                      {investigationsCatalog.length === 0 && (
                        <p className="px-2 py-1 text-sm text-slate-400">Niciun tip de investigație în catalog.</p>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">Prețul e opțional — gol = folosește prețul din catalog.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Taxe de drum</Label>
                      <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setForm({ ...form, travel_fees: [...form.travel_fees, { region_id: '', locality_id: '', fee: '' }] })}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Adaugă
                      </Button>
                    </div>
                    {form.travel_fees.map((row, index) => {
                      const localities = regionsCatalog.find((region) => String(region.id) === row.region_id)?.localities ?? [];
                      return (
                        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_96px_auto]">
                          <Select value={row.region_id} onValueChange={(value) => updateTravelFee(index, { region_id: value, locality_id: '' })}>
                            <SelectTrigger className="h-10 bg-white px-3">
                              <span className={row.region_id ? '' : 'text-muted-foreground'}>{regionsCatalog.find((region) => String(region.id) === row.region_id)?.name || 'Raion'}</span>
                            </SelectTrigger>
                            <SelectContent className="max-h-56 overflow-y-auto">
                              {regionsCatalog.map((region) => <SelectItem key={region.id} value={String(region.id)}>{region.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={row.locality_id} onValueChange={(value) => updateTravelFee(index, { locality_id: value === WHOLE_REGION ? '' : value })}>
                            <SelectTrigger className="h-10 bg-white px-3">
                              <span className={row.locality_id ? '' : 'text-muted-foreground'}>{localities.find((locality) => String(locality.id) === row.locality_id)?.name || 'Tot raionul'}</span>
                            </SelectTrigger>
                            <SelectContent className="max-h-56 overflow-y-auto">
                              <SelectItem value={WHOLE_REGION}>Tot raionul</SelectItem>
                              {localities.map((locality) => <SelectItem key={locality.id} value={String(locality.id)}>{locality.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input type="number" min={0} className="h-10 rounded-lg bg-white" placeholder="MDL" value={row.fee} onChange={(e) => updateTravelFee(index, { fee: e.target.value })} />
                          <Button type="button" variant="ghost" size="icon" className="h-10 text-red-600" onClick={() => setForm({ ...form, travel_fees: form.travel_fees.filter((_, itemIndex) => itemIndex !== index) })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-400">Localitate fără taxă proprie folosește tariful raionului.</p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">
              <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => closeUserModal(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={isSaving} className="h-10 rounded-lg">
                {isSaving ? 'Se salvează...' : isEditing ? 'Salvează modificările' : 'Creează utilizator'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
