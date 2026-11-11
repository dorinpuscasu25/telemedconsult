import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, MessageSquare, MoreHorizontal, Search, Stethoscope, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';
import { ListSkeleton } from '../../components/ui/skeleton';
import { cn } from '../../components/ui/utils';
import { useDialogs } from '../../components/app/DialogProvider';
import { HigoConsultationProposal } from '../../components/HigoConsultationProposal';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { ConclusionDialog } from '../../components/doctor/ConclusionEditor';
import { ProposeTimeDialog } from '../../components/doctor/ProposeTimeDialog';
import { PatientChart, type ExamMediaItem, type InvestigationSummary, type ObjectiveDataEntry, type PatientProfileSummary } from '../../components/PatientChart';
import { countDone } from '../../components/patient/record/sectionMeta';
import { apiRequest } from '../../lib/api';
import {
  agoLabel, ageLabel, hm, leftLabel, mdl, serviceMeta, stageOf, STAGE_LABEL, STAGE_TONE, whenLabel,
  type Proposal, type RequestService, type Stage
} from '../../lib/doctor';
import { MEDICAL_SECTIONS, type MedicalRecord } from '../../lib/medical-record';
import { usePageTitle } from '../../lib/use-page-title';
import { useNow } from '../../lib/use-now';
import { Avatar } from './DoctorHome';
import { ServiceIcon } from '../../components/doctor/ServiceIcon';

interface ConsultationRequest {
  closed_at?: string | null;
  auto_close_at?: string | null;
  settlement?: { auto_close_days: number; no_show_refund_hours: number } | null;
  id: string;
  type: string;
  status: string;
  stage?: Stage;
  consultation_kind?: string;
  service?: RequestService;
  proposal?: Proposal | null;
  doctor_reply_due_at?: string | null;
  current_illness_history?: string | null;
  symptoms?: string | null;
  triage_notes?: string | null;
  patient?: { id: string; name: string; email: string } | null;
  amount?: number;
  payment_status?: string;
  created_at: string;
  accepted_at?: string | null;
  completed_at?: string | null;
  scheduled_at?: string | null;
  free_chat_until?: string | null;
  cancellation_reason?: string | null;
  patient_profile?: PatientProfileSummary | null;
  objective_data?: ObjectiveDataEntry[];
  exam_media?: ExamMediaItem[];
  investigations?: InvestigationSummary[];
  anamnesis_completed_at?: string | null;
  objective_data_completed_at?: string | null;
  ready_for_doctor?: boolean;
  doctor_started_at?: string | null;
  has_conclusion_draft?: boolean;
}

type Bucket = 'new' | 'act' | 'fin' | 'cl';
const TABS: Array<[Bucket, string]> = [['new', 'Cereri noi'], ['act', 'Active'], ['fin', 'Finalizate'], ['cl', 'Închise']];
const bucketOf = (stage: Stage): Bucket => (['new', 'prop', 'ask'].includes(stage) ? 'new' : ['conf', 'live'].includes(stage) ? 'act' : stage === 'done' ? 'fin' : 'cl');
const time = (value?: string | null) => (value ? new Date(value).getTime() : 0);
const nameOf = (request: ConsultationRequest) => request.patient_profile?.name || request.patient?.name || 'Pacient';
const priceOf = (request: ConsultationRequest) => request.service?.price ?? request.amount ?? 0;
const DOW = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

