import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  MapPin,
  MessageSquare,
  Navigation,
  PlusCircle,
  Send,
  Stethoscope,
  Wallet,
  XCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { ToneBadge } from '../../components/app/StatusBadge';
import { MoreMenu, type MoreMenuItem } from '../../components/app/MoreMenu';
import { useDialogs } from '../../components/app/DialogProvider';
import { apiRequest } from '../../lib/api';
import { ObjectiveDataForm, toObjectivePayload } from '../../components/ObjectiveDataForm';
import { dateTime, money, relativeDay, timeOnly, timeUntil } from '../../lib/format';
import { paymentStatusLabel } from '../../lib/status';
import { useNow } from '../../lib/use-now';
import { addressOf, mapsUrl, operatorStageOf, patientNameOf, type RequestItem, type Stage } from '../../lib/operator-visits';

interface Doctor {
  id: string;
  name: string;
  specialty?: string | null;
}

const STAGES: Array<{ value: Stage; label: string; empty: string; description: string }> = [
  { value: 'new', label: 'Cereri noi', empty: 'Nicio cerere nouă', description: 'Cererile din zona ta apar aici imediat ce sunt trimise.' },
  { value: 'active', label: 'În lucru', empty: 'Nicio vizită în lucru', description: 'Vizitele preluate apar aici până termini examinarea.' },
  { value: 'done', label: 'Finalizate', empty: 'Nicio examinare finalizată', description: 'Examinările trimise medicului apar aici.' }
];

const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);

