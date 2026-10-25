import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Hourglass,
  MessageSquare,
  Microscope,
  Play,
  RefreshCw,
  Search,
  Stethoscope,
  Wallet,
  XCircle
} from 'lucide-react';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { StatusBadge, ToneBadge } from '../../components/app/StatusBadge';
import { MoreMenu, type MoreMenuItem } from '../../components/app/MoreMenu';
import { useDialogs } from '../../components/app/DialogProvider';
import { ConsultationVideoButton } from '../../components/ConsultationVideoButton';
import { HigoConsultationProposal } from '../../components/HigoConsultationProposal';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { FinalizeConsultationDialog } from '../../components/doctor/FinalizeConsultationDialog';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { dateTime, money, relativeDay, timeOnly, timeUntil } from '../../lib/format';
import { CONSULTATION_KIND_LABELS, paymentStatusLabel } from '../../lib/status';
import { useNow } from '../../lib/use-now';
import {
  PatientChart,
  type ExamMediaItem,
  type InvestigationSummary,
  type ObjectiveDataEntry,
  type PatientProfileSummary
} from '../../components/PatientChart';

interface ConsultationRequest {
  id: string;
  type: string;
  status: string;
  current_illness_history?: string | null;
  symptoms?: string | null;
  triage_notes?: string | null;
  specialty?: string | null;
  patient?: { id: string; name: string; email: string } | null;
  doctor?: { id: string; name: string } | null;
  amount?: number;
  provider_amount?: number;
  payment_status?: string;
  acceptance_expires_at?: string | null;
  chat_expires_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  scheduled_at?: string | null;
  proposed_scheduled_at?: string | null;
  consultation_kind?: string;
  patient_profile?: PatientProfileSummary | null;
  objective_data?: ObjectiveDataEntry[];
  exam_media?: ExamMediaItem[];
  investigations?: InvestigationSummary[];
  anamnesis_completed_at?: string | null;
  objective_data_completed_at?: string | null;
  ready_for_doctor?: boolean;
  doctor_started_at?: string | null;
}

type Bucket = 'new' | 'accepted' | 'completed' | 'closed';

const BUCKETS: Array<{ value: Bucket; label: string; empty: string; emptyDescription: string }> = [
  { value: 'new', label: 'Cereri noi', empty: 'Nicio cerere nouă', emptyDescription: 'Cererile pacienților apar aici imediat ce sunt trimise.' },
  { value: 'accepted', label: 'Active', empty: 'Nicio consultație activă', emptyDescription: 'Consultațiile confirmate și cele în desfășurare apar aici.' },
  { value: 'completed', label: 'Finalizate', empty: 'Nicio consultație finalizată', emptyDescription: 'Consultațiile cu concluzia publicată apar aici.' },
  { value: 'closed', label: 'Închise', empty: 'Nicio cerere închisă', emptyDescription: 'Cererile anulate, respinse sau expirate apar aici.' }
];

const bucketOf = (request: ConsultationRequest): Bucket =>
  ['new', 'rescheduled'].includes(request.status) ? 'new'
    : request.status === 'accepted' ? 'accepted'
      : request.status === 'completed' ? 'completed'
        : 'closed';

const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);

const patientNameOf = (request: ConsultationRequest) => request.patient_profile?.name || request.patient?.name || 'Pacient';

const initialsOf = (name: string) => name.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('').toUpperCase();

const isFuture = (value?: string | null) => Boolean(value && new Date(value).getTime() > Date.now());

/** Ce are medicul de făcut acum, într-o propoziție. */
function doctorNextStep(request: ConsultationRequest): { text: string; tone: 'warning' | 'info' | 'success' | 'neutral' } | null {
  if (request.status === 'new') return { text: request.scheduled_at ? `Pacientul a cerut consultația pentru ${dateTime(request.scheduled_at)}. Confirmă ora sau propune alta.` : 'Pacientul așteaptă răspunsul tău.', tone: 'warning' };
  if (request.status === 'rescheduled') return { text: `Ai propus ${dateTime(request.proposed_scheduled_at)}. Așteptăm confirmarea pacientului.`, tone: 'neutral' };
  if (request.status !== 'accepted') return null;
  if (request.doctor_started_at) return { text: 'Consultația este în desfășurare. Publică concluzia când ai terminat.', tone: 'success' };
  if (!request.ready_for_doctor) return { text: 'Se așteaptă datele examinării de la operator. Te anunțăm când sunt gata.', tone: 'info' };
  if (isFuture(request.scheduled_at)) return { text: `Poți începe consultația la ${dateTime(request.scheduled_at)}. Pacientul așteaptă să o deschizi.`, tone: 'info' };
  return { text: 'Totul este pregătit. Poți începe consultația.', tone: 'success' };
}