function dayWord(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Math.round((new Date(date.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  return diff === 0 ? 'azi' : diff === -1 ? 'ieri' : diff > -7 ? DOW[date.getDay()] : date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

/** Ce scrie sub nume în listă: cât de recentă e cererea sau ce s-a întâmplat. */
function sentLabel(request: ConsultationRequest, stage: Stage, now: number) {
  if (['new', 'prop', 'ask'].includes(stage)) return agoLabel(request.created_at, now);
  if (stage === 'conf' || stage === 'live') return `confirmată ${dayWord(request.accepted_at ?? request.created_at)}`;
  if (stage === 'done') return dayWord(request.completed_at ?? request.created_at);
  return STAGE_LABEL[stage].toLowerCase();
}

function whenForList(request: ConsultationRequest, stage: Stage) {
  if (stage === 'prop') return `Propus: ${(request.proposal?.slots ?? []).map((slot) => whenLabel(slot)).join(', ')}`;
  if (stage === 'ask') return 'Cere alte ore';
  return whenLabel(request.scheduled_at ?? request.created_at, true);
}

const TONES = {
  amber: 'border-amber-200 bg-amber-50 [--banner:#92400E]',
  blue: 'border-blue-200 bg-blue-50 [--banner:#1E3A8A]',
  green: 'border-green-200 bg-green-50 [--banner:#166534]',
  grey: 'border-slate-200 bg-slate-50 [--banner:#0F172A]'
} as const;

interface Banner { tone: keyof typeof TONES; title: string; text: string; slots?: string[]; note?: string | null }

function bannerFor(request: ConsultationRequest, stage: Stage, now: number): Banner {
  const price = mdl(priceOf(request));
  const expires = whenLabel(request.proposal?.expires_at);
  const reschedule = Boolean(request.proposal?.is_reschedule);
  const timeCome = !request.scheduled_at || time(request.scheduled_at) <= now;
  switch (stage) {
    case 'new':
      return {
        tone: 'amber',
        title: request.doctor_reply_due_at ? `Răspunde până ${whenLabel(request.doctor_reply_due_at)}` : 'Cerere nouă',
        text: 'Confirmă ora cerută sau propune altele. Dacă nu răspunzi, cererea expiră și banii revin la pacient.'
      };
    case 'prop': {
      const count = request.proposal?.slots.length ?? 0;
      return {
        tone: 'blue',
        title: reschedule ? 'Ai propus mutarea consultației' : `Ai propus ${count === 1 ? 'o oră nouă' : `${count} ore noi`}`,
        text: `Pacientul a primit notificare în aplicație și pe Telegram. Așteptăm răspunsul până ${expires}. ${reschedule ? `Dacă nu răspunde, rămâne ora confirmată: ${whenLabel(request.scheduled_at)}.` : 'Dacă nu răspunde, cererea expiră și banii revin la pacient.'}`,
        slots: request.proposal?.slots
      };
    }
    case 'ask':
      return { tone: 'amber', title: 'Niciuna dintre ore nu i se potrivește', text: `Propune alte ore până ${expires}. Altfel cererea se anulează și banii revin la pacient.`, note: request.proposal?.patient_note };
    case 'conf':
      if (request.consultation_kind === 'with_exam' && !request.ready_for_doctor) {
        return { tone: 'blue', title: `Consultația e ${whenLabel(request.scheduled_at)}`, text: 'Se așteaptă datele examinării la domiciliu. Te anunțăm când sunt gata.' };
      }
      return {
        tone: 'blue',
        title: `Consultația e ${whenLabel(request.scheduled_at)}`,
        text: timeCome ? 'A venit ora. Începe consultația, apoi sună pacientul.' : '„Începe consultația” devine activ la ora programată. Până atunci poți reprograma din „⋯”.'
      };
    case 'live':
      return { tone: 'blue', title: `Consultația a început la ${hm(request.doctor_started_at ?? now)}`, text: 'Scrie concluzia aici sau direct din apel. Ciorna se salvează singură.' };
    case 'done':
      return {
        tone: 'green',
        title: 'Concluzia a fost publicată. Pacientul a primit documentul PDF.',
        text: `${request.payment_status === 'captured'
          ? `Pacientul a închis consultația: ${price} au intrat în balanța ta.`
          : `${price} ajung în balanța ta când pacientul închide consultația cu o recenzie${request.auto_close_at ? ` sau automat ${whenLabel(request.auto_close_at).split(',')[0]}` : ''}.`}${request.free_chat_until && time(request.free_chat_until) > now ? ` Chatul rămâne deschis gratuit până ${whenLabel(request.free_chat_until).split(',')[0]}.` : ''}`
      };
    case 'expired':
      return { tone: 'grey', title: request.cancellation_reason || 'Cererea a expirat', text: `${price} au revenit în portofelul pacientului. Ambii ați primit notificare.` };
    default:
      return {
        tone: 'grey',
        title: request.status === 'rejected' ? 'Ai respins cererea' : 'Pacientul a anulat cererea',
        text: `${price} au revenit în portofelul pacientului. Ambii ați primit notificare.`
      };
  }
}

const MONEY_NOTE: Record<Stage, string> = {
  new: 'rezervat de pacient', prop: 'rezervat de pacient', ask: 'rezervat de pacient', conf: 'rezervat de pacient', live: 'rezervat de pacient',
  done: 'transferat la tine', cancel: 'returnat', expired: 'returnat'
};

interface Action { label: string; run: () => void; danger?: boolean; disabled?: boolean; href?: string; video?: boolean }
interface Actions { primary: Action | null; secondary: Action[]; menu: Action[]; hint: string | null }

/**
 * C1 + P1: lista cererilor cu serviciul și prețul pe fiecare rând; în dreapta,
 * cererea aleasă începe cu serviciul, apoi acuzele, ora și acțiunile etapei.
 * Pe telefon (MBb), cererea se deschide pe tot ecranul cu acțiunile jos.
 */
export function ConsultationsPage() {
  usePageTitle('Consultații');
  const dialogs = useDialogs();
  const location = useLocation();
  const now = useNow();
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bucket, setBucket] = useState<Bucket>('new');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [conclusionOpen, setConclusionOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const sequence = useRef(0);
  const selectedId = searchParams.get('request');

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const response = await apiRequest<{ data: ConsultationRequest[] }>('/requests');
      if (current !== sequence.current) return;
      setRequests(response.data ?? []);
      setLoadError('');
    } catch (err) {
      if (current === sequence.current) setLoadError(err instanceof Error ? err.message : 'Nu am putut încărca consultațiile.');
    } finally {
      if (current === sequence.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000);
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => { sequence.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);

  const withStage = useMemo(() => requests.map((request) => ({ ...request, stage: stageOf(request) })), [requests]);
  const counts = useMemo(() => {
    const result: Record<Bucket, number> = { new: 0, act: 0, fin: 0, cl: 0 };
    withStage.forEach((request) => { result[bucketOf(request.stage)]++; });
    return result;
  }, [withStage]);

  const selected = withStage.find((request) => request.id === selectedId) ?? null;
  useEffect(() => { if (selected) setBucket(bucketOf(selected.stage)); }, [selected?.id, selected?.stage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected && searchParams.get('propose') === '1') {
      setProposeOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('propose');
      setSearchParams(next, { replace: true });
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = search.trim().toLocaleLowerCase('ro');
  const list = withStage
    .filter((request) => bucketOf(request.stage) === bucket)
    .filter((request) => !query || [nameOf(request), request.patient?.name, request.patient_profile?.patient_code, request.id].some((value) => String(value ?? '').toLocaleLowerCase('ro').includes(query)))
    .sort((a, b) => (bucket === 'new' ? time(a.created_at) - time(b.created_at) : bucket === 'act' ? Number(Boolean(b.doctor_started_at)) - Number(Boolean(a.doctor_started_at)) || time(a.scheduled_at) - time(b.scheduled_at) : time(b.created_at) - time(a.created_at)));
  const shown = selected ?? list[0] ?? null;

  const select = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('request', id); else next.delete('request');
    setSearchParams(next);
  };

  const changed = () => { window.dispatchEvent(new Event('requests-changed')); void load(); };
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea nu a putut fi finalizată.');
    } finally {
      setBusy(false);
      changed();
    }
  };

  const post = (request: ConsultationRequest, path: string, body?: unknown) => apiRequest(`/requests/${request.id}/${path}`, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

  const refuse = async (request: ConsultationRequest & { stage: Stage }) => {
    const confirmed = await dialogs.confirm({
      title: request.stage === 'conf' ? 'Anulezi consultația?' : 'Respingi cererea?',
      description: <p>{nameOf(request)} primește înapoi {mdl(priceOf(request))}. Acțiunea nu poate fi anulată.</p>,
      confirmLabel: request.stage === 'conf' ? 'Anulează și returnează banii' : 'Respinge și returnează banii',
      tone: 'danger'
    });
    if (!confirmed) return;
    await run(() => post(request, 'reject', { reason: request.stage === 'conf' ? 'Consultație anulată de medic.' : 'Cerere respinsă de medic.' }), 'Banii au revenit la pacient.');
  };

  const start = (request: ConsultationRequest) => run(() => post(request, 'start'), 'Consultația a început. Poți suna pacientul sau scrie concluzia.');

  const actionsFor = (request: ConsultationRequest & { stage: Stage }): Actions => {
    const chat = `/doctor/chat?request=${request.id}`;
    const video = `/consultations/${request.id}/video`;
    const openPropose = () => setProposeOpen(true);
    const reschedule = Boolean(request.proposal?.is_reschedule);
    switch (request.stage) {
      case 'new':
        return {
          primary: { label: request.scheduled_at ? `Confirmă ${whenLabel(request.scheduled_at)}` : 'Acceptă cererea', run: () => void run(() => post(request, 'accept'), 'Ora e confirmată. Pacientul a fost anunțat.') },
          secondary: [{ label: 'Propune altă oră', run: openPropose }],
          menu: [{ label: 'Finalizează direct', run: () => setConclusionOpen(true) }, { label: 'Respinge și returnează banii', run: () => void refuse(request), danger: true }],
          hint: 'Banii sunt deja rezervați din portofelul pacientului. Îi primești când publici concluzia.'
        };
      case 'prop':
        return {
          primary: { label: 'Modifică propunerea', run: openPropose },
          secondary: [{ label: 'Mesaje', run: () => undefined, href: chat }],
          menu: [
            { label: 'Retrage propunerea', run: () => void run(() => post(request, 'withdraw-proposal'), 'Propunerea a fost retrasă.') },
            { label: reschedule ? 'Anulează și returnează banii' : 'Respinge și returnează banii', run: () => void refuse(request), danger: true }
          ],
          hint: null
        };
      case 'ask':
        return {
          primary: { label: 'Propune alte ore', run: openPropose },
          secondary: [{ label: 'Scrie pacientului', run: () => undefined, href: chat }],
          menu: [{ label: 'Respinge și returnează banii', run: () => void refuse(request), danger: true }],
          hint: null
        };
      case 'conf': {
        const blocked = (request.scheduled_at && time(request.scheduled_at) > now) || (request.consultation_kind === 'with_exam' && !request.ready_for_doctor);
        return {
          primary: { label: blocked && request.scheduled_at && time(request.scheduled_at) > now ? `Începe consultația · de la ${hm(request.scheduled_at)}` : 'Începe consultația', run: () => void start(request), disabled: Boolean(blocked) || busy },
          secondary: [...(request.service?.type !== 'chat' ? [{ label: 'Apel video', run: () => undefined, href: video, video: true }] : []), { label: 'Mesaje', run: () => undefined, href: chat }],
          menu: [{ label: 'Reprogramează', run: openPropose }, { label: 'Anulează și returnează banii', run: () => void refuse(request), danger: true }],
          hint: null
        };
      }
      case 'live':
        return {
          primary: { label: request.has_conclusion_draft ? 'Continuă concluzia' : 'Scrie concluzia', run: () => setConclusionOpen(true) },
          secondary: [...(request.service?.type !== 'chat' ? [{ label: 'Apel video', run: () => undefined, href: video, video: true }] : []), { label: 'Mesaje', run: () => undefined, href: chat }],
          menu: [],
          hint: request.service?.type !== 'chat' ? 'Concluzia se poate scrie și din ecranul apelului.' : null
        };
      case 'done':
        return { primary: { label: 'Vezi PDF-ul', run: () => setDocsOpen(true) }, secondary: [{ label: 'Vezi discuția', run: () => undefined, href: chat }], menu: [], hint: null };
      default:
        return { primary: null, secondary: [{ label: 'Vezi discuția', run: () => undefined, href: chat }], menu: [], hint: null };
    }
  };

  const actions = shown ? actionsFor(shown) : null;
  const linkState = { returnTo: location.pathname + location.search };

  return (
    <>
      {/* Desktop · C1a */}
      <div className="hidden lg:grid lg:h-[calc(100dvh-64px)] lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col border-r border-slate-200 bg-white" aria-label="Lista consultațiilor">
          <ListControls bucket={bucket} counts={counts} search={search} onSearch={setSearch} onBucket={(value) => { setBucket(value); select(null); }} />
          <div className="flex-1 overflow-y-auto">
            {isLoading ? <div className="p-4"><ListSkeleton rows={4} /></div> : list.length === 0 ? (
              <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">{query ? 'Niciun rezultat pentru căutare.' : 'Nimic aici deocamdată.'}</p>
            ) : list.map((request) => (
              <ListRow key={request.id} request={request} active={shown?.id === request.id} now={now} onSelect={() => select(request.id)} />
            ))}
          </div>
        </section>
        <section className="min-w-0 overflow-y-auto px-7 py-6" aria-label="Detaliile cererii">
          {loadError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
          {shown && actions ? (
            <Detail request={shown} now={now} actions={actions} linkState={linkState} onChart={() => setChartOpen(true)} />
          ) : !isLoading && (
            <div className="grid h-full place-items-center text-center text-sm text-slate-500"><span><Stethoscope className="mx-auto mb-3 h-8 w-8 text-slate-300" />Alege o cerere din listă.</span></div>
          )}
        </section>
      </div>

      {/* Telefon · lista */}
      <div className="flex flex-col gap-3 lg:hidden">
        <h1 className="text-2xl font-bold tracking-[-.02em] text-slate-950">Consultații</h1>
        <div className="-mx-4 border-y border-slate-200 bg-white">
          <ListControls bucket={bucket} counts={counts} search={search} onSearch={setSearch} onBucket={setBucket} />
          {isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : list.length === 0 ? (
            <p className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">Nimic aici deocamdată.</p>
          ) : list.map((request) => <ListRow key={request.id} request={request} active={false} now={now} onSelect={() => select(request.id)} />)}
        </div>
        {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}
      </div>

      {/* Telefon · MBb */}
      {selected && actions && (
        <MobileRequest request={selected} now={now} actions={actions} linkState={linkState} onBack={() => select(null)} onChart={() => setChartOpen(true)} />
      )}

      <ProposeTimeDialog request={shown} open={proposeOpen} onOpenChange={setProposeOpen} onSent={() => { toast.success('Propunerea a fost trimisă pacientului.'); changed(); }} />
      <ConclusionDialog request={shown} open={conclusionOpen} onOpenChange={setConclusionOpen} onPublished={() => { toast.success('Concluzia a fost publicată. Pacientul a primit documentul PDF.'); changed(); }} />
      <Dialog open={chartOpen} onOpenChange={setChartOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Fișa medicală · {shown ? nameOf(shown) : ''}</DialogTitle>
          {shown && (
            <PatientChart profile={shown.patient_profile} illnessHistory={shown.current_illness_history} symptoms={shown.symptoms} triageNotes={shown.triage_notes}
              objectiveData={shown.objective_data} examMedia={shown.exam_media} investigations={shown.investigations}
              anamnesisCompletedAt={shown.anamnesis_completed_at} objectiveDataCompletedAt={shown.objective_data_completed_at} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Documente publicate</DialogTitle>
          {shown && <ConsultationDocuments requestId={shown.id} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ListControls({ bucket, counts, search, onSearch, onBucket }: { bucket: Bucket; counts: Record<Bucket, number>; search: string; onSearch: (value: string) => void; onBucket: (bucket: Bucket) => void }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-4 gap-0.5 rounded-[10px] bg-slate-100 p-[3px]">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" onClick={() => onBucket(value)}
            className={cn('flex h-8 items-center justify-center gap-[5px] rounded-lg text-[13px] font-medium', bucket === value ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,.12)]' : 'text-slate-500')}>
            <span className="truncate">{label}</span><span className="text-[11px] text-slate-400">{counts[value]}</span>
          </button>
        ))}
      </div>
      <label className="flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 px-3 focus-within:border-blue-600">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Caută pacient, cod sau #ID" aria-label="Caută consultații" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
      </label>
    </div>
  );
}

function ListRow({ request, active, now, onSelect }: { request: ConsultationRequest & { stage: Stage }; active: boolean; now: number; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-current={active ? 'true' : undefined}
      className={cn('flex w-full gap-3 border-t border-slate-100 px-4 py-3.5 text-left', active ? 'bg-blue-50 shadow-[inset_3px_0_0_#2563EB]' : 'bg-white hover:bg-slate-50')}>
      <Avatar name={nameOf(request)} size={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-950">{nameOf(request)}</span><span className="whitespace-nowrap text-xs text-slate-400">{sentLabel(request, request.stage, now)}</span></span>
        <span className="truncate text-[13px] text-slate-700">{request.service?.name ?? 'Consultație'}</span>
        <span className="flex items-center justify-between gap-2"><span className="truncate text-xs text-slate-500">{whenForList(request, request.stage)}</span><span className="whitespace-nowrap text-[13px] font-bold text-slate-950">{mdl(priceOf(request))}</span></span>
      </span>
    </button>
  );
}

function subtitle(request: ConsultationRequest) {
  const profile = request.patient_profile;
  return [ageLabel(profile?.age), request.patient?.name && request.patient.name !== profile?.name ? `titular ${request.patient.name}` : null, profile?.patient_code ? `#${profile.patient_code}` : `#${request.id}`].filter(Boolean).join(' · ');
}

function recordProgress(request: ConsultationRequest) {
  const record = request.patient_profile?.medical_record as MedicalRecord | null | undefined;
  return record ? `${countDone(record)} din ${MEDICAL_SECTIONS.length} secțiuni` : null;
}

function addressOf(request: ConsultationRequest) {
  const profile = request.patient_profile;
  return [profile?.address, profile?.locality].filter(Boolean).join(', ') || '—';
}

function Detail({ request, now, actions, linkState, onChart }: {
  request: ConsultationRequest & { stage: Stage }; now: number; actions: Actions; linkState: { returnTo: string }; onChart: () => void;
}) {
  const { primary, secondary, menu, hint } = actions;
  const homeVisits = useFeatureFlags().isEnabled('with_exam_consultations');
  const stage = request.stage;
  const banner = bannerFor(request, stage, now);
  const index = { new: 0, prop: 0, ask: 0, conf: 1, live: 2, done: 3, cancel: -1, expired: -1 }[stage];
  const service = request.service;
  const progress = recordProgress(request);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={nameOf(request)} size={52} />
          <div className="flex flex-col gap-[3px]"><h2 className="text-xl font-bold tracking-[-.01em] text-slate-950">{nameOf(request)}</h2><span className="text-[13px] text-slate-500">{subtitle(request)}</span></div>
        </div>
        <span className={cn('whitespace-nowrap rounded-full px-[11px] py-[5px] text-xs font-semibold', STAGE_TONE[stage])}>{stage === 'cancel' && request.status === 'rejected' ? 'Respinsă' : STAGE_LABEL[stage]}</span>
      </div>

      {index >= 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {['Cerere', 'Ora stabilită', 'În curs', 'Concluzie publicată'].map((label, i) => (
            <div key={label} className="flex flex-col gap-1.5">
              <div className={cn('h-1 rounded-sm', i <= index ? 'bg-blue-600' : 'bg-slate-200')} />
              <span className={cn('text-xs', i <= index ? 'text-slate-950' : 'text-slate-400', i === index ? 'font-semibold' : 'font-medium')}>{label}</span>
            </div>
          ))}
        </div>
      )}

      <BannerBox banner={banner} />

      <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><ServiceIcon type={service?.type ?? 'video'} className="h-[22px] w-[22px]" /></span>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-xs font-semibold tracking-[.04em] text-slate-500">SERVICIU ALES</span>
            <span className="text-base font-semibold text-slate-950">{service?.name ?? 'Consultație'}</span>
            {service && <span className="text-[13px] text-slate-500">{serviceMeta(service)}</span>}
          </div>
          <div className="flex flex-col items-end gap-0.5"><span className="text-[22px] font-bold text-slate-950">{mdl(priceOf(request))}</span><span className="text-xs text-slate-500">{stage === 'done' && request.payment_status !== 'captured' ? 'se transferă la închidere' : MONEY_NOTE[stage]}</span></div>
        </div>
        {service?.type === 'home' && (
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3.5">
            <div className="flex flex-col gap-1.5"><span className="text-xs text-slate-500">Investigații</span><InvestigationChips request={request} /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-slate-500">Adresa</span><span className="text-sm text-slate-950">{addressOf(request)}</span></div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-[18px] rounded-2xl border border-slate-200 bg-white p-5">
        <div className="col-span-2 flex flex-col gap-1.5"><span className="text-xs font-semibold tracking-[.04em] text-slate-500">ACUZE</span><span className="whitespace-pre-wrap text-[15px] leading-[1.55] text-slate-950">{request.symptoms || request.triage_notes || 'Pacientul nu a descris acuzele.'}</span></div>
        <div className="flex flex-col gap-1"><span className="text-xs font-semibold tracking-[.04em] text-slate-500">{['new', 'prop', 'ask'].includes(stage) ? 'ORA CERUTĂ' : 'PROGRAMARE'}</span><span className="text-[15px] font-semibold text-slate-950">{whenLabel(request.scheduled_at ?? request.created_at, true)}</span></div>
        <div className="flex flex-col gap-1"><span className="text-xs font-semibold tracking-[.04em] text-slate-500">FIȘA MEDICALĂ</span><button type="button" onClick={onChart} className="self-start text-sm font-medium text-blue-600 hover:underline">Vezi fișa{progress ? ` · ${progress}` : ''}</button></div>
      </div>

      {homeVisits && (['new', 'conf'] as Stage[]).includes(stage) && <HigoConsultationProposal requestId={request.id} />}

      {(primary || secondary.length > 0) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {primary && <ActionButton action={primary} primary linkState={linkState} />}
          {secondary.map((action) => <ActionButton key={action.label} action={action} linkState={linkState} />)}
          {menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Mai multe acțiuni" className="grid h-11 w-11 place-items-center rounded-[10px] border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"><MoreHorizontal className="h-[18px] w-[18px]" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="min-w-[280px] rounded-xl p-1.5">
                {menu.map((action) => (
                  <DropdownMenuItem key={action.label} onSelect={action.run} className={cn('h-10 cursor-pointer rounded-lg px-3 text-sm', action.danger ? 'text-red-600 focus:text-red-700' : 'text-slate-950')}>{action.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      {hint && <span className="-mt-1.5 text-[13px] text-slate-500">{hint}</span>}
    </div>
  );
}

function BannerBox({ banner }: { banner: Banner }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-xl border px-4 py-3.5', TONES[banner.tone])}>
      <span className="text-[15px] font-semibold text-[var(--banner)]">{banner.title}</span>
      <span className="text-[13px] leading-normal text-slate-700">{banner.text}</span>
      {banner.slots && banner.slots.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">{banner.slots.map((slot) => <span key={slot} className="rounded-lg border border-slate-200 bg-white px-2.5 py-[5px] text-[13px] font-semibold text-slate-950">{whenLabel(slot)}</span>)}</div>
      )}
      {banner.note && <span className="mt-1 rounded-lg bg-white px-3 py-2 text-sm text-slate-950">„{banner.note}”</span>}
    </div>
  );
}

function InvestigationChips({ request }: { request: ConsultationRequest }) {
  const items = request.service?.investigations ?? [];
  if (!items.length) return <span className="text-sm text-slate-500">Fără investigații</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item.id} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', item.requirement === 'optional' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700')}>
          {item.requirement === 'optional' ? `+ ${item.name} · ${mdl(item.price)}` : item.name}
        </span>
      ))}
    </div>
  );
}

function ActionButton({ action, primary = false, linkState, className }: { action: Action; primary?: boolean; linkState: { returnTo: string }; className?: string }) {
  const classes = cn('flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm whitespace-nowrap',
    primary ? cn('px-[18px] text-[15px] font-semibold text-white', action.disabled ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700')
      : action.danger ? 'border border-slate-200 bg-white font-medium text-red-600 hover:bg-red-50' : 'border border-slate-200 bg-white font-medium text-slate-950 hover:bg-slate-50', className);
  if (action.href) {
    return <Link to={action.href} state={action.video ? linkState : undefined} className={classes}>{action.video && <Video className="h-4 w-4" />}{action.href.includes('/chat') && !primary && <MessageSquare className="h-4 w-4" />}{action.label}</Link>;
  }
  return <button type="button" onClick={action.run} disabled={action.disabled} className={classes}>{action.label}</button>;
}

function MobileRequest({ request, now, actions, linkState, onBack, onChart }: {
  request: ConsultationRequest & { stage: Stage }; now: number; actions: Actions; linkState: { returnTo: string }; onBack: () => void; onChart: () => void;
}) {
  const stage = request.stage;
  const left = stage === 'new' ? leftLabel(request.doctor_reply_due_at, now) : ['prop', 'ask'].includes(stage) ? leftLabel(request.proposal?.expires_at, now) : null;
  const service = request.service;
  const banner = bannerFor(request, stage, now);
  const progress = recordProgress(request);
  // Pe telefon, meniul „⋯” devine butoane: secundarele și cele din meniu, pe două coloane.
  const extra = [...actions.secondary, ...actions.menu.filter((action) => action.label !== 'Finalizează direct')].map((action) => ({
    ...action,
    label: action.label === 'Propune altă oră' ? 'Altă oră' : action.label === 'Respinge și returnează banii' ? 'Refuză' : action.label
  }));

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50 lg:hidden">
      <div className="flex items-center gap-1 px-2 pb-2.5 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} aria-label="Înapoi" className="grid h-10 w-10 place-items-center text-slate-700"><ArrowLeft className="h-[22px] w-[22px]" /></button>
        <span className="flex-1 text-[17px] font-semibold text-slate-950">{STAGE_LABEL[stage]}</span>
        {left && <span className="mr-2 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">expiră în {left}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-1">
        <div className="flex items-center gap-3 px-0.5 py-1">
          <Avatar name={nameOf(request)} size={48} />
          <div className="flex flex-col gap-0.5"><span className="text-lg font-bold text-slate-950">{nameOf(request)}</span><span className="text-[13px] text-slate-500">{subtitle(request)}</span></div>
        </div>
        {stage !== 'new' && <BannerBox banner={banner} />}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex justify-between gap-2.5">
            <div className="flex flex-col gap-[3px]">
              <span className="text-[11px] font-semibold tracking-[.04em] text-slate-500">SERVICIU ALES</span>
              <span className="text-[15px] font-semibold text-slate-950">{service?.name ?? 'Consultație'}</span>
              {service && <span className="text-[13px] text-slate-500">{serviceMeta(service)}</span>}
            </div>
            <span className="whitespace-nowrap text-lg font-bold text-slate-950">{mdl(priceOf(request))}</span>
          </div>
          {service?.type === 'home' && (
            <>
              <InvestigationChips request={request} />
              <div className="flex items-start gap-2 border-t border-slate-100 pt-3 text-sm text-slate-950"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />{addressOf(request)}</div>
            </>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1"><span className="text-[11px] font-semibold tracking-[.04em] text-slate-500">ACUZE</span><span className="whitespace-pre-wrap text-[15px] leading-normal text-slate-950">{request.symptoms || 'Pacientul nu a descris acuzele.'}</span></div>
          <div className="flex flex-col gap-1 border-t border-slate-100 pt-3"><span className="text-[11px] font-semibold tracking-[.04em] text-slate-500">{['new', 'prop', 'ask'].includes(stage) ? 'ORA CERUTĂ' : 'PROGRAMARE'}</span><span className="text-[15px] font-semibold text-slate-950">{whenLabel(request.scheduled_at ?? request.created_at, true)}</span></div>
          <button type="button" onClick={onChart} className="border-t border-slate-100 pt-3 text-left text-sm font-medium text-blue-600">Vezi fișa medicală{progress ? ` · ${progress}` : ''}</button>
        </div>
        {stage === 'done' && <ConsultationDocuments requestId={request.id} compact />}
      </div>
      {(actions.primary || extra.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-3">
          {actions.primary && <ActionButton action={actions.primary} primary linkState={linkState} className="h-12 w-full" />}
          {extra.length > 0 && (
            <div className={cn('grid gap-2', extra.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
              {extra.map((action) => <ActionButton key={action.label} action={action} linkState={linkState} className="h-11 w-full px-2" />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
