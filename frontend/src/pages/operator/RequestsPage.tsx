import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, MapPin, MessageSquare, MoreHorizontal, Navigation, Send } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { Textarea } from '../../components/ui/textarea';
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { useDialogs } from '../../components/app/DialogProvider';
import { apiRequest } from '../../lib/api';
import { ObjectiveDataForm, toObjectivePayload } from '../../components/ObjectiveDataForm';
import { dateTime, money, relativeDay, timeOnly, timeUntil } from '../../lib/format';
import { paymentStatusLabel } from '../../lib/status';
import { useNow } from '../../lib/use-now';
import { addressOf, mapsUrl, operatorStageOf, patientNameOf, type RequestItem, type Stage } from '../../lib/operator-visits';
import { usePageTitle } from '../../lib/use-page-title';
import { Avatar } from '../doctor/DoctorHome';

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
  usePageTitle('Vizite');
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
  // La prima încărcare, fără cereri noi, se deschide direct ce e în lucru.
  const [stageChosen, setStageChosen] = useState(false);
  useEffect(() => {
    if (isLoading || stageChosen) return;
    setStageChosen(true);
    if (!selectedId && byStage.new.length === 0 && byStage.active.length > 0) setStage('active');
  }, [isLoading, stageChosen, selectedId, byStage]);

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
      body: JSON.stringify({ scheduled_at: new Date(values.scheduled_at).toISOString() })
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

  const actionsFor = (request: RequestItem): VisitActions => {
    const stage = operatorStageOf(request);
    const busy = busyId === request.id;
    const chat: VisitAction = { label: 'Mesaje', href: `/operator/chat?request=${request.id}` };
    if (request.status === 'new') {
      return {
        primary: { label: busy ? 'Se preia…' : 'Preia cazul', run: () => void acceptRequest(request), disabled: busy },
        secondary: [],
        menu: [{ label: 'Respinge solicitarea', run: () => void rejectRequest(request), danger: true }]
      };
    }
    if (stage === 'active') {
      return {
        primary: { label: busy ? 'Se trimite…' : 'Am terminat examinarea', run: () => void completeExamination(request), disabled: busy },
        secondary: [{ label: 'Adaugă măsurători', run: () => openObjective(request) }, chat],
        menu: [
          { label: 'Serviciu suplimentar pe loc', run: () => openAddon(request) },
          { label: 'Transmite la alt medic', run: () => openForward(request) },
          { label: 'Reprogramează', run: () => void proposeTime(request) },
          ...(!request.doctor ? [{ label: 'Finalizează ca operator', run: () => openComplete(request) }] : [])
        ]
      };
    }
    return { primary: null, secondary: [chat], menu: [] };
  };

  const counts = { new: byStage.new.length, active: byStage.active.length, done: byStage.done.length };

  return (
    <>
      {/* Desktop: lista și vizita pe toată înălțimea */}
      <div className="hidden lg:grid lg:h-[calc(100dvh-64px)] lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-slate-200 bg-white" aria-label="Lista vizitelor">
          <StageTabs stage={stage} counts={counts} onStage={(value) => { setStage(value); selectRequest(null); }} />
          <div className="flex-1 overflow-y-auto">
            {isLoading ? <div className="p-4"><ListSkeleton rows={4} /></div> : list.length === 0 ? (
              <EmptyList stage={stage} />
            ) : list.map((request) => (
              <VisitRow key={request.id} request={request} now={now} active={shown?.id === request.id} onSelect={() => selectRequest(request.id)} />
            ))}
          </div>
        </section>
        <section className="min-w-0 overflow-y-auto px-7 py-6" aria-label="Detaliile vizitei">
          {shown ? <VisitDetail key={shown.id} request={shown} now={now} actions={actionsFor(shown)} /> : !isLoading && (
            <div className="grid h-full place-items-center text-center text-sm text-slate-500"><span><MapPin className="mx-auto mb-3 h-8 w-8 text-slate-300" />Alege o vizită din listă.</span></div>
          )}
        </section>
      </div>

      {/* Telefon: lista */}
      <div className="flex flex-col gap-3 lg:hidden">
        <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">Vizite</h1>
        <div className="-mx-4 border-y border-slate-200 bg-white">
          <StageTabs stage={stage} counts={counts} onStage={setStage} />
          {isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : list.length === 0 ? <EmptyList stage={stage} /> : list.map((request) => (
            <VisitRow key={request.id} request={request} now={now} active={false} onSelect={() => selectRequest(request.id)} />
          ))}
        </div>
      </div>

      {/* Telefon: vizita pe tot ecranul */}
      {selected && <MobileVisit request={selected} now={now} actions={actionsFor(selected)} onBack={() => selectRequest(null)} />}

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
    </>
  );
}