export function RequestsPage() {
  const dialogs = useDialogs();
  const now = useNow();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('new');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isObjectiveModalOpen, setIsObjectiveModalOpen] = useState(false);
  const [isAddonModalOpen, setIsAddonModalOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [completeData, setCompleteData] = useState({ diagnosis: '', recommendations: '' });
  const [objectiveValues, setObjectiveValues] = useState<Record<string, string>>({});
  const [objectiveError, setObjectiveError] = useState('');
  const hasObjectiveValues = Object.values(objectiveValues).some((entry) => (entry ?? '').trim() !== '');
  const [addonForm, setAddonForm] = useState({ name: '', amount: 50 });
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedId = searchParams.get('request');

  const loadRequests = useCallback(() => {
    apiRequest<{ data: RequestItem[] }>('/requests')
      .then((response) => setRequests(response.data ?? []))
      .catch(() => setRequests([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadRequests();
    apiRequest<{ data: Doctor[] }>('/catalog/doctors', { auth: false })
      .then((response) => setDoctors(response.data ?? []))
      .catch(() => setDoctors([]));
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadRequests(); }, 20000);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  const byStage = useMemo(() => {
    const groups: Record<Stage, RequestItem[]> = { new: [], active: [], done: [] };
    requests.forEach((request) => {
      const key = operatorStageOf(request);
      if (key) groups[key].push(request);
    });
    groups.new.sort((a, b) => (time(a.acceptance_expires_at) || Number.MAX_SAFE_INTEGER) - (time(b.acceptance_expires_at) || Number.MAX_SAFE_INTEGER));
    groups.active.sort((a, b) => (time(a.scheduled_at) || time(a.accepted_at) || time(a.created_at)) - (time(b.scheduled_at) || time(b.accepted_at) || time(b.created_at)));
    groups.done.sort((a, b) => time(b.objective_data_completed_at) - time(a.objective_data_completed_at));
    return groups;
  }, [requests]);

  const selected = requests.find((item) => String(item.id) === selectedId) ?? null;
  useEffect(() => {
    const key = selected && operatorStageOf(selected);
    if (key) setStage(key);
  }, [selected?.id, selected?.status, selected?.objective_data_completed_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = byStage[stage];
  const shown = selected ?? list[0] ?? null;

  const selectRequest = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('request', id); else next.delete('request');
    setSearchParams(next);
  };

  /**
   * Toate acțiunile trec pe aici: erorile de la server devin vizibile, iar lista
   * se reîmprospătează întotdeauna. Un refuz al backendului (de exemplu
   * „examinarea nu e gata”) nu mai dispare fără urmă.
   */
  const runAction = async (request: RequestItem, action: () => Promise<unknown>, successMessage: string, onDone?: () => void) => {
    setBusyId(request.id);
    setIsSaving(true);
    try {
      await action();
      toast.success(successMessage);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setIsSaving(false);
      setBusyId(null);
      loadRequests();
    }
  };

  const acceptRequest = async (request: RequestItem) => {
    const address = addressOf(request);
    const confirmed = await dialogs.confirm({
      title: 'Preiei această vizită?',
      description: <p>Pacientul <strong>{patientNameOf(request)}</strong> va fi anunțat că vii.{address && <> Adresa: {address}.</>}</p>,
      confirmLabel: 'Preia cazul'
    });
    if (!confirmed) return;
    await runAction(request, () => apiRequest(`/requests/${request.id}/accept`, { method: 'POST' }), 'Vizită preluată. Pacientul a fost anunțat.');
  };

  const rejectRequest = async (request: RequestItem) => {
    const confirmed = await dialogs.confirm({
      title: 'Respingi solicitarea?',
      description: 'Cererea va fi reatribuită altui operator sau anulată, iar pacientul își primește banii înapoi.',
      confirmLabel: 'Respinge',
      tone: 'danger'
    });
    if (!confirmed) return;
    await runAction(request, () => apiRequest(`/requests/${request.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Solicitare respinsă de operator.' })
    }), 'Solicitare respinsă.');
  };

  const proposeTime = async (request: RequestItem) => {
    const values = await dialogs.form({
      title: 'Propune altă oră',
      description: 'Pacientul primește propunerea și o confirmă.',
      confirmLabel: 'Trimite propunerea',
      fields: [{ name: 'scheduled_at', label: 'Data și ora nouă', type: 'datetime-local', required: true, hint: `Fus orar: ${Intl.DateTimeFormat().resolvedOptions().timeZone}` }]
    });
    if (!values?.scheduled_at) return;
    await runAction(request, () => apiRequest(`/requests/${request.id}/propose-time`, {
      method: 'POST',
      body: JSON.stringify({ scheduled_at: values.scheduled_at })
    }), 'Oră nouă propusă pacientului.');
  };

  const completeExamination = async (request: RequestItem) => {
    const confirmed = await dialogs.confirm({
      title: 'Ai terminat examinarea?',
      description: 'Cazul trece la medic. Datele din aparatul HIGO se atașează automat când sosesc.',
      confirmLabel: 'Da, am terminat'
    });
    if (!confirmed) return;
    await runAction(request, () => apiRequest(`/requests/${request.id}/examination-done`, { method: 'POST' }), 'Examinare finalizată. Medicul a fost anunțat.');
  };

  const openForward = (request: RequestItem) => {
    setSelectedRequest(request);
    setNotes(request.triage_notes || '');
    setSelectedDoctor('');
    setIsForwardModalOpen(true);
  };

  const openComplete = (request: RequestItem) => {
    setSelectedRequest(request);
    setNotes('');
    setCompleteData({ diagnosis: '', recommendations: '' });
    setIsCompleteModalOpen(true);
  };

  const openObjective = (request: RequestItem) => {
    setSelectedRequest(request);
    setObjectiveValues({});
    setObjectiveError('');
    setIsObjectiveModalOpen(true);
  };

  const openAddon = (request: RequestItem) => {
    setSelectedRequest(request);
    setAddonForm({ name: '', amount: 50 });
    setIsAddonModalOpen(true);
  };

  const completeRequest = async () => {
    if (!selectedRequest) return;
    await runAction(selectedRequest, () => apiRequest(`/requests/${selectedRequest.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        diagnosis: completeData.diagnosis,
        recommendations: completeData.recommendations,
        treatment_plan: notes || null
      })
    }), 'Consultație finalizată.', () => setIsCompleteModalOpen(false));
  };

  const forwardRequest = async () => {
    if (!selectedRequest || !selectedDoctor) return;
    await runAction(selectedRequest, () => apiRequest(`/requests/${selectedRequest.id}/forward-to-doctor`, {
      method: 'POST',
      body: JSON.stringify({ doctor_id: selectedDoctor, triage_notes: notes })
    }), 'Datele au fost transmise medicului.', () => setIsForwardModalOpen(false));
  };

  const saveObjectiveData = async () => {
    if (!selectedRequest) return;
    setObjectiveError('');
    setIsSaving(true);
    try {
      await apiRequest(`/requests/${selectedRequest.id}/objective-data`, {
        method: 'POST',
        body: JSON.stringify({ source: 'manual_operator', payload: toObjectivePayload(objectiveValues) })
      });
      setIsObjectiveModalOpen(false);
      setObjectiveValues({});
      toast.success('Măsurătorile au fost salvate.');
      loadRequests();
    } catch (err) {
      setObjectiveError(err instanceof Error ? err.message : 'Nu am putut salva datele.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveAddon = async () => {
    if (!selectedRequest) return;
    setIsSaving(true);
    try {
      await apiRequest(`/requests/${selectedRequest.id}/add-on-service`, { method: 'POST', body: JSON.stringify(addonForm) });
      setIsAddonModalOpen(false);
      toast.success(`${addonForm.name}: ${money(addonForm.amount)} MDL încasați.`);
      loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Serviciul nu a putut fi încasat.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Vizite" description="Examinările la domiciliu din zona ta: cereri noi, vizite în lucru și cele trimise medicului." />

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start">
        <section className={cn('space-y-3 lg:sticky lg:top-24', selected && 'hidden lg:block')} aria-label="Lista vizitelor">
          <Tabs value={stage} onValueChange={(value) => { setStage(value as Stage); selectRequest(null); }}>
            <TabsList className="grid w-full grid-cols-3">
              {STAGES.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="gap-1.5 px-2 text-[13px]">
                  {item.label}
                  <span className={cn('tabular text-[11px] font-bold', item.value === 'new' && byStage.new.length > 0 ? 'text-amber-600' : 'text-slate-400')}>{byStage[item.value].length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading ? <ListSkeleton rows={3} /> : list.length === 0 ? (
            <EmptyState compact icon={ClipboardList} title={STAGES.find((item) => item.value === stage)?.empty} description={STAGES.find((item) => item.value === stage)?.description} />
          ) : (
            <ul className="space-y-2">
              {list.map((request) => (
                <li key={request.id}>
                  <VisitListItem request={request} now={now} active={selected?.id === request.id} implicitActive={!selected && shown?.id === request.id} onSelect={() => selectRequest(request.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cn('min-w-0', !selected && 'hidden lg:block')} aria-label="Detaliile vizitei">
          {selected && (
            <Button variant="ghost" size="sm" className="-ml-2 mb-2 lg:hidden" onClick={() => selectRequest(null)}>
              <ArrowLeft className="h-4 w-4" />Înapoi la listă
            </Button>
          )}
          {shown ? (
            <VisitDetail
              key={shown.id}
              request={shown}
              now={now}
              busy={busyId === shown.id}
              onAccept={() => void acceptRequest(shown)}
              onReject={() => void rejectRequest(shown)}
              onExamDone={() => void completeExamination(shown)}
              onObjective={() => openObjective(shown)}
              onForward={() => openForward(shown)}
              onAddon={() => openAddon(shown)}
              onPropose={() => void proposeTime(shown)}
              onComplete={() => openComplete(shown)}
            />
          ) : !isLoading && (
            <EmptyState icon={MapPin} title="Selectează o vizită" description="Adresa, investigațiile și acțiunile apar aici." className="py-20" />
          )}
        </section>
      </div>

      <Dialog open={isObjectiveModalOpen} onOpenChange={setIsObjectiveModalOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>Adaugă măsurători manual</DialogTitle>
            <DialogDescription>Pentru valorile pe care aparatul nu le-a trimis. Apar în fișa pacientului și la medic.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRequest && <RequestSummary request={selectedRequest} />}
            {objectiveError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{objectiveError}</p>}
            <ObjectiveDataForm value={objectiveValues} onChange={setObjectiveValues} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsObjectiveModalOpen(false)}>Renunță</Button>
            <Button onClick={saveObjectiveData} disabled={!hasObjectiveValues || isSaving}>{isSaving ? 'Se salvează…' : 'Salvează măsurătorile'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddonModalOpen} onOpenChange={setIsAddonModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Serviciu suplimentar pe loc</DialogTitle>
            <DialogDescription>Suma se reține imediat din portofelul pacientului.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addon-name">Denumirea serviciului</Label>
              <Input id="addon-name" value={addonForm.name} onChange={(event) => setAddonForm({ ...addonForm, name: event.target.value })} placeholder="Ex: Dermatoscopie" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addon-amount">Suma (MDL)</Label>
              <Input id="addon-amount" type="number" inputMode="decimal" min={0} value={addonForm.amount} onChange={(event) => setAddonForm({ ...addonForm, amount: Number(event.target.value) })} />
            </div>
            {selectedRequest && addonForm.name && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Se vor reține <strong>{money(addonForm.amount)} MDL</strong> din portofelul titularului <strong>{selectedRequest.patient?.name || patientNameOf(selectedRequest)}</strong> pentru „{addonForm.name}”.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddonModalOpen(false)}>Renunță</Button>
            <Button onClick={saveAddon} disabled={!addonForm.name || isSaving}>{isSaving ? 'Se încasează…' : `Încasează ${money(addonForm.amount)} MDL`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isForwardModalOpen} onOpenChange={setIsForwardModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Transmite la medic</DialogTitle>
            <DialogDescription>Alege medicul care primește datele examinării.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <RequestSummary request={selectedRequest} />
              <div className="space-y-2">
                <Label>Medicul</Label>
                <Select value={selectedDoctor} onValueChange={setSelectedDoctor}>
                  <SelectTrigger><SelectValue placeholder="Alege medicul…" /></SelectTrigger>
                  <SelectContent className="z-50">
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>{doctor.name}{doctor.specialty ? ` · ${doctor.specialty}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="forward-notes">Note pentru medic</Label>
                <Textarea id="forward-notes" placeholder="Simptome observate, valori măsurate, context…" className="min-h-[120px]" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsForwardModalOpen(false)}>Renunță</Button>
            <Button onClick={forwardRequest} disabled={!selectedDoctor || isSaving}><Send className="h-4 w-4" />{isSaving ? 'Se transmite…' : 'Transmite datele'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCompleteModalOpen} onOpenChange={setIsCompleteModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Finalizează ca operator</DialogTitle>
            <DialogDescription>Pentru vizitele fără medic. Suma rezervată se procesează după finalizare.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <RequestSummary request={selectedRequest} />
              <div className="space-y-2">
                <Label htmlFor="operator-diagnosis">Concluzie<span className="ml-0.5 text-red-500">*</span></Label>
                <Input id="operator-diagnosis" value={completeData.diagnosis} onChange={(event) => setCompleteData({ ...completeData, diagnosis: event.target.value })} placeholder="Ex: Examinare la domiciliu efectuată" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operator-recommendations">Recomandări</Label>
                <Textarea id="operator-recommendations" value={completeData.recommendations} onChange={(event) => setCompleteData({ ...completeData, recommendations: event.target.value })} className="min-h-[100px]" placeholder="Observații, recomandări, necesitatea unui medic specialist…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompleteModalOpen(false)}>Renunță</Button>
            <Button onClick={completeRequest} disabled={!completeData.diagnosis.trim() || isSaving}>{isSaving ? 'Se salvează…' : 'Finalizează'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VisitListItem({ request, now, active, implicitActive = false, onSelect }: { request: RequestItem; now: number; active: boolean; implicitActive?: boolean; onSelect: () => void }) {
  const address = addressOf(request);
  const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;
  const when = request.scheduled_at || request.created_at;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn('w-full rounded-2xl border bg-white p-4 text-left transition', active ? 'border-primary/40 shadow-sm ring-2 ring-primary/15' : implicitActive ? 'border-slate-200 hover:border-slate-300 lg:border-primary/40 lg:shadow-sm lg:ring-2 lg:ring-primary/15' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm')}>
      <span className="flex items-start justify-between gap-3">
        <span className="truncate font-semibold text-slate-900">{patientNameOf(request)}</span>
        <span className="tabular shrink-0 text-xs text-slate-500">{relativeDay(when)}, {timeOnly(when)}</span>
      </span>
      {address && <span className="mt-1 flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="line-clamp-2">{address}</span></span>}
      <span className="mt-2.5 flex flex-wrap items-center gap-2">
        {request.status === 'rescheduled' ? <ToneBadge tone="attention">Așteaptă răspunsul pacientului</ToneBadge>
          : operatorStageOf(request) === 'new' ? <ToneBadge tone="warning">Cerere nouă</ToneBadge>
            : operatorStageOf(request) === 'active' ? <ToneBadge tone="info">În lucru</ToneBadge>
              : <ToneBadge tone={request.status === 'completed' ? 'neutral' : 'success'}>{request.status === 'completed' ? 'Consultație încheiată' : 'La medic'}</ToneBadge>}
        {expiresIn && <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', expiresIn === 'expirat' ? 'text-red-600' : 'text-amber-700')}><Hourglass className="h-3 w-3" />{expiresIn === 'expirat' ? 'Termen depășit' : `Preia în ${expiresIn}`}</span>}
      </span>
    </button>
  );
}

function VisitDetail({
  request,
  now,
  busy,
  onAccept,
  onReject,
  onExamDone,
  onObjective,
  onForward,
  onAddon,
  onPropose,
  onComplete
}: {
  request: RequestItem;
  now: number;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onExamDone: () => void;
  onObjective: () => void;
  onForward: () => void;
  onAddon: () => void;
  onPropose: () => void;
  onComplete: () => void;
}) {
  const stage = operatorStageOf(request);
  const address = addressOf(request);
  const investigations = request.pricing_snapshot?.cost_breakdown?.investigations ?? [];
  const travelFee = request.pricing_snapshot?.cost_breakdown?.travel_fee;
  const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;

  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];
  const more: MoreMenuItem[] = [];
  const chat = <Button key="chat" asChild variant="outline"><Link to={`/operator/chat?request=${request.id}`}><MessageSquare className="h-4 w-4" />Mesaje</Link></Button>;

  if (request.status === 'new') {
    primary = <Button onClick={onAccept} disabled={busy}><CheckCircle2 className="h-4 w-4" />{busy ? 'Se preia…' : 'Preia cazul'}</Button>;
    more.push({ label: 'Respinge solicitarea', icon: XCircle, onSelect: onReject, danger: true });
  } else if (stage === 'active') {
    primary = <Button onClick={onExamDone} disabled={busy}><ClipboardCheck className="h-4 w-4" />{busy ? 'Se trimite…' : 'Am terminat examinarea'}</Button>;
    secondary.push(<Button key="manual" variant="outline" onClick={onObjective}><Stethoscope className="h-4 w-4" />Adaugă măsurători</Button>);
    secondary.push(chat);
    more.push({ label: 'Serviciu suplimentar pe loc', icon: PlusCircle, onSelect: onAddon });
    more.push({ label: 'Transmite la alt medic', icon: Send, onSelect: onForward });
    more.push({ label: 'Reprogramează', icon: CalendarClock, onSelect: onPropose });
    if (!request.doctor) more.push({ label: 'Finalizează ca operator', icon: CheckCircle2, onSelect: onComplete, separatorBefore: true });
  } else if (stage === 'done') {
    secondary.push(chat);
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-slate-950">{patientNameOf(request)}</h2>
          {stage === 'done' && <ToneBadge tone={request.status === 'completed' ? 'neutral' : 'success'}>{request.status === 'completed' ? 'Consultație încheiată' : 'Examinare trimisă medicului'}</ToneBadge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {[request.patient_profile?.patient_code && `Cod pacient ${request.patient_profile.patient_code}`, request.patient?.name && `Titular: ${request.patient.name}`, request.doctor?.name && `Medic: ${request.doctor.name}`].filter(Boolean).join(' · ')}
        </p>

        {address && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span>
            <p className="min-w-0 flex-1 text-sm font-medium text-slate-900">{address}</p>
            <Button asChild variant="outline" size="sm"><a href={mapsUrl(address)} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />Deschide în hărți</a></Button>
          </div>
        )}

        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><CalendarClock className="h-3.5 w-3.5" />{request.scheduled_at ? 'Programare' : 'Cerere trimisă'}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{dateTime(request.scheduled_at || request.created_at)}</dd>
            {request.proposed_scheduled_at && <dd className="text-xs text-orange-700">Propus: {dateTime(request.proposed_scheduled_at)}</dd>}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Wallet className="h-3.5 w-3.5" />Plată</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{money(request.amount)} MDL</dd>
            <dd className="text-xs text-slate-500">{[paymentStatusLabel(request.payment_status), travelFee != null && `deplasare ${money(travelFee)} MDL`].filter(Boolean).join(' · ')}</dd>
          </div>
        </dl>

        {expiresIn && (
          <p className={cn('mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm', expiresIn === 'expirat' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>
            <Hourglass className="h-4 w-4 shrink-0" />{expiresIn === 'expirat' ? 'Termenul de preluare a expirat.' : <>Preia cazul în <strong>{expiresIn}</strong>, altfel cererea trece la alt operator.</>}
          </p>
        )}
        {request.status === 'rescheduled' && <p className="mt-3 rounded-xl bg-orange-50 px-3.5 py-2.5 text-sm text-orange-900">Ai propus o oră nouă. Așteptăm confirmarea pacientului.</p>}

        {(primary || secondary.length > 0) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {primary}
            {secondary}
            <MoreMenu items={more} />
          </div>
        )}
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {investigations.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900">Investigații de efectuat</h3>
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {investigations.map((line) => (
                <li key={line.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', stage === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300')}>{stage === 'done' && <CheckCircle2 className="h-3.5 w-3.5" />}</span>
                  <span className="flex-1 text-slate-800">{line.name}</span>
                  <span className="text-xs text-slate-500">{line.requirement === 'required' ? 'obligatorie' : 'opțională'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="text-sm font-semibold text-slate-900">Acuzele pacientului</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{request.symptoms || 'Fără detalii.'}</p>
        </section>
        {request.triage_notes && (
          <section>
            <h3 className="text-sm font-semibold text-slate-900">Note de triaj</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.triage_notes}</p>
          </section>
        )}
      </div>
    </article>
  );
}

function RequestSummary({ request }: { request: RequestItem }) {
  const address = addressOf(request);
  return (
    <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-900">
        {patientNameOf(request)}
        {request.patient_profile?.patient_code && <span className="ml-2 text-xs font-normal text-slate-500">Cod {request.patient_profile.patient_code}</span>}
      </p>
      {address && <p className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{address}</p>}
      {request.symptoms && <p className="line-clamp-2 text-slate-600">{request.symptoms}</p>}
    </div>
  );
}