export function ConsultationsPage() {
  const { user, role } = useAuth();
  const dialogs = useDialogs();
  const now = useNow();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const loadSequence = useRef(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bucket, setBucket] = useState<Bucket>('new');
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [finalizeRequest, setFinalizeRequest] = useState<ConsultationRequest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const starting = useRef(new Set<string>());
  const [rescheduleRequest, setRescheduleRequest] = useState<ConsultationRequest | null>(null);
  const [proposedTime, setProposedTime] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [detailTab, setDetailTab] = useState<'summary' | 'chart' | 'documents'>('summary');

  const selectedId = searchParams.get('request');

  const invalidateRequests = useCallback(() => { loadSequence.current++; }, []);

  const loadRequests = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const response = await apiRequest<{ data: ConsultationRequest[] }>('/requests');
      if (sequence !== loadSequence.current) return;
      setRequests(response.data);
      setLoadError('');
    } catch (err) {
      if (sequence === loadSequence.current) setLoadError(err instanceof Error ? err.message : 'Nu am putut încărca consultațiile.');
    } finally {
      if (sequence === loadSequence.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setRequests([]);
    void loadRequests();
    const timer = window.setInterval(() => void loadRequests(), 15000);
    const refresh = () => void loadRequests();
    window.addEventListener('focus', refresh);
    return () => { invalidateRequests(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [invalidateRequests, loadRequests, user?.id, role]);

  // Un link direct (?request=…) deschide tab-ul potrivit consultației.
  const selected = requests.find((item) => String(item.id) === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    setBucket(bucketOf(selected));
  }, [selected?.id, selected?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDetailTab(searchParams.get('chart') === '1' ? 'chart' : 'summary');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byBucket = useMemo(() => {
    const groups: Record<Bucket, ConsultationRequest[]> = { new: [], accepted: [], completed: [], closed: [] };
    requests.forEach((request) => groups[bucketOf(request)].push(request));
    // Întâi cererile cu termen de răspuns (cel mai apropiat primul), apoi
    // reprogramările care așteaptă pacientul, apoi restul după ora cerută.
    const urgency = (request: ConsultationRequest) => request.status === 'rescheduled' ? Number.MAX_SAFE_INTEGER : time(request.acceptance_expires_at) || Number.MAX_SAFE_INTEGER - 1;
    groups.new.sort((a, b) => urgency(a) - urgency(b) || (time(a.scheduled_at) || time(a.created_at)) - (time(b.scheduled_at) || time(b.created_at)));
    groups.accepted.sort((a, b) => Number(Boolean(b.doctor_started_at)) - Number(Boolean(a.doctor_started_at)) || (time(a.scheduled_at) || time(a.created_at)) - (time(b.scheduled_at) || time(b.created_at)));
    groups.completed.sort((a, b) => time(b.created_at) - time(a.created_at));
    groups.closed.sort((a, b) => time(b.created_at) - time(a.created_at));
    return groups;
  }, [requests]);

  const query = search.trim().toLocaleLowerCase('ro');
  const list = byBucket[bucket].filter((request) => !query || [patientNameOf(request), request.patient?.name, request.patient_profile?.patient_code, request.id, request.specialty]
    .some((value) => String(value ?? '').toLocaleLowerCase('ro').includes(query)));
  const shown = selected ?? list[0] ?? null;

  const selectRequest = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.delete('chart');
    if (id) next.set('request', id); else next.delete('request');
    setSearchParams(next);
  };

  const changeBucket = (value: string) => {
    setBucket(value as Bucket);
    const next = new URLSearchParams(searchParams);
    next.delete('request');
    next.delete('chart');
    setSearchParams(next, { replace: true });
  };

  /**
   * Erorile serverului ajung la medic, iar lista se reîmprospătează după fiecare
   * acțiune. Fără asta, un refuz al backendului părea că butonul nu face nimic.
   */
  const runAction = async (request: ConsultationRequest, action: () => Promise<unknown>, successMessage: string) => {
    setBusyId(request.id);
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setBusyId(null);
      void loadRequests();
    }
  };

  const startConsultation = async (request: ConsultationRequest) => {
    if (request.doctor_started_at || starting.current.has(request.id)) return;
    starting.current.add(request.id);
    setBusyId(request.id);
    try {
      const response = await apiRequest<{ request: ConsultationRequest }>(`/requests/${request.id}/start`, { method: 'POST' });
      setRequests((items) => items.map((item) => item.id === request.id ? response.request : item));
      toast.success('Consultația a început. Poți intra în apelul video sau în chat.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut începe consultația.');
    } finally {
      starting.current.delete(request.id);
      setBusyId(null);
    }
  };

  const acceptRequest = (request: ConsultationRequest) => runAction(
    request,
    () => apiRequest(`/requests/${request.id}/accept`, { method: 'POST' }),
    'Solicitare acceptată. Pacientul a fost anunțat.'
  );

  const rejectRequest = async (request: ConsultationRequest) => {
    const confirmed = await dialogs.confirm({
      title: 'Respingi solicitarea?',
      description: <p>Pacientul <strong>{patientNameOf(request)}</strong> primește înapoi suma de {money(request.amount)} MDL. Acțiunea nu poate fi anulată.</p>,
      confirmLabel: 'Respinge și returnează banii',
      tone: 'danger'
    });
    if (!confirmed) return;
    await runAction(
      request,
      () => apiRequest(`/requests/${request.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Solicitare respinsă de medic.' }) }),
      'Solicitare respinsă. Banii au fost returnați pacientului.'
    );
  };

  const requestInvestigation = async (request: ConsultationRequest) => {
    const values = await dialogs.form({
      title: 'Cere o investigație suplimentară',
      description: 'Pacientul și operatorul primesc cererea împreună cu notele tale.',
      confirmLabel: 'Trimite cererea',
      fields: [
        { name: 'title', label: 'Investigația', placeholder: 'Ex: Hemoleucogramă completă', required: true },
        { name: 'notes', label: 'Note pentru pacient / operator', type: 'textarea' }
      ]
    });
    if (!values) return;
    await runAction(
      request,
      () => apiRequest(`/requests/${request.id}/additional-investigation`, { method: 'POST', body: JSON.stringify({ title: values.title, notes: values.notes || '' }) }),
      'Investigație suplimentară solicitată.'
    );
  };

  const proposeTime = (request: ConsultationRequest) => {
    setRescheduleRequest(request);
    setProposedTime('');
    setScheduleError('');
  };

  const submitProposedTime = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rescheduleRequest || scheduleSaving) return;
    if (!proposedTime || new Date(proposedTime).getTime() <= Date.now()) {
      setScheduleError('Alege o dată și o oră în viitor.');
      return;
    }
    setScheduleSaving(true);
    setScheduleError('');
    try {
      await apiRequest(`/requests/${rescheduleRequest.id}/propose-time`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: new Date(proposedTime).toISOString() })
      });
      setRescheduleRequest(null);
      toast.success('Oră nouă propusă. Așteptăm confirmarea pacientului.');
      void loadRequests();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Nu am putut propune ora.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const requestedMissing = !isLoading && !loadError && selectedId && !selected;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Consultații"
        description="Cererile pacienților, programările și concluziile tale."
        actions={
          <Button type="button" variant="outline" onClick={() => { setIsRefreshing(true); void loadRequests(); }} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />Actualizează
          </Button>
        }
      />

      {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
      {requestedMissing && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Consultația solicitată nu este disponibilă pentru acest cont de medic.</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] lg:items-start">
        {/* Lista */}
        <section className={cn('space-y-3 lg:sticky lg:top-24', selected && 'hidden lg:block')} aria-label="Lista consultațiilor">
          <Tabs value={bucket} onValueChange={changeBucket}>
            <TabsList className="grid w-full grid-cols-4">
              {BUCKETS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className="flex-col gap-0 px-1 py-1.5 text-xs sm:flex-row sm:gap-1.5 sm:text-[13px]">
                  <span className="truncate">{item.label}</span>
                  <span className={cn('tabular text-[11px] font-bold', item.value === 'new' && byBucket.new.length > 0 ? 'text-amber-600' : 'text-slate-400')}>{byBucket[item.value].length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută pacient, cod sau #ID" className="pl-9" aria-label="Caută consultații" />
          </div>

          {isLoading ? <ListSkeleton rows={4} /> : list.length === 0 ? (
            <EmptyState
              compact
              icon={ClipboardList}
              title={query ? 'Niciun rezultat' : BUCKETS.find((item) => item.value === bucket)?.empty}
              description={query ? 'Încearcă alt nume sau cod de pacient.' : BUCKETS.find((item) => item.value === bucket)?.emptyDescription}
            />
          ) : (
            <ul className="space-y-2">
              {list.map((request) => (
                <li key={request.id}>
                  <RequestListItem request={request} active={selected?.id === request.id} implicitActive={!selected && shown?.id === request.id} now={now} onSelect={() => selectRequest(request.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Detaliul */}
        <section className={cn('min-w-0', !selected && 'hidden lg:block')} aria-label="Detaliile consultației">
          {selected && (
            <Button variant="ghost" size="sm" className="-ml-2 mb-2 lg:hidden" onClick={() => selectRequest(null)}>
              <ArrowLeft className="h-4 w-4" />Înapoi la listă
            </Button>
          )}
          {shown ? (
            <RequestDetail
              key={shown.id}
              request={shown}
              now={now}
              busy={busyId === shown.id}
              tab={detailTab}
              onTabChange={setDetailTab}
              onAccept={() => void acceptRequest(shown)}
              onReject={() => void rejectRequest(shown)}
              onPropose={() => proposeTime(shown)}
              onStart={() => void startConsultation(shown)}
              onFinalize={() => setFinalizeRequest(shown)}
              onInvestigation={() => void requestInvestigation(shown)}
            />
          ) : !isLoading && (
            <EmptyState icon={Stethoscope} title="Selectează o consultație" description="Detaliile, fișa pacientului și acțiunile apar aici." className="py-20" />
          )}
        </section>
      </div>

      <Dialog open={!!rescheduleRequest} onOpenChange={(open) => { if (!open && !scheduleSaving) setRescheduleRequest(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Propune altă oră</DialogTitle>
            <DialogDescription>Alege când poți consulta pacientul. Acesta primește propunerea și o confirmă.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitProposedTime} className="space-y-5">
            {rescheduleRequest?.scheduled_at && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Programarea actuală: <strong className="text-slate-900">{dateTime(rescheduleRequest.scheduled_at)}</strong></p>}
            <div className="space-y-2">
              <Label htmlFor="proposed-time">Data și ora nouă</Label>
              <Input id="proposed-time" type="datetime-local" required value={proposedTime} onChange={(event) => setProposedTime(event.target.value)} disabled={scheduleSaving} />
              <p className="text-xs text-slate-500">Fus orar: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
            </div>
            {scheduleError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{scheduleError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={scheduleSaving} onClick={() => setRescheduleRequest(null)}>Renunță</Button>
              <Button type="submit" disabled={scheduleSaving || !proposedTime}>{scheduleSaving ? 'Se trimite…' : 'Trimite propunerea'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FinalizeConsultationDialog
        request={finalizeRequest}
        open={Boolean(finalizeRequest)}
        onOpenChange={(open) => { if (!open) setFinalizeRequest(null); }}
        onCompleted={() => { toast.success('Concluzia a fost publicată. Pacientul a primit documentul PDF.'); void loadRequests(); }}
      />
    </div>
  );
}

function RequestListItem({ request, active, implicitActive = false, now, onSelect }: { request: ConsultationRequest; active: boolean; implicitActive?: boolean; now: number; onSelect: () => void }) {
  const name = patientNameOf(request);
  const when = request.scheduled_at || request.created_at;
  const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border bg-white p-3.5 text-left transition',
        active ? 'border-primary/40 shadow-sm ring-2 ring-primary/15' : implicitActive ? 'border-slate-200 hover:border-slate-300 lg:border-primary/40 lg:shadow-sm lg:ring-2 lg:ring-primary/15' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      )}>
      <Avatar className="size-10 shrink-0">
        <AvatarFallback className={cn('text-xs font-semibold', active || implicitActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600')}>{initialsOf(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate font-semibold text-slate-900">{name}</span>
          <span className="tabular shrink-0 text-xs text-slate-500">{relativeDay(when)}, {timeOnly(when)}</span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-slate-500">{request.specialty || 'Consultație'} · {CONSULTATION_KIND_LABELS[request.consultation_kind ?? ''] ?? 'Consultație'}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge request={request} perspective="doctor" />
          {expiresIn && <span className={cn('inline-flex items-center gap-1 text-xs font-medium', expiresIn === 'expirat' ? 'text-red-600' : 'text-amber-700')}><Hourglass className="h-3 w-3" />{expiresIn === 'expirat' ? 'Termen depășit' : `Răspunde în ${expiresIn}`}</span>}
          {request.consultation_kind === 'with_exam' && request.status === 'accepted' && !request.ready_for_doctor && <span className="text-xs text-slate-500">· așteaptă examinarea</span>}
        </span>
      </span>
    </button>
  );
}

function RequestDetail({
  request,
  now,
  busy,
  tab,
  onTabChange,
  onAccept,
  onReject,
  onPropose,
  onStart,
  onFinalize,
  onInvestigation
}: {
  request: ConsultationRequest;
  now: number;
  busy: boolean;
  tab: 'summary' | 'chart' | 'documents';
  onTabChange: (tab: 'summary' | 'chart' | 'documents') => void;
  onAccept: () => void;
  onReject: () => void;
  onPropose: () => void;
  onStart: () => void;
  onFinalize: () => void;
  onInvestigation: () => void;
}) {
  const name = patientNameOf(request);
  const bucket = bucketOf(request);
  const next = doctorNextStep(request);
  const expiresIn = request.status === 'new' ? timeUntil(request.acceptance_expires_at, now) : null;
  const startBlocked = isFuture(request.scheduled_at);

  // O singură acțiune principală pe etapă; restul în „⋯”.
  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];
  const more: MoreMenuItem[] = [];

  if (request.status === 'new') {
    primary = <Button onClick={onAccept} disabled={busy}><CheckCircle2 className="h-4 w-4" />{busy ? 'Se confirmă…' : request.scheduled_at ? 'Confirmă ora' : 'Acceptă'}</Button>;
    secondary.push(<Button key="propose" variant="outline" onClick={onPropose} disabled={busy}><CalendarClock className="h-4 w-4" />Propune altă oră</Button>);
    more.push({ label: 'Finalizează direct', icon: FileText, onSelect: onFinalize });
    more.push({ label: 'Respinge și returnează banii', icon: XCircle, onSelect: onReject, danger: true, separatorBefore: true });
  } else if (request.status === 'accepted') {
    if (request.ready_for_doctor && !request.doctor_started_at) {
      primary = <Button onClick={onStart} disabled={busy || startBlocked} title={startBlocked ? `Disponibil de la ${dateTime(request.scheduled_at)}` : undefined}><Play className="h-4 w-4" />{busy ? 'Se începe…' : 'Începe consultația'}</Button>;
      more.push({ label: 'Finalizează consultația', icon: FileText, onSelect: onFinalize });
    } else {
      primary = <Button onClick={onFinalize}><FileText className="h-4 w-4" />Scrie concluzia</Button>;
    }
    secondary.push(<ConsultationVideoButton key="video" requestId={request.id} size="default" variant="outline" label="Apel video" />);
    secondary.push(<Button key="chat" asChild variant="outline"><Link to={`/doctor/chat?request=${request.id}`}><MessageSquare className="h-4 w-4" />Mesaje</Link></Button>);
    if (request.consultation_kind === 'with_exam') more.unshift({ label: 'Cere investigație suplimentară', icon: Microscope, onSelect: onInvestigation });
    more.push({ label: 'Reprogramează', icon: CalendarClock, onSelect: onPropose });
  } else {
    secondary.push(<Button key="history" asChild variant="outline"><Link to={`/doctor/chat?request=${request.id}`}><MessageSquare className="h-4 w-4" />Vezi discuția</Link></Button>);
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Antet */}
      <header className="border-b border-slate-100 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar className="size-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initialsOf(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">{name}</h2>
              <StatusBadge request={request} perspective="doctor" />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {[request.patient_profile?.patient_code && `Cod ${request.patient_profile.patient_code}`, request.patient?.name && `Titular: ${request.patient.name}`, `#${request.id}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Fact icon={CalendarDays} label={request.scheduled_at ? (request.status === 'new' ? 'Ora solicitată' : 'Programare') : 'Trimisă la'} value={dateTime(request.scheduled_at || request.created_at)} />
          <Fact icon={Stethoscope} label="Tip" value={`${request.specialty || 'Consultație'} · ${CONSULTATION_KIND_LABELS[request.consultation_kind ?? ''] ?? '—'}`} />
          <Fact icon={Wallet} label="Plată" value={`${money(request.amount)} MDL`} detail={paymentStatusLabel(request.payment_status)} />
        </dl>

        {next && (
          <div className={cn('mt-5 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm',
            next.tone === 'warning' ? 'bg-amber-50 text-amber-900' : next.tone === 'success' ? 'bg-emerald-50 text-emerald-900' : next.tone === 'info' ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-700')}>
            <Clock className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
            <p className="flex-1">{next.text}{expiresIn && <strong className="ml-1 font-semibold">{expiresIn === 'expirat' ? 'Termenul de răspuns a expirat.' : `Termen de răspuns: ${expiresIn}.`}</strong>}</p>
          </div>
        )}

        {(primary || secondary.length > 0) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {primary}
            {secondary}
            <MoreMenu items={more} />
          </div>
        )}
      </header>

      {/* Conținut */}
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as 'summary' | 'chart' | 'documents')} className="gap-0">
        <TabsList variant="line" className="w-full justify-start gap-4 overflow-x-auto px-5 sm:px-6">
          <TabsTrigger value="summary" className="flex-none rounded-none border-b-2 border-transparent px-1 pb-3 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Rezumat</TabsTrigger>
          <TabsTrigger value="chart" className="flex-none rounded-none border-b-2 border-transparent px-1 pb-3 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Fișa pacientului</TabsTrigger>
          {bucket === 'completed' && <TabsTrigger value="documents" className="flex-none rounded-none border-b-2 border-transparent px-1 pb-3 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Documente</TabsTrigger>}
        </TabsList>

        <TabsContent value="summary" className="space-y-5 p-5 sm:p-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Acuzele pacientului</h3>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{request.symptoms || request.triage_notes || 'Pacientul nu a descris acuzele.'}</p>
          </div>
          {request.current_illness_history && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Istoricul bolii actuale</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.current_illness_history}</p>
            </div>
          )}
          {request.consultation_kind === 'with_exam' && (
            <div className="flex flex-wrap items-center gap-2">
              <ToneBadge tone={request.objective_data_completed_at ? 'success' : 'warning'}>
                <Activity className="h-3 w-3" />Date obiective {request.objective_data_completed_at ? 'primite' : 'în așteptare'}
              </ToneBadge>
              {(request.objective_data ?? []).some((entry) => entry.from_device) && <ToneBadge tone="info" dot={false}>Aparat HIGO</ToneBadge>}
              <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => onTabChange('chart')}>Vezi datele în fișă</button>
            </div>
          )}
          {['new', 'accepted'].includes(request.status) && <HigoConsultationProposal requestId={request.id} />}
          {bucket === 'closed' && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{request.cancellation_reason || 'Solicitare închisă. Fișa și istoricul rămân disponibile.'}</p>}
          {bucket === 'completed' && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Documente publicate</h3>
              <ConsultationDocuments requestId={request.id} compact />
            </div>
          )}
        </TabsContent>

        <TabsContent value="chart" className="p-5 sm:p-6">
          <PatientChart
            profile={request.patient_profile}
            illnessHistory={request.current_illness_history}
            symptoms={request.symptoms}
            triageNotes={request.triage_notes}
            objectiveData={request.objective_data}
            examMedia={request.exam_media}
            investigations={request.investigations}
            anamnesisCompletedAt={request.anamnesis_completed_at}
            objectiveDataCompletedAt={request.objective_data_completed_at}
          />
        </TabsContent>

        {bucket === 'completed' && (
          <TabsContent value="documents" className="p-5 sm:p-6">
            <ConsultationDocuments requestId={request.id} />
          </TabsContent>
        )}
      </Tabs>
    </article>
  );
}

function Fact({ icon: Icon, label, value, detail }: { icon: React.ElementType; label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
      {detail && <dd className="text-xs text-slate-500">{detail}</dd>}
    </div>
  );
}