type VisitAction = { label: string; run?: () => void; href?: string; disabled?: boolean; danger?: boolean };
type VisitActions = { primary: VisitAction | null; secondary: VisitAction[]; menu: VisitAction[] };

const STAGE_TABS: Array<[Stage, string]> = [['new', 'Cereri noi'], ['active', 'În lucru'], ['done', 'Finalizate']];
const STEPS = ['Cerere', 'Preluată', 'Examinare făcută', 'Concluzia medicului'];

function stepIndex(request: RequestItem) {
  const stage = operatorStageOf(request);
  if (request.status === 'completed') return 3;
  return stage === 'done' ? 2 : stage === 'active' ? 1 : 0;
}

function statusOf(request: RequestItem): { label: string; tone: string } {
  if (request.status === 'rescheduled') return { label: 'Așteaptă pacientul', tone: 'bg-orange-50 text-orange-800' };
  const stage = operatorStageOf(request);
  if (stage === 'new') return { label: 'Cerere nouă', tone: 'bg-amber-100 text-amber-800' };
  if (stage === 'active') return { label: 'În lucru', tone: 'bg-blue-50 text-blue-700' };
  return request.status === 'completed' ? { label: 'Consultație încheiată', tone: 'bg-slate-100 text-slate-600' } : { label: 'La medic', tone: 'bg-emerald-50 text-emerald-700' };
}

function whenOf(request: RequestItem) {
  return request.scheduled_at ? `${relativeDay(request.scheduled_at)}, ${timeOnly(request.scheduled_at)}` : 'Cât mai curând';
}

function subtitleOf(request: RequestItem) {
  return [request.patient_profile?.patient_code && `#${request.patient_profile.patient_code}`, request.patient?.name && request.patient.name !== patientNameOf(request) && `titular ${request.patient.name}`, request.doctor?.name && `medic ${request.doctor.name}`].filter(Boolean).join(' · ');
}

