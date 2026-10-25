import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Activity, CalendarClock, ChevronDown, ClipboardList, FileText, MessageSquare, Plus, Star, Stethoscope } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ListSkeleton } from '../../components/ui/skeleton';
import { PageHeader } from '../../components/app/PageHeader';
import { EmptyState } from '../../components/app/EmptyState';
import { StatusBadge } from '../../components/app/StatusBadge';
import { ConsultationDocuments } from '../../components/ConsultationDocuments';
import { ConsultationVideoButton } from '../../components/ConsultationVideoButton';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { apiRequest } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { CLOSED_STATUSES } from '../../lib/status';
import { consultationTitle, patientNextStep, type PatientConsultation } from '../../lib/patient-consultations';

const ACTIVE = ['new', 'accepted', 'rescheduled'];

export function PatientConsultationsPage() {
  const { isEnabled } = useFeatureFlags();
  const [requests, setRequests] = useState<PatientConsultation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await apiRequest<{ data: PatientConsultation[] }>('/requests');
      setRequests(response.data ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Consultațiile nu au putut fi încărcate.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => requests.filter((request) => ACTIVE.includes(request.status)), [requests]);
  const history = useMemo(() => requests.filter((request) => !ACTIVE.includes(request.status)), [requests]);
  const list = tab === 'active' ? active : history;

  const acceptProposal = async (request: PatientConsultation) => {
    setAcceptingId(request.id);
    try {
      await apiRequest(`/requests/${request.id}/accept-proposed-time`, { method: 'POST' });
      toast.success('Ora propusă a fost acceptată.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut accepta ora propusă.');
    } finally {
      setAcceptingId(null);
    }
  };

  const newConsultationPath = isEnabled('doctors') ? '/patient/doctors' : '/patient/operators';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultațiile mele"
        description="Toate cererile, programările și concluziile medicale, într-un singur loc."
        actions={(isEnabled('doctors') || isEnabled('operators')) && (
          <Button asChild><Link to={newConsultationPath}><Plus className="h-4 w-4" />Consultație nouă</Link></Button>
        )}
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'active' | 'history')}>
        <TabsList>
          <TabsTrigger value="active">În curs{active.length > 0 && <Count value={active.length} />}</TabsTrigger>
          <TabsTrigger value="history">Istoric{history.length > 0 && <Count value={history.length} muted />}</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>Reîncearcă</button></p>}

      {isLoading ? <ListSkeleton rows={3} /> : list.length === 0 ? (
        tab === 'active' ? (
          <EmptyState
            icon={ClipboardList}
            title="Nu ai consultații în curs"
            description="Alege un medic sau cere o examinare la domiciliu. Cererile active apar aici."
            action={(isEnabled('doctors') || isEnabled('operators')) && <Button asChild><Link to={newConsultationPath}>Solicită o consultație</Link></Button>}
          />
        ) : (
          <EmptyState icon={FileText} title="Istoricul este gol" description="Consultațiile finalizate și documentele PDF vor apărea aici." />
        )
      ) : (
        <div className="grid items-start gap-3 2xl:grid-cols-2">
          {list.map((request) => (
            <ConsultationCard
              key={request.id}
              request={request}
              accepting={acceptingId === request.id}
              onAcceptProposal={() => void acceptProposal(request)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Count({ value, muted = false }: { value: number; muted?: boolean }) {
  return <span className={`tabular rounded-full px-1.5 text-xs ${muted ? 'bg-slate-200 text-slate-600' : 'bg-primary text-white'}`}>{value}</span>;
}

function ConsultationCard({ request, accepting, onAcceptProposal }: { request: PatientConsultation; accepting: boolean; onAcceptProposal: () => void }) {
  const [showDocuments, setShowDocuments] = useState(false);
  const isOperator = request.type === 'operator';
  const Icon = isOperator ? Activity : Stethoscope;
  const provider = isOperator ? request.operator?.name : request.doctor?.name;
  const nextStep = patientNextStep(request);
  const closed = CLOSED_STATUSES.includes(request.status);

  return (
    <article className={`rounded-2xl border bg-white shadow-sm ${request.status === 'rescheduled' ? 'border-orange-200' : 'border-slate-200'}`}>
      <div className="flex gap-4 p-4 sm:p-5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${closed ? 'bg-slate-100 text-slate-400' : 'bg-primary/10 text-primary'}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="font-semibold text-slate-950">{consultationTitle(request)}</h2>
            <StatusBadge request={request} perspective="patient" />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[request.patient_profile?.name && `Pentru ${request.patient_profile.name}`, provider].filter(Boolean).join(' · ') || 'Fără specialist asignat încă'}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            {dateTime(request.scheduled_at || request.created_at)}
          </p>
          {request.symptoms && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{request.symptoms}</p>}
          {nextStep && (
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${request.status === 'rescheduled' ? 'bg-orange-50 text-orange-900' : 'bg-slate-50 text-slate-600'}`}>{nextStep}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
        {request.status === 'rescheduled' && request.proposed_scheduled_at && (
          <Button size="sm" onClick={onAcceptProposal} disabled={accepting}>
            {accepting ? 'Se confirmă…' : 'Acceptă ora propusă'}
          </Button>
        )}
        {request.status === 'accepted' && <ConsultationVideoButton requestId={request.id} />}
        {!closed && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/patient/chat?request=${request.id}`}><MessageSquare className="h-4 w-4" />Mesaje</Link>
          </Button>
        )}
        {request.status === 'completed' && (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowDocuments((value) => !value)} aria-expanded={showDocuments}>
              <FileText className="h-4 w-4" />Documente
              <ChevronDown className={`h-4 w-4 transition-transform ${showDocuments ? 'rotate-180' : ''}`} />
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to={`/patient/chat?request=${request.id}`}><MessageSquare className="h-4 w-4" />Discuția</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="text-slate-600">
              <Link to="/patient/complaints"><Star className="h-4 w-4" />Lasă o recenzie</Link>
            </Button>
          </>
        )}
      </div>

      {showDocuments && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <ConsultationDocuments requestId={request.id} compact />
        </div>
      )}
    </article>
  );
}