function StageTabs({ stage, counts, onStage }: { stage: Stage; counts: Record<Stage, number>; onStage: (stage: Stage) => void }) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-slate-100 p-[3px]">
        {STAGE_TABS.map(([value, label]) => (
          <button key={value} type="button" onClick={() => onStage(value)}
            className={cn('flex h-8 items-center justify-center gap-[5px] rounded-lg text-[13px] font-medium', stage === value ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>
            <span className="truncate">{label}</span><span className={cn('text-[11px]', value === 'new' && counts.new > 0 ? 'font-bold text-amber-600' : 'text-slate-400')}>{counts[value]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyList({ stage }: { stage: Stage }) {
  const item = STAGES.find((entry) => entry.value === stage);
  return <div className="border-t border-slate-100 px-4 py-8 text-center"><p className="text-sm font-medium text-slate-700">{item?.empty}</p><p className="mt-1 text-[13px] text-slate-500">{item?.description}</p></div>;
}

function VisitRow({ request, now, active, onSelect }: { request: RequestItem; now: number; active: boolean; onSelect: () => void }) {
  const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;
  const investigations = request.pricing_snapshot?.cost_breakdown?.investigations ?? [];
  return (
    <button type="button" onClick={onSelect} aria-current={active ? 'true' : undefined}
      className={cn('flex w-full gap-3 border-t border-slate-100 px-4 py-3.5 text-left', active ? 'bg-blue-50 shadow-[inset_3px_0_0_#2563EB]' : 'bg-white hover:bg-slate-50')}>
      <Avatar name={patientNameOf(request)} size={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-950">{patientNameOf(request)}</span><span className="whitespace-nowrap text-xs text-slate-400">{whenOf(request)}</span></span>
        <span className="truncate text-[13px] text-slate-700">{addressOf(request) || 'Adresă necompletată'}</span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-500">{investigations.length ? `${investigations.length} ${investigations.length === 1 ? 'investigație' : 'investigații'}` : 'Examinare la domiciliu'}</span>
          {expiresIn ? <span className={cn('whitespace-nowrap text-xs font-semibold', expiresIn === 'expirat' ? 'text-red-600' : 'text-amber-700')}>{expiresIn === 'expirat' ? 'Termen depășit' : `preia în ${expiresIn}`}</span>
            : <span className="whitespace-nowrap text-[13px] font-bold text-slate-950">{money(request.amount)} MDL</span>}
        </span>
      </span>
    </button>
  );
}

function ActionButton({ action, primary = false, className }: { action: VisitAction; primary?: boolean; className?: string }) {
  const classes = cn('flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-sm',
    primary ? cn('px-[18px] text-[15px] font-semibold text-white', action.disabled ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700')
      : action.danger ? 'border border-slate-200 bg-white font-medium text-red-600 hover:bg-red-50' : 'border border-slate-200 bg-white font-medium text-slate-950 hover:bg-slate-50', className);
  if (action.href) return <Link to={action.href} className={classes}>{action.href.includes('/chat') && <MessageSquare className="h-4 w-4" />}{action.label}</Link>;
  return <button type="button" onClick={action.run} disabled={action.disabled} className={classes}>{action.label}</button>;
}

/** Ce trebuie să știe operatorul înainte să plece: termen, reprogramare. */
function VisitBanner({ request, now }: { request: RequestItem; now: number }) {
  const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;
  if (expiresIn) {
    return expiresIn === 'expirat'
      ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Termenul de preluare a expirat.</p>
      : <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Preia cazul în <strong>{expiresIn}</strong>, altfel cererea trece la alt operator.</p>;
  }
  if (request.status === 'rescheduled') return <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">Ai propus o oră nouă{request.proposed_scheduled_at ? ` (${dateTime(request.proposed_scheduled_at)})` : ''}. Așteptăm confirmarea pacientului.</p>;
  if (operatorStageOf(request) === 'active') return <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">Datele aparatului HIGO se atașează singure. Când termini, apasă „Am terminat examinarea” și cazul trece la medic.</p>;
  return null;
}

function AddressCard({ request }: { request: RequestItem }) {
  const address = addressOf(request);
  const investigations = request.pricing_snapshot?.cost_breakdown?.investigations ?? [];
  const travelFee = request.pricing_snapshot?.cost_breakdown?.travel_fee;
  const done = operatorStageOf(request) === 'done';
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><MapPin className="h-[22px] w-[22px]" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-xs font-semibold tracking-[.04em] text-slate-500">ADRESA</span>
          <span className="text-base font-semibold text-slate-950">{address || 'Adresă necompletată'}</span>
        </div>
        {address && <a href={mapsUrl(address)} target="_blank" rel="noreferrer" className="hidden h-[38px] shrink-0 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-950 hover:bg-slate-50 sm:flex"><Navigation className="h-4 w-4" />Navigare</a>}
      </div>
      {address && <a href={mapsUrl(address)} target="_blank" rel="noreferrer" className="-mt-1 flex h-11 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white text-sm font-medium text-slate-950 sm:hidden"><Navigation className="h-4 w-4" />Deschide în hărți</a>}
      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3.5">
        <div className="flex flex-col gap-1"><span className="text-xs text-slate-500">{request.scheduled_at ? 'Programare' : 'Cerere trimisă'}</span><span className="text-sm font-semibold text-slate-950">{dateTime(request.scheduled_at || request.created_at)}</span></div>
        <div className="flex flex-col gap-1"><span className="text-xs text-slate-500">Plată</span><span className="text-sm font-semibold text-slate-950">{money(request.amount)} MDL</span><span className="text-xs text-slate-500">{[paymentStatusLabel(request.payment_status), travelFee != null && `deplasare ${money(travelFee)} MDL`].filter(Boolean).join(' · ')}</span></div>
      </div>
      {investigations.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3.5">
          <span className="text-xs font-semibold tracking-[.04em] text-slate-500">INVESTIGAȚII DE EFECTUAT</span>
          <ul className="flex flex-col gap-1.5">
            {investigations.map((line) => (
              <li key={line.id} className="flex items-center gap-2.5 text-sm">
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border', done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300')}>{done && <CheckCircle2 className="h-3.5 w-3.5" />}</span>
                <span className="flex-1 text-slate-950">{line.name}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', line.requirement === 'required' ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-700')}>{line.requirement === 'required' ? 'obligatorie' : 'opțională'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NotesCard({ request }: { request: RequestItem }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-1.5"><span className="text-xs font-semibold tracking-[.04em] text-slate-500">ACUZE</span><span className="whitespace-pre-wrap text-[15px] leading-[1.55] text-slate-950">{request.symptoms || 'Pacientul nu a descris acuzele.'}</span></div>
      {request.triage_notes && <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3"><span className="text-xs font-semibold tracking-[.04em] text-slate-500">NOTE DE TRIAJ</span><span className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.triage_notes}</span></div>}
    </div>
  );
}

function VisitDetail({ request, now, actions }: { request: RequestItem; now: number; actions: VisitActions }) {
  const index = stepIndex(request);
  const status = statusOf(request);
  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={patientNameOf(request)} size={52} />
          <div className="flex flex-col gap-[3px]"><h2 className="text-xl font-bold tracking-[-.01em] text-slate-950">{patientNameOf(request)}</h2><span className="text-[13px] text-slate-500">{subtitleOf(request) || `#${request.id}`}</span></div>
        </div>
        <span className={cn('whitespace-nowrap rounded-full px-[11px] py-[5px] text-xs font-semibold', status.tone)}>{status.label}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-col gap-1.5">
            <div className={cn('h-1 rounded-sm', i <= index ? 'bg-blue-600' : 'bg-slate-200')} />
            <span className={cn('text-xs', i <= index ? 'text-slate-950' : 'text-slate-400', i === index ? 'font-semibold' : 'font-medium')}>{label}</span>
          </div>
        ))}
      </div>

      <VisitBanner request={request} now={now} />
      <AddressCard request={request} />
      <NotesCard request={request} />

      {(actions.primary || actions.secondary.length > 0) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {actions.primary && <ActionButton action={actions.primary} primary />}
          {actions.secondary.map((action) => <ActionButton key={action.label} action={action} />)}
          {actions.menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Mai multe acțiuni" className="grid h-11 w-11 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"><MoreHorizontal className="h-[18px] w-[18px]" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="min-w-[260px] rounded-xl p-1.5">
                {actions.menu.map((action) => (
                  <DropdownMenuItem key={action.label} onSelect={action.run} className={cn('h-10 cursor-pointer rounded-lg px-3 text-sm', action.danger ? 'text-red-600 focus:text-red-700' : 'text-slate-950')}>{action.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}

function MobileVisit({ request, now, actions, onBack }: { request: RequestItem; now: number; actions: VisitActions; onBack: () => void }) {
  const status = statusOf(request);
  // Pe telefon, meniul „⋯” devine butoane pe două coloane.
  const extra = [...actions.secondary, ...actions.menu];
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50 lg:hidden">
      <div className="flex items-center gap-1 px-2 pb-2.5 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="Înapoi" className="grid h-10 w-10 place-items-center text-slate-700"><ArrowLeft className="h-[22px] w-[22px]" /></button>
        <span className="flex-1 text-[17px] font-semibold text-slate-950">{status.label}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-1">
        <div className="flex items-center gap-3 px-0.5 py-1">
          <Avatar name={patientNameOf(request)} size={48} />
          <div className="flex flex-col gap-0.5"><span className="text-lg font-bold text-slate-950">{patientNameOf(request)}</span><span className="text-[13px] text-slate-500">{subtitleOf(request) || `#${request.id}`}</span></div>
        </div>
        <VisitBanner request={request} now={now} />
        <AddressCard request={request} />
        <NotesCard request={request} />
      </div>
      {(actions.primary || extra.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-3">
          {actions.primary && <ActionButton action={actions.primary} primary className="h-12 w-full" />}
          {extra.length > 0 && (
            <div className={cn('grid gap-2', extra.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
              {extra.map((action) => <ActionButton key={action.label} action={action} className="h-11 w-full px-2" />)}
            </div>
          )}
        </div>
      )}
    </div>
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
